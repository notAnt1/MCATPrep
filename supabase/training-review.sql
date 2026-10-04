-- Add targeted training and private completed-session question review.
begin;
create or replace function public.mcat_start_tagged(p_topic text default null, p_skill text default null, p_section text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare sid uuid; ids text[];
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 select id into sid from mcat_sessions where user_id=auth.uid() and completed_at is null;
 if sid is not null then return sid; end if;
 select array_agg(id) into ids from (
  select q.id from mcat_questions q where published
  and (p_topic is null or body->>'topic'=p_topic)
  and (p_skill is null or body->>'skill'=p_skill)
  and (p_section is null or body->>'section'=p_section)
  order by (select count(*) from mcat_attempts a where a.user_id=auth.uid() and a.question_id=q.id),random() limit 10
 ) chosen;
 if coalesce(array_length(ids,1),0)=0 then raise exception 'No questions match these tags. Try a different topic, section, or question type.'; end if;
 insert into mcat_sessions(user_id,mode,question_ids) values(auth.uid(),'training',ids) returning id into sid;
 return sid;
end $$;
create or replace function public.mcat_review(p_session uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s mcat_sessions; result jsonb;
begin
 select * into s from mcat_sessions where id=p_session and user_id=auth.uid();
 if s.id is null then raise exception 'Session not found'; end if;
 if s.completed_at is null then raise exception 'Finish the session before reviewing questions'; end if;
 select coalesce(jsonb_agg(q.body order by array_position(s.question_ids,q.id)),'[]'::jsonb) into result
 from mcat_attempts a join mcat_questions q on q.id=a.question_id and (q.body->>'version')::int=a.question_version
 where a.session_id=s.id and a.user_id=auth.uid();
 return result;
end $$;
revoke all on function public.mcat_start_tagged(text,text,text),public.mcat_review(uuid) from public,anon;
grant execute on function public.mcat_start_tagged(text,text,text),public.mcat_review(uuid) to authenticated;
commit;
