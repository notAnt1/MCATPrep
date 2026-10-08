-- Optional tutoring after a saved answer. No question or student records are modified.
create table if not exists public.mcat_tutor_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.mcat_sessions(id) on delete cascade,
  question_id text not null,
  created_at timestamptz not null default now()
);
create index if not exists mcat_tutor_usage_time on public.mcat_tutor_usage(created_at);
create index if not exists mcat_tutor_usage_user_time on public.mcat_tutor_usage(user_id,created_at);
alter table public.mcat_tutor_usage enable row level security;
revoke all on public.mcat_tutor_usage from anon, authenticated;

create or replace function public.mcat_claim_tutor(p_session uuid, p_question text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u uuid := auth.uid();
  context jsonb;
  used integer;
  question_used integer;
begin
  if u is null then raise exception 'Sign in first'; end if;
  select jsonb_build_object('question',q.body,'selected',a.selected,'correct',a.correct)
  into context from mcat_attempts a join mcat_questions q on q.id=a.question_id
  where a.user_id=u and a.session_id=p_session and a.question_id=p_question
    and a.question_version=(q.body->>'version')::integer;
  if context is null then return jsonb_build_object('error','unavailable'); end if;
  -- Serialize quota reservations across workers; the lock lasts only this transaction.
  perform pg_advisory_xact_lock(726281493);
  select count(*),count(*) filter(where question_id=p_question)
    into used,question_used from mcat_tutor_usage
    where user_id=u and created_at>now()-interval '24 hours';
  if used>=20 or question_used>=8 or
    (select count(*) from mcat_tutor_usage where created_at>now()-interval '24 hours')>=1000 then
    return jsonb_build_object('error','limit');
  end if;
  insert into mcat_tutor_usage(user_id,session_id,question_id) values(u,p_session,p_question);
  return context || jsonb_build_object('remaining',least(19-used,7-question_used));
end;
$$;
revoke all on function public.mcat_claim_tutor(uuid,text) from public,anon;
grant execute on function public.mcat_claim_tutor(uuid,text) to authenticated;
