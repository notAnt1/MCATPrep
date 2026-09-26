-- Run this file, then seed.sql, in your Supabase SQL Editor.
-- Additive setup: no existing user records are deleted.
begin;
create table if not exists public.mcat_questions (
 id text primary key, body jsonb not null, published boolean not null default true
);
create table if not exists public.mcat_sessions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 mode text not null check(mode in ('training','rapid')), question_ids text[] not null,
 cursor integer not null default 0, hints_used integer not null default 0,
 question_started_at timestamptz, created_at timestamptz not null default now(),
 completed_at timestamptz, score integer not null default 0,
 report_claimed_at timestamptz, report_tries integer not null default 0
);
create unique index if not exists mcat_one_active_session on public.mcat_sessions(user_id) where completed_at is null;
create table if not exists public.mcat_attempts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null references public.mcat_sessions(id) on delete cascade,
 question_id text not null, question_version integer not null, selected integer not null,
 topic text not null, section text not null, skill text not null, mode text not null,
 correct boolean not null, active_ms integer not null, target_seconds integer not null,
 hints_used integer not null, repeated boolean not null, timing_valid boolean not null,
 points integer not null, created_at timestamptz not null default now(),
 unique(session_id,question_id)
);
create index if not exists mcat_attempts_user_time on public.mcat_attempts(user_id,created_at);
create table if not exists public.mcat_reports (
 session_id uuid primary key references public.mcat_sessions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 report jsonb not null, created_at timestamptz not null default now()
);
create table if not exists public.mcat_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(length(display_name) between 1 and 30),
 leaderboard_opt_in boolean not null default false
);
alter table public.mcat_questions enable row level security;
alter table public.mcat_sessions enable row level security;
alter table public.mcat_attempts enable row level security;
alter table public.mcat_reports enable row level security;
alter table public.mcat_profiles enable row level security;
revoke all on public.mcat_questions,public.mcat_sessions,public.mcat_attempts,public.mcat_reports,public.mcat_profiles from anon,authenticated;
grant select on public.mcat_sessions,public.mcat_attempts,public.mcat_reports to authenticated;
grant select,insert,update on public.mcat_profiles to authenticated;
drop policy if exists own_sessions on public.mcat_sessions;
create policy own_sessions on public.mcat_sessions for select to authenticated using(user_id=auth.uid());
drop policy if exists own_attempts on public.mcat_attempts;
create policy own_attempts on public.mcat_attempts for select to authenticated using(user_id=auth.uid());
drop policy if exists own_reports on public.mcat_reports;
create policy own_reports on public.mcat_reports for select to authenticated using(user_id=auth.uid());
drop policy if exists own_profile on public.mcat_profiles;
create policy own_profile on public.mcat_profiles for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create or replace function public.mcat_start(p_mode text, p_topic text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare sid uuid; ids text[];
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if p_mode not in ('training','rapid') then raise exception 'Invalid mode'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 select id into sid from mcat_sessions where user_id=auth.uid() and completed_at is null;
 if sid is not null then return sid; end if;
 select array_agg(id) into ids from (
   select q.id from mcat_questions q where published and (p_topic is null or body->>'topic'=p_topic)
   order by (select count(*) from mcat_attempts a where a.user_id=auth.uid() and a.question_id=q.id),random() limit 10
 ) chosen;
 if coalesce(array_length(ids,1),0)=0 then raise exception 'No published questions. Run seed.sql.'; end if;
 insert into mcat_sessions(user_id,mode,question_ids) values(auth.uid(),p_mode,ids) returning id into sid;
 return sid;
end $$;

create or replace function public.mcat_current(p_session uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s mcat_sessions; q jsonb;
begin
 select * into s from mcat_sessions where id=p_session and user_id=auth.uid() for update;
 if s.id is null then raise exception 'Session not found'; end if;
 if s.completed_at is null then
  if s.question_started_at is null then
   update mcat_sessions set question_started_at=clock_timestamp() where id=s.id returning * into s;
  end if;
  select body into q from mcat_questions where id=s.question_ids[s.cursor+1];
 end if;
 return jsonb_build_object('session',to_jsonb(s)-'user_id'-'report_claimed_at'-'report_tries',
  'question',q-'answer'-'explanation'-'hints','hints_used',s.hints_used,
  'revealed_hints',case when q is null then '[]'::jsonb else coalesce((select jsonb_agg(v) from jsonb_array_elements(q->'hints') with ordinality as h(v,n) where n<=s.hints_used),'[]'::jsonb) end);
end $$;

create or replace function public.mcat_hint(p_session uuid,p_question text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s mcat_sessions; q jsonb;
begin
 select * into s from mcat_sessions where id=p_session and user_id=auth.uid() for update;
 if s.id is null or s.completed_at is not null or s.question_ids[s.cursor+1]<>p_question then raise exception 'Question no longer active'; end if;
 if s.mode<>'training' then raise exception 'Hints are available in training'; end if;
 select body into q from mcat_questions where id=p_question;
 update mcat_sessions set hints_used=least(hints_used+1,jsonb_array_length(q->'hints')) where id=s.id;
 return public.mcat_current(s.id);
end $$;

create or replace function public.mcat_answer(p_session uuid,p_question text,p_selected integer,p_active_ms integer,p_timing_valid boolean default true)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s mcat_sessions; q jsonb; a mcat_attempts; ok boolean; rpt boolean; pts integer; elapsed integer; valid boolean;
begin
 select * into s from mcat_sessions where id=p_session and user_id=auth.uid() for update;
 if s.id is null then raise exception 'Session not found'; end if;
 select * into a from mcat_attempts where session_id=s.id and question_id=p_question;
 if a.id is not null then
  select body into q from mcat_questions where id=p_question;
  return jsonb_build_object('correct',a.correct,'answer',(q->>'answer')::int,'explanation',q->>'explanation','points',a.points);
 end if;
 if s.completed_at is not null or s.question_ids[s.cursor+1]<>p_question or s.question_started_at is null then raise exception 'Question no longer active'; end if;
 select body into q from mcat_questions where id=p_question;
 if p_selected < 0 or p_selected >= jsonb_array_length(q->'options') or p_selected is null then raise exception 'Choose an answer'; end if;
 if p_active_ms is null or p_active_ms<0 or p_active_ms>86400000 then raise exception 'Invalid timing'; end if;
 elapsed:=greatest(0,least(86400000,extract(epoch from (clock_timestamp()-s.question_started_at))*1000))::int;
 valid:=coalesce(p_timing_valid,false) and p_active_ms<=elapsed+3000 and p_active_ms>=1000;
 ok:=p_selected=(q->>'answer')::int;
 rpt:=exists(select 1 from mcat_attempts where user_id=auth.uid() and question_id=p_question);
 -- Score uses server wall time, not client-supplied active time. Repeats earn no ranked points.
 pts:=case when ok and not rpt then 100+case when s.mode='rapid' then greatest(0,round(50*(1-least(1.0,elapsed/1000.0/(q->>'target_seconds')::int))))::int else 0 end else 0 end;
 insert into mcat_attempts(user_id,session_id,question_id,question_version,selected,topic,section,skill,mode,correct,active_ms,target_seconds,hints_used,repeated,timing_valid,points)
 values(auth.uid(),s.id,p_question,(q->>'version')::int,p_selected,q->>'topic',q->>'section',q->>'skill',s.mode,ok,p_active_ms,(q->>'target_seconds')::int,s.hints_used,rpt,valid,pts);
 update mcat_sessions set cursor=cursor+1,hints_used=0,question_started_at=null,score=score+pts,
 completed_at=case when cursor+1>=array_length(question_ids,1) then clock_timestamp() else null end where id=s.id;
 return jsonb_build_object('correct',ok,'answer',(q->>'answer')::int,'explanation',q->>'explanation','points',pts);
end $$;

create or replace function public.mcat_finish(p_session uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 update mcat_sessions set completed_at=coalesce(completed_at,clock_timestamp()) where id=p_session and user_id=auth.uid();
 if not found then raise exception 'Session not found'; end if;
end $$;

create or replace function public.mcat_claim_report(p_session uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare s mcat_sessions;
begin
 if auth.uid() is null then return false; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 select * into s from mcat_sessions where id=p_session and user_id=auth.uid() for update;
 if s.id is null or s.completed_at is null or s.cursor=0 or s.report_tries>=3 then return false; end if;
 if exists(select 1 from mcat_reports where session_id=s.id) then return false; end if;
 if s.report_claimed_at>now()-interval '2 minutes' then return false; end if;
 if (select coalesce(sum(report_tries),0) from mcat_sessions where user_id=auth.uid() and report_claimed_at>now()-interval '1 day')>=10 then return false; end if;
 update mcat_sessions set report_claimed_at=now(),report_tries=report_tries+1 where id=s.id;
 return true;
end $$;

create or replace function public.mcat_save_report(p_session uuid,p_report jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from mcat_sessions where id=p_session and user_id=auth.uid() and completed_at is not null and report_claimed_at is not null) then raise exception 'Report not requested'; end if;
 if octet_length(p_report::text)>30000 then raise exception 'Report too large'; end if;
 insert into mcat_reports(session_id,user_id,report) values(p_session,auth.uid(),p_report) on conflict(session_id) do nothing;
end $$;

create or replace function public.mcat_leaderboard()
returns table(display_name text,score bigint,rounds bigint) language sql security definer set search_path=public as $$
 select p.display_name,sum(s.score)::bigint,count(*)::bigint from mcat_profiles p join mcat_sessions s on s.user_id=p.user_id
 where auth.uid() is not null and p.leaderboard_opt_in and s.mode='rapid' and s.completed_at is not null
 and s.cursor=array_length(s.question_ids,1) and s.created_at>=date_trunc('week',now())
 group by p.user_id,p.display_name order by sum(s.score) desc limit 20;
$$;
revoke all on function public.mcat_start(text,text),public.mcat_current(uuid),public.mcat_hint(uuid,text),public.mcat_answer(uuid,text,integer,integer,boolean),public.mcat_finish(uuid),public.mcat_claim_report(uuid),public.mcat_save_report(uuid,jsonb),public.mcat_leaderboard() from public,anon;
grant execute on function public.mcat_start(text,text),public.mcat_current(uuid),public.mcat_hint(uuid,text),public.mcat_answer(uuid,text,integer,integer,boolean),public.mcat_finish(uuid),public.mcat_claim_report(uuid),public.mcat_save_report(uuid,jsonb),public.mcat_leaderboard() to authenticated;
commit;

-- Original starter questions. Existing versions are preserved.
insert into public.mcat_questions(id,body) values
('sample-01', '{"id":"sample-01","topic":"Dilution","section":"C/P","skill":"Concept application","difficulty":"Foundational","prompt":"A 20 mL sample of 0.30 M glucose is diluted to a total volume of 60 mL. What is the final concentration?","options":["0.05 M","0.10 M","0.30 M","0.90 M"],"answer":1,"explanation":"Dilution conserves solute: C₂ = C₁V₁/V₂ = 0.30 × 20/60 = 0.10 M. The volume triples, so concentration falls to one third.","hints":["Use conservation of moles.","Write C₁V₁ = C₂V₂. Use the final total volume."],"target_seconds":60,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-02', '{"id":"sample-02","topic":"Dilution","section":"C/P","skill":"Concept application","difficulty":"Foundational","prompt":"How many moles of NaCl are present in 250 mL of a 0.20 M solution?","options":["0.80 mol","0.050 mol","50 mol","0.008 mol"],"answer":1,"explanation":"Convert 250 mL to 0.250 L, then n = CV = 0.20 × 0.250 = 0.050 mol.","hints":["Molarity is moles per liter.","Convert the volume to liters before multiplying."],"target_seconds":60,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-03', '{"id":"sample-03","topic":"Dilution","section":"C/P","skill":"Concept application","difficulty":"Foundational","prompt":"Equal volumes of 0.10 M and 0.30 M glucose are mixed. Assuming additive volumes, what is the resulting concentration?","options":["0.10 M","0.15 M","0.20 M","0.40 M"],"answer":2,"explanation":"For equal volumes, the total moles divided by total volume gives the average concentration: (0.10 + 0.30)/2 = 0.20 M.","hints":["Add moles, not concentrations.","Choose 1 L of each solution to simplify the calculation."],"target_seconds":60,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-04', '{"id":"sample-04","topic":"Dilution","section":"C/P","skill":"Concept application","difficulty":"Foundational","prompt":"A 0.020 M solution of AlCl₃ dissociates completely. What is the chloride-ion concentration?","options":["0.0067 M","0.020 M","0.040 M","0.060 M"],"answer":3,"explanation":"Each formula unit yields three chloride ions. [Cl⁻] = 3 × 0.020 = 0.060 M.","hints":["Read the chloride subscript.","One mole of AlCl₃ yields three moles of chloride ions."],"target_seconds":45,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-05', '{"id":"sample-05","topic":"Stoichiometry","section":"C/P","skill":"Concept application","difficulty":"Foundational","prompt":"For 2 H₂ + O₂ → 2 H₂O, 0.30 mol H₂ reacts with excess oxygen. How much water forms?","options":["0.15 mol","0.30 mol","0.60 mol","0.90 mol"],"answer":1,"explanation":"The coefficient ratio H₂:H₂O is 2:2, or 1:1. Therefore 0.30 mol H₂ produces 0.30 mol H₂O.","hints":["Use the reactant-to-product coefficient ratio.","The coefficients of hydrogen and water are equal."],"target_seconds":60,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-06', '{"id":"sample-06","topic":"Stoichiometry","section":"C/P","skill":"Quantitative reasoning","difficulty":"Foundational","prompt":"For N₂ + 3 H₂ → 2 NH₃, a mixture contains 0.20 mol N₂ and 0.30 mol H₂. What is the maximum NH₃ yield?","options":["0.10 mol","0.20 mol","0.30 mol","0.40 mol"],"answer":1,"explanation":"Hydrogen is limiting: 0.30/3 = 0.10 mol reaction units, producing 0.10 × 2 = 0.20 mol NH₃.","hints":["Identify the limiting reactant first.","Divide each reactant amount by its coefficient and compare."],"target_seconds":90,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-07', '{"id":"sample-07","topic":"Stoichiometry","section":"C/P","skill":"Quantitative reasoning","difficulty":"Foundational","prompt":"CaCO₃ → CaO + CO₂. If 5.0 g CaCO₃ decomposes completely, how many grams of CO₂ form? Use 100 g/mol for CaCO₃ and 44 g/mol for CO₂.","options":["1.1 g","2.2 g","4.4 g","5.0 g"],"answer":1,"explanation":"5.0/100 = 0.050 mol CaCO₃. The 1:1 ratio yields 0.050 mol CO₂; multiplying by 44 g/mol gives 2.2 g.","hints":["Convert mass to moles first.","Use the 1:1 mole ratio, then convert product moles to grams."],"target_seconds":90,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-08', '{"id":"sample-08","topic":"Stoichiometry","section":"C/P","skill":"Quantitative reasoning","difficulty":"Foundational","prompt":"For 4 Al + 3 O₂ → 2 Al₂O₃, 0.20 mol Al reacts completely with 0.25 mol O₂ initially present. How much O₂ remains?","options":["0.05 mol","0.10 mol","0.15 mol","0.20 mol"],"answer":1,"explanation":"O₂ consumed = 0.20 × 3/4 = 0.15 mol. Remaining O₂ = 0.25 − 0.15 = 0.10 mol.","hints":["Calculate oxygen consumed before subtracting.","Multiply aluminum moles by 3/4, then subtract from the initial oxygen."],"target_seconds":90,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-09', '{"id":"sample-09","topic":"Enzyme kinetics","section":"B/B","skill":"Concept application","difficulty":"Foundational","prompt":"A reversible competitive inhibitor has which effect on Michaelis–Menten parameters?","options":["Decreases Vmax only","Increases apparent Km; Vmax unchanged","Decreases Km and Vmax","Increases Vmax only"],"answer":1,"explanation":"A competitive inhibitor competes for the active site. More substrate is needed for half-maximal velocity, increasing apparent Km; sufficient substrate restores the same Vmax.","hints":["Consider whether excess substrate can overcome inhibition.","Competitive inhibition changes substrate concentration needed, not maximum catalytic capacity."],"target_seconds":60,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-10', '{"id":"sample-10","topic":"Enzyme kinetics","section":"B/B","skill":"Concept application","difficulty":"Foundational","prompt":"For an enzyme following Michaelis–Menten kinetics, what is v when [S] = Km?","options":["Vmax","Vmax/4","Vmax/2","2Vmax"],"answer":2,"explanation":"v = Vmax[S]/(Km + [S]). When [S] = Km, the numerator is VmaxKm and the denominator is 2Km, giving Vmax/2.","hints":["Substitute into the Michaelis–Menten equation.","The denominator becomes twice Km."],"target_seconds":60,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-11', '{"id":"sample-11","topic":"Enzyme kinetics","section":"B/B","skill":"Concept application","difficulty":"Foundational","prompt":"An ideal pure noncompetitive inhibitor changes which parameters?","options":["Vmax decreases; Km unchanged","Vmax unchanged; Km increases","Both increase","Both remain unchanged"],"answer":0,"explanation":"In pure noncompetitive inhibition, inhibitor affinity for free enzyme and enzyme–substrate complex is equal. Vmax falls while Km stays the same. Mixed inhibition need not preserve Km.","hints":["Distinguish pure noncompetitive inhibition from mixed inhibition.","Effective catalytic capacity decreases without changing substrate affinity in the ideal case."],"target_seconds":60,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-12', '{"id":"sample-12","topic":"Enzyme kinetics","section":"B/B","skill":"Concept application","difficulty":"Foundational","prompt":"On a Lineweaver–Burk plot of 1/v against 1/[S], the y-intercept equals:","options":["Km","−1/Km","Vmax","1/Vmax"],"answer":3,"explanation":"Taking the reciprocal gives 1/v = (Km/Vmax)(1/[S]) + 1/Vmax. The constant term is the y-intercept.","hints":["Compare the reciprocal equation with y = mx + b.","The term that does not multiply 1/[S] is the intercept."],"target_seconds":60,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-13', '{"id":"sample-13","topic":"Membrane transport","section":"B/B","skill":"Concept application","difficulty":"Foundational","prompt":"A substance moves down its concentration gradient through a carrier protein without ATP use. This is:","options":["Primary active transport","Facilitated diffusion","Endocytosis","Secondary active transport"],"answer":1,"explanation":"Facilitated diffusion uses a membrane protein to move a substance down its gradient without direct energy input. Active transport couples movement to an energy source.","hints":["Consider both direction and energy use.","A carrier protein does not automatically make transport active."],"target_seconds":45,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-14', '{"id":"sample-14","topic":"Membrane transport","section":"B/B","skill":"Concept application","difficulty":"Foundational","prompt":"The sodium–potassium ATPase typically transports, per ATP hydrolyzed:","options":["3 Na⁺ out and 2 K⁺ in","2 Na⁺ out and 3 K⁺ in","3 Na⁺ in and 2 K⁺ out","2 Na⁺ in and 2 K⁺ out"],"answer":0,"explanation":"The pump exports three sodium ions and imports two potassium ions per ATP, creating a net outward positive charge.","hints":["The pump is electrogenic.","More positive ions leave than enter in each cycle."],"target_seconds":45,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-15', '{"id":"sample-15","topic":"Membrane transport","section":"B/B","skill":"Concept application","difficulty":"Foundational","prompt":"A cell is placed in a solution with a higher concentration of nonpenetrating solutes than its cytoplasm. What initially happens?","options":["Water enters and the cell swells","Water leaves and the cell shrinks","No net water movement","Solutes must all leave the cell"],"answer":1,"explanation":"The external solution is hypertonic. Water moves outward toward the higher effective solute concentration, shrinking the cell.","hints":["Only nonpenetrating solutes determine this tonicity comparison.","Water moves toward the compartment with more nonpenetrating solute."],"target_seconds":60,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-16', '{"id":"sample-16","topic":"Membrane transport","section":"B/B","skill":"Concept application","difficulty":"Foundational","prompt":"Which molecule most readily crosses a pure phospholipid bilayer by simple diffusion?","options":["Na⁺","Glucose","O₂","A large charged peptide"],"answer":2,"explanation":"Small nonpolar molecules such as oxygen cross the hydrophobic bilayer readily. Ions and large polar molecules face much larger barriers.","hints":["Think about the hydrophobic interior of the membrane.","Small size and lack of charge favor simple diffusion."],"target_seconds":45,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-17', '{"id":"sample-17","topic":"Circuits","section":"C/P","skill":"Concept application","difficulty":"Foundational","prompt":"A 12 V potential difference is applied across a 4 Ω resistor. What current flows?","options":["0.33 A","3 A","8 A","48 A"],"answer":1,"explanation":"Ohm’s law gives I = V/R = 12/4 = 3 A.","hints":["Use Ohm’s law.","Solve V = IR for current."],"target_seconds":60,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-18', '{"id":"sample-18","topic":"Circuits","section":"C/P","skill":"Quantitative reasoning","difficulty":"Foundational","prompt":"Two resistors of 3 Ω and 6 Ω are connected in parallel. What is their equivalent resistance?","options":["2 Ω","3 Ω","9 Ω","18 Ω"],"answer":0,"explanation":"1/R = 1/3 + 1/6 = 1/2, so R = 2 Ω. Parallel resistance is lower than the smallest branch resistance.","hints":["Add reciprocals for parallel resistors.","Use a common denominator of six."],"target_seconds":75,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-19', '{"id":"sample-19","topic":"Circuits","section":"C/P","skill":"Concept application","difficulty":"Foundational","prompt":"A resistor carries 2 A with a 6 V potential difference. How much power does it dissipate?","options":["3 W","8 W","12 W","24 W"],"answer":2,"explanation":"Electrical power P = IV = 2 × 6 = 12 W.","hints":["Power is energy transferred per unit time.","Use P = IV."],"target_seconds":45,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-20', '{"id":"sample-20","topic":"Circuits","section":"C/P","skill":"Concept application","difficulty":"Foundational","prompt":"Two ideal resistors in series have which quantity necessarily equal through each?","options":["Voltage drop","Resistance","Power dissipation","Current"],"answer":3,"explanation":"A series path has no branch points, so charge conservation requires the same current through both resistors. Voltage drops depend on resistance.","hints":["Consider conservation of charge along a single path.","Charge cannot accumulate indefinitely between the resistors."],"target_seconds":45,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-21', '{"id":"sample-21","topic":"Learning & memory","section":"P/S","skill":"Concept application","difficulty":"Foundational","prompt":"A student studies more often after an unpleasant reminder stops whenever they study. This illustrates:","options":["Positive punishment","Negative reinforcement","Negative punishment","Extinction"],"answer":1,"explanation":"Removing an aversive stimulus increases studying, so this is negative reinforcement. Negative means removal; reinforcement means the behavior increases.","hints":["Separate adding/removing a stimulus from increasing/decreasing behavior.","An unpleasant stimulus is removed and the behavior increases."],"target_seconds":60,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-22', '{"id":"sample-22","topic":"Learning & memory","section":"P/S","skill":"Concept application","difficulty":"Foundational","prompt":"An old password interferes with remembering a new password. This is:","options":["Retroactive interference","Proactive interference","Classical conditioning","State-dependent memory"],"answer":1,"explanation":"Proactive interference occurs when earlier learning disrupts recall of newer material. Retroactive interference is the reverse direction.","hints":["Identify which memory interferes with which.","The old memory acts forward on the new memory."],"target_seconds":45,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-23', '{"id":"sample-23","topic":"Learning & memory","section":"P/S","skill":"Concept application","difficulty":"Foundational","prompt":"A previously conditioned response weakens when the conditioned stimulus is repeatedly presented without the unconditioned stimulus. This is:","options":["Generalization","Acquisition","Extinction","Discrimination"],"answer":2,"explanation":"Repeated unreinforced presentations of the conditioned stimulus reduce the conditioned response: extinction. This does not necessarily erase the original association.","hints":["The association is no longer reinforced.","The response becomes weaker over repeated trials."],"target_seconds":45,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-24', '{"id":"sample-24","topic":"Learning & memory","section":"P/S","skill":"Concept application","difficulty":"Foundational","prompt":"Remembering how to ride a bicycle primarily involves:","options":["Episodic memory","Semantic memory","Procedural memory","Sensory memory"],"answer":2,"explanation":"Procedural memory supports learned skills and actions. Episodic memory concerns events; semantic memory concerns facts and concepts.","hints":["Distinguish knowing how from knowing that.","Motor skills are a form of implicit memory."],"target_seconds":45,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-25', '{"id":"sample-25","topic":"Dilution","section":"C/P","skill":"Concept application","difficulty":"Foundational","prompt":"What volume of 2.0 M stock is required to prepare 100 mL of 0.10 M solution?","options":["5 mL","10 mL","20 mL","50 mL"],"answer":0,"explanation":"C₁V₁ = C₂V₂, so V₁ = 0.10 × 100 / 2.0 = 5 mL. Dilute that stock to a final total of 100 mL.","hints":["Conserve solute moles.","Rearrange the dilution equation to solve for the stock volume."],"target_seconds":60,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-26', '{"id":"sample-26","topic":"Dilution","section":"C/P","skill":"Concept application","difficulty":"Foundational","prompt":"100 mL of 0.50 M glucose loses water by evaporation until 50 mL remains. No glucose is lost. What is the new concentration?","options":["0.25 M","0.50 M","1.0 M","2.0 M"],"answer":2,"explanation":"Halving the volume while retaining all solute doubles its concentration, from 0.50 M to 1.0 M.","hints":["The number of solute moles stays constant.","Divide the original volume by the remaining volume."],"target_seconds":60,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-27', '{"id":"sample-27","topic":"Stoichiometry","section":"C/P","skill":"Concept application","difficulty":"Foundational","prompt":"2 KClO₃ → 2 KCl + 3 O₂. How much O₂ forms when 0.40 mol KClO₃ decomposes completely?","options":["0.20 mol","0.40 mol","0.60 mol","1.20 mol"],"answer":2,"explanation":"The O₂:KClO₃ coefficient ratio is 3:2. Thus 0.40 × 3/2 = 0.60 mol O₂ forms.","hints":["Read the balanced coefficients.","Multiply the reactant amount by the product-to-reactant ratio."],"target_seconds":60,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-28', '{"id":"sample-28","topic":"Stoichiometry","section":"C/P","skill":"Concept application","difficulty":"Foundational","prompt":"A reaction has a theoretical product yield of 8.0 g and an actual yield of 6.0 g. What is the percent yield?","options":["25%","60%","75%","133%"],"answer":2,"explanation":"Percent yield = actual/theoretical × 100 = 6.0/8.0 × 100 = 75%.","hints":["Compare the obtained mass with the maximum predicted mass.","Actual yield is the numerator."],"target_seconds":60,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-29', '{"id":"sample-29","topic":"Enzyme kinetics","section":"B/B","skill":"Concept application","difficulty":"Foundational","prompt":"At saturating substrate concentration, doubling the amount of active enzyme does what to Vmax?","options":["Halves it","Leaves it unchanged","Doubles it","Quadruples it"],"answer":2,"explanation":"Vmax = kcat × total active enzyme concentration. Doubling active enzyme doubles Vmax if other conditions remain constant.","hints":["Vmax depends on the number of catalytic sites.","The proportionality to enzyme concentration is linear."],"target_seconds":60,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-30', '{"id":"sample-30","topic":"Enzyme kinetics","section":"B/B","skill":"Quantitative reasoning","difficulty":"Foundational","prompt":"An enzyme has Vmax = 90 μmol/min and Km = 2 mM. At [S] = 4 mM, what is its initial rate under Michaelis–Menten kinetics?","options":["30 μmol/min","45 μmol/min","60 μmol/min","90 μmol/min"],"answer":2,"explanation":"v = Vmax[S]/(Km + [S]) = 90 × 4/(2 + 4) = 60 μmol/min.","hints":["Use the Michaelis–Menten equation.","The substrate fraction is 4/(2 + 4)."],"target_seconds":90,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-31', '{"id":"sample-31","topic":"Membrane transport","section":"B/B","skill":"Concept application","difficulty":"Foundational","prompt":"A sodium–glucose symporter uses the sodium gradient to move glucose against its gradient. This is:","options":["Simple diffusion","Facilitated diffusion","Primary active transport","Secondary active transport"],"answer":3,"explanation":"Secondary active transport couples favorable movement of one species down its electrochemical gradient to unfavorable movement of another. The transporter does not directly hydrolyze ATP.","hints":["Identify the immediate energy source for this transporter.","An existing ion gradient provides the energy."],"target_seconds":60,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-32', '{"id":"sample-32","topic":"Membrane transport","section":"B/B","skill":"Concept application","difficulty":"Foundational","prompt":"In a pure lipid bilayer, increasing the proportion of unsaturated fatty-acid tails generally has what effect at a fixed moderate temperature?","options":["Increases fluidity","Decreases fluidity","Eliminates the hydrophobic core","Makes all ions freely permeable"],"answer":0,"explanation":"Cis double bonds introduce kinks that reduce close packing of lipid tails, generally increasing membrane fluidity.","hints":["Consider how tightly the tails can pack.","Kinked tails have fewer close contacts with neighboring tails."],"target_seconds":60,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-33', '{"id":"sample-33","topic":"Circuits","section":"C/P","skill":"Quantitative reasoning","difficulty":"Foundational","prompt":"A 2 Ω and a 4 Ω resistor are connected in series to an ideal 12 V source. What is the voltage across the 4 Ω resistor?","options":["2 V","4 V","6 V","8 V"],"answer":3,"explanation":"Total resistance is 6 Ω, so current is 12/6 = 2 A. The drop across 4 Ω is IR = 2 × 4 = 8 V.","hints":["Find total resistance, then the series current.","Use the common current to calculate the drop across 4 Ω."],"target_seconds":90,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-34', '{"id":"sample-34","topic":"Circuits","section":"C/P","skill":"Concept application","difficulty":"Foundational","prompt":"A 2 μF capacitor is connected across a 3 V source. How much charge does it store?","options":["0.67 μC","1.5 μC","5 μC","6 μC"],"answer":3,"explanation":"Q = CV = 2 μF × 3 V = 6 μC.","hints":["Capacitance relates stored charge to voltage.","Use Q = CV and retain the micro prefix."],"target_seconds":60,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-35', '{"id":"sample-35","topic":"Learning & memory","section":"P/S","skill":"Concept application","difficulty":"Foundational","prompt":"Remembering what you ate at your own birthday dinner last year primarily involves:","options":["Procedural memory","Episodic memory","Classical conditioning","Sensory memory"],"answer":1,"explanation":"Episodic memory concerns personally experienced events in their temporal and contextual setting.","hints":["This is a personally experienced event.","Distinguish autobiographical events from general facts."],"target_seconds":45,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb),
('sample-36', '{"id":"sample-36","topic":"Learning & memory","section":"P/S","skill":"Concept application","difficulty":"Foundational","prompt":"A learned response occurs to a new stimulus similar to the original conditioned stimulus. This is:","options":["Stimulus discrimination","Spontaneous recovery","Stimulus generalization","Negative reinforcement"],"answer":2,"explanation":"Stimulus generalization occurs when stimuli resembling the conditioned stimulus also evoke the learned response.","hints":["Focus on the similarity between the two stimuli.","The response extends beyond the exact original stimulus."],"target_seconds":45,"version":1,"source":"Original AI-authored starter question · not official MCAT material","passage":null}'::jsonb)
on conflict(id) do nothing;
