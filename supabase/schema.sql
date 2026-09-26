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
