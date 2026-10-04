-- Additive grouped practice API. Legacy sessions and single-question API remain usable.
BEGIN;
ALTER TABLE public.mcat_sessions ADD COLUMN IF NOT EXISTS unit_hints jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.mcat_start_units(p_mode text,p_topic text DEFAULT NULL,p_skill text DEFAULT NULL,p_section text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid; ids text[] := '{}'; g record;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF p_mode NOT IN ('training','rapid') OR p_mode IS NULL THEN RAISE EXCEPTION 'Invalid mode'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(auth.uid()::text));
 SELECT id INTO sid FROM mcat_sessions WHERE user_id=auth.uid() AND completed_at IS NULL;
 IF sid IS NOT NULL THEN RETURN sid; END IF;
 FOR g IN
  SELECT array_agg(q.id ORDER BY coalesce((q.body->>'passage_order')::int,0),q.id) AS ids,
   avg((SELECT count(*) FROM mcat_attempts a WHERE a.user_id=auth.uid() AND a.question_id=q.id)) AS seen
  FROM mcat_questions q WHERE q.published
  GROUP BY coalesce(q.body->>'passage_id',q.id)
  HAVING bool_or((p_topic IS NULL OR q.body->>'topic'=p_topic)
   AND (p_skill IS NULL OR q.body->>'skill'=p_skill) AND (p_section IS NULL OR q.body->>'section'=p_section))
  ORDER BY seen,random()
 LOOP
  ids:=ids||g.ids;
  EXIT WHEN cardinality(ids)>=10;
 END LOOP;
 IF cardinality(ids)=0 THEN RAISE EXCEPTION 'No questions match these filters'; END IF;
 INSERT INTO mcat_sessions(user_id,mode,question_ids) VALUES(auth.uid(),p_mode,ids) RETURNING id INTO sid;
 RETURN sid;
END $$;

CREATE OR REPLACE FUNCTION public.mcat_unit_current(p_session uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s mcat_sessions; first_q jsonb; q jsonb; qs jsonb:='[]'; hs jsonb:='{}'; qid text; i int; n int;
BEGIN
 SELECT * INTO s FROM mcat_sessions WHERE id=p_session AND user_id=auth.uid() FOR UPDATE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;
 IF s.completed_at IS NULL THEN
  IF s.question_started_at IS NULL THEN UPDATE mcat_sessions SET question_started_at=clock_timestamp() WHERE id=s.id; END IF;
  SELECT body INTO first_q FROM mcat_questions WHERE id=s.question_ids[s.cursor+1];
  FOR i IN s.cursor+1..cardinality(s.question_ids) LOOP
   qid:=s.question_ids[i]; SELECT body INTO q FROM mcat_questions WHERE id=qid;
   EXIT WHEN i>s.cursor+1 AND (first_q->>'passage_id' IS NULL OR q->>'passage_id' IS DISTINCT FROM first_q->>'passage_id');
   qs:=qs||jsonb_build_array(q-'answer'-'explanation'-'hints');
   n:=coalesce((s.unit_hints->>qid)::int,CASE WHEN i=s.cursor+1 THEN s.hints_used ELSE 0 END);
   hs:=hs||jsonb_build_object(qid,coalesce((SELECT jsonb_agg(v ORDER BY ord) FROM jsonb_array_elements(q->'hints') WITH ORDINALITY h(v,ord) WHERE ord<=n),'[]'::jsonb));
  END LOOP;
 END IF;
 RETURN jsonb_build_object('session',to_jsonb(s)-'user_id'-'report_claimed_at'-'report_tries'-'unit_hints','question',qs->0,'questions',qs,'hints',hs);
END $$;

CREATE OR REPLACE FUNCTION public.mcat_unit_hint(p_session uuid,p_question text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c jsonb; n int;
BEGIN
 c:=mcat_unit_current(p_session);
 IF c->'session'->>'mode'<>'training' THEN RAISE EXCEPTION 'Hints are for training'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c->'questions') q WHERE q->>'id'=p_question) THEN RAISE EXCEPTION 'Question no longer active'; END IF;
 n:=least(2,jsonb_array_length(c->'hints'->p_question)+1);
 UPDATE mcat_sessions SET unit_hints=jsonb_set(unit_hints,ARRAY[p_question],to_jsonb(n)) WHERE id=p_session;
 RETURN mcat_unit_current(p_session);
END $$;

CREATE OR REPLACE FUNCTION public.mcat_unit_answer(p_session uuid,p_answers jsonb,p_active_ms integer,p_timing_valid boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s mcat_sessions; c jsonb; q jsonb; a mcat_attempts; item jsonb; result jsonb:='{}'; ids text[]; expected text[];
 n int; elapsed int; target_total int; choice int; ok boolean; rpt boolean; pts int; total_pts int:=0; share_ms int; i int:=0;
BEGIN
 SELECT * INTO s FROM mcat_sessions WHERE id=p_session AND user_id=auth.uid() FOR UPDATE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;
 IF jsonb_typeof(p_answers) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Answer list required'; END IF;
 n:=jsonb_array_length(p_answers);
 IF n<1 OR n>20 OR p_active_ms IS NULL OR p_active_ms<0 OR p_active_ms>86400000 THEN RAISE EXCEPTION 'Invalid submission'; END IF;
 SELECT array_agg(v->>'id' ORDER BY ord) INTO ids FROM jsonb_array_elements(p_answers) WITH ORDINALITY x(v,ord);
 IF (SELECT count(DISTINCT x) FROM unnest(ids) x)<>n THEN RAISE EXCEPTION 'Duplicate or missing question'; END IF;
 -- Exact retries are idempotent, including after the last unit completes.
 IF (SELECT count(*) FROM mcat_attempts WHERE session_id=s.id AND question_id=ANY(ids))=n THEN
  FOR item IN SELECT value FROM jsonb_array_elements(p_answers) LOOP
   SELECT * INTO a FROM mcat_attempts WHERE session_id=s.id AND question_id=item->>'id';
   IF (item->>'selected')::int IS DISTINCT FROM a.selected THEN RAISE EXCEPTION 'Answers already saved'; END IF;
   SELECT body INTO q FROM mcat_questions WHERE id=a.question_id;
   result:=result||jsonb_build_object(a.question_id,jsonb_build_object('correct',a.correct,'answer',q->'answer','explanation',q->>'explanation','points',a.points));
  END LOOP;
  RETURN result;
 END IF;
 IF s.completed_at IS NOT NULL OR s.question_started_at IS NULL THEN RAISE EXCEPTION 'Question no longer active'; END IF;
 c:=mcat_unit_current(p_session);
 SELECT array_agg(v->>'id' ORDER BY ord),sum((v->>'target_seconds')::int) INTO expected,target_total FROM jsonb_array_elements(c->'questions') WITH ORDINALITY x(v,ord);
 IF ids IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Submit every question in the current passage in order'; END IF;
 -- Validate the entire payload before saving anything.
 FOR item IN SELECT value FROM jsonb_array_elements(p_answers) LOOP
  SELECT body INTO q FROM mcat_questions WHERE id=item->>'id';
  IF jsonb_typeof(item->'selected') IS DISTINCT FROM 'number' OR (item->>'selected') !~ '^[0-3]$' THEN RAISE EXCEPTION 'Choose an answer for every question'; END IF;
 END LOOP;
 elapsed:=greatest(0,least(86400000,extract(epoch FROM(clock_timestamp()-s.question_started_at))*1000))::int;
 FOR item IN SELECT value FROM jsonb_array_elements(p_answers) LOOP
  SELECT body INTO q FROM mcat_questions WHERE id=item->>'id';
  choice:=(item->>'selected')::int; ok:=choice=(q->>'answer')::int;
  rpt:=EXISTS(SELECT 1 FROM mcat_attempts WHERE user_id=auth.uid() AND question_id=q->>'id');
  pts:=CASE WHEN ok AND NOT rpt THEN 100+CASE WHEN s.mode='rapid' THEN greatest(0,round(50*(1-least(1.0,elapsed/1000.0/target_total))))::int ELSE 0 END ELSE 0 END;
  share_ms:=p_active_ms/n+CASE WHEN i<p_active_ms%n THEN 1 ELSE 0 END;
  INSERT INTO mcat_attempts(user_id,session_id,question_id,question_version,selected,topic,section,skill,mode,correct,active_ms,target_seconds,hints_used,repeated,timing_valid,points)
  VALUES(auth.uid(),s.id,q->>'id',(q->>'version')::int,choice,q->>'topic',q->>'section',q->>'skill',s.mode,ok,share_ms,(q->>'target_seconds')::int,
   jsonb_array_length(c->'hints'->(q->>'id')),rpt,n=1 AND coalesce(p_timing_valid,false) AND p_active_ms>=1000 AND p_active_ms<=elapsed+3000,pts);
  result:=result||jsonb_build_object(q->>'id',jsonb_build_object('correct',ok,'answer',q->'answer','explanation',q->>'explanation','points',pts));
  total_pts:=total_pts+pts; i:=i+1;
 END LOOP;
 UPDATE mcat_sessions SET cursor=cursor+n,score=score+total_pts,hints_used=0,unit_hints='{}',question_started_at=NULL,
  completed_at=CASE WHEN cursor+n>=cardinality(question_ids) THEN clock_timestamp() ELSE NULL END WHERE id=s.id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.mcat_start_units(text,text,text,text),public.mcat_unit_current(uuid),public.mcat_unit_hint(uuid,text),public.mcat_unit_answer(uuid,jsonb,integer,boolean) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.mcat_start_units(text,text,text,text),public.mcat_unit_current(uuid),public.mcat_unit_hint(uuid,text),public.mcat_unit_answer(uuid,jsonb,integer,boolean) TO authenticated;
COMMIT;
