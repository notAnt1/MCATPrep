-- Additive canonical classification and exposure tracking. No learner records are rewritten.
BEGIN;
CREATE TABLE IF NOT EXISTS public.mcat_topic_nodes(id text PRIMARY KEY,parent_id text,label text NOT NULL,taxonomy_version text NOT NULL);
CREATE TABLE IF NOT EXISTS public.mcat_question_annotations(question_id text NOT NULL,content_version integer NOT NULL,tagging_version text NOT NULL,annotation jsonb NOT NULL,PRIMARY KEY(question_id,content_version,tagging_version));
ALTER TABLE public.mcat_topic_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcat_question_annotations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mcat_topic_nodes,public.mcat_question_annotations FROM public,anon,authenticated;
CREATE TABLE IF NOT EXISTS public.mcat_exposures(user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,family_id text NOT NULL,first_session uuid,passage_id text,hint_seen boolean NOT NULL DEFAULT false,answer_seen boolean NOT NULL DEFAULT false,solution_seen boolean NOT NULL DEFAULT false,PRIMARY KEY(user_id,family_id));
ALTER TABLE public.mcat_exposures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mcat_exposures FROM public,anon,authenticated;
ALTER TABLE public.mcat_attempts ADD COLUMN IF NOT EXISTS family_id text;
ALTER TABLE public.mcat_attempts ADD COLUMN IF NOT EXISTS passage_id text;
ALTER TABLE public.mcat_attempts ADD COLUMN IF NOT EXISTS annotation jsonb;
ALTER TABLE public.mcat_attempts ADD COLUMN IF NOT EXISTS exposure_known boolean NOT NULL DEFAULT false;
ALTER TABLE public.mcat_attempts ADD COLUMN IF NOT EXISTS prior_hint boolean;
ALTER TABLE public.mcat_attempts ADD COLUMN IF NOT EXISTS prior_answer boolean;
ALTER TABLE public.mcat_attempts ADD COLUMN IF NOT EXISTS prior_solution boolean;
ALTER TABLE public.mcat_attempts ADD COLUMN IF NOT EXISTS prior_item boolean;
ALTER TABLE public.mcat_attempts ADD COLUMN IF NOT EXISTS prior_passage boolean;
ALTER TABLE public.mcat_attempts ADD COLUMN IF NOT EXISTS difficulty text;
ALTER TABLE public.mcat_attempts ADD COLUMN IF NOT EXISTS difficulty_status text;
CREATE OR REPLACE FUNCTION public.mcat_annotation(qid text,ver integer) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT annotation FROM mcat_question_annotations WHERE question_id=qid AND content_version=ver ORDER BY tagging_version DESC LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.mcat_target_matches(a jsonb,target text,integrated boolean DEFAULT true) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT a IS NOT NULL AND a->>'review_status'<>'needs-review' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(jsonb_build_array(a->>'primary') || CASE WHEN integrated THEN coalesce(a->'secondary','[]') ELSE '[]'::jsonb END) x(id) WHERE x.id=target OR EXISTS(SELECT 1 FROM mcat_topic_nodes n WHERE n.id=x.id AND n.parent_id=target));
$$;
CREATE OR REPLACE FUNCTION public.mcat_topic_inventory() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg((a-'rationale')||jsonb_build_object('published',q.published)),'[]') FROM mcat_questions q CROSS JOIN LATERAL mcat_annotation(q.id,(q.body->>'version')::int) a WHERE auth.uid() IS NOT NULL AND a IS NOT NULL;
$$;
CREATE OR REPLACE FUNCTION public.mcat_start_topics(p_mode text,p_target text DEFAULT NULL,p_section text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid; ids text[]:='{}'; g record;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF p_mode IS NULL OR p_mode NOT IN ('training','rapid') THEN RAISE EXCEPTION 'Invalid mode'; END IF;
 IF p_target IS NOT NULL AND NOT EXISTS(SELECT 1 FROM mcat_topic_nodes WHERE id=p_target) THEN RAISE EXCEPTION 'Unknown topic'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(auth.uid()::text));
 SELECT id INTO sid FROM mcat_sessions WHERE user_id=auth.uid() AND completed_at IS NULL;
 IF sid IS NOT NULL THEN RETURN sid; END IF;
 FOR g IN SELECT array_agg(q.id ORDER BY coalesce((q.body->>'passage_order')::int,0),q.id) ids,
 avg((SELECT count(*) FROM mcat_attempts a WHERE a.user_id=auth.uid() AND a.question_id=q.id)) seen
 FROM mcat_questions q WHERE q.published GROUP BY coalesce(q.body->>'passage_id',q.id)
 HAVING bool_or((p_section IS NULL OR q.body->>'section'=p_section) AND (p_target IS NULL OR mcat_target_matches(mcat_annotation(q.id,(q.body->>'version')::int),p_target))) ORDER BY seen,random()
 LOOP ids:=ids||g.ids; EXIT WHEN cardinality(ids)>=10; END LOOP;
 IF cardinality(ids)=0 THEN RAISE EXCEPTION 'No reviewed questions available for this selection'; END IF;
 INSERT INTO mcat_sessions(user_id,mode,question_ids) VALUES(auth.uid(),p_mode,ids) RETURNING id INTO sid; RETURN sid;
END $$;
-- Record displayed units and hint exposure, even if the learner abandons a session.
CREATE OR REPLACE FUNCTION public.mcat_record_exposure() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q jsonb; first_q jsonb; a jsonb; qid text; fam text; pos integer;
BEGIN
 IF NEW.question_started_at IS NOT NULL AND OLD.question_started_at IS DISTINCT FROM NEW.question_started_at THEN
 SELECT body INTO first_q FROM mcat_questions WHERE id=NEW.question_ids[NEW.cursor+1];
 FOR pos IN NEW.cursor+1..cardinality(NEW.question_ids) LOOP
 qid:=NEW.question_ids[pos]; SELECT body INTO q FROM mcat_questions WHERE id=qid;
 EXIT WHEN pos>NEW.cursor+1 AND (first_q->>'passage_id' IS NULL OR q->>'passage_id' IS DISTINCT FROM first_q->>'passage_id');
 a:=mcat_annotation(qid,(q->>'version')::int); fam:=coalesce(a->>'family_id',qid);
 INSERT INTO mcat_exposures(user_id,family_id,first_session,passage_id) VALUES(NEW.user_id,fam,NEW.id,q->>'passage_id') ON CONFLICT DO NOTHING;
 END LOOP;
 END IF;
 IF NEW.hints_used>OLD.hints_used OR NEW.unit_hints IS DISTINCT FROM OLD.unit_hints THEN
 FOR qid IN SELECT unnest(NEW.question_ids) LOOP
 IF coalesce((NEW.unit_hints->>qid)::int,0)>0 OR (qid=NEW.question_ids[NEW.cursor+1] AND NEW.hints_used>0) THEN
 SELECT body INTO q FROM mcat_questions WHERE id=qid; a:=mcat_annotation(qid,(q->>'version')::int);fam:=coalesce(a->>'family_id',qid);
 INSERT INTO mcat_exposures(user_id,family_id,first_session,passage_id,hint_seen) VALUES(NEW.user_id,fam,NEW.id,q->>'passage_id',true) ON CONFLICT(user_id,family_id) DO UPDATE SET hint_seen=true;
 END IF; END LOOP;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mcat_exposure_session ON public.mcat_sessions;
CREATE TRIGGER mcat_exposure_session AFTER UPDATE ON public.mcat_sessions FOR EACH ROW EXECUTE FUNCTION public.mcat_record_exposure();
CREATE OR REPLACE FUNCTION public.mcat_attempt_evidence() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q jsonb; e mcat_exposures;
BEGIN
 SELECT body INTO q FROM mcat_questions WHERE id=NEW.question_id;
 NEW.annotation:=mcat_annotation(NEW.question_id,NEW.question_version);
 NEW.family_id:=coalesce(NEW.annotation->>'family_id',NEW.question_id); NEW.passage_id:=q->>'passage_id';
 SELECT * INTO e FROM mcat_exposures WHERE user_id=NEW.user_id AND family_id=NEW.family_id;
 NEW.exposure_known:=true;
 NEW.prior_hint:=coalesce(e.hint_seen,false); NEW.prior_answer:=coalesce(e.answer_seen,false); NEW.prior_solution:=coalesce(e.solution_seen,false);
 NEW.prior_item:=coalesce(e.first_session<>NEW.session_id,false) OR EXISTS(SELECT 1 FROM mcat_attempts WHERE user_id=NEW.user_id AND coalesce(family_id,question_id)=NEW.family_id);
 NEW.prior_passage:=NEW.passage_id IS NOT NULL AND (EXISTS(SELECT 1 FROM mcat_exposures WHERE user_id=NEW.user_id AND passage_id=NEW.passage_id AND first_session<>NEW.session_id) OR EXISTS(SELECT 1 FROM mcat_attempts a JOIN mcat_questions b ON b.id=a.question_id WHERE a.user_id=NEW.user_id AND a.session_id<>NEW.session_id AND b.body->>'passage_id'=NEW.passage_id));
 NEW.difficulty:=q->>'difficulty'; NEW.difficulty_status:='estimated';
 INSERT INTO mcat_exposures(user_id,family_id,first_session,passage_id,answer_seen,solution_seen) VALUES(NEW.user_id,NEW.family_id,NEW.session_id,NEW.passage_id,true,true) ON CONFLICT(user_id,family_id) DO UPDATE SET answer_seen=true,solution_seen=true;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mcat_evidence_attempt ON public.mcat_attempts;
CREATE TRIGGER mcat_evidence_attempt BEFORE INSERT ON public.mcat_attempts FOR EACH ROW EXECUTE FUNCTION public.mcat_attempt_evidence();
REVOKE ALL ON FUNCTION public.mcat_annotation(text,integer), public.mcat_target_matches(jsonb,text,boolean), public.mcat_record_exposure(),public.mcat_attempt_evidence(),public.mcat_topic_inventory(),public.mcat_start_topics(text,text,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mcat_topic_inventory(),public.mcat_start_topics(text,text,text) TO authenticated;
COMMIT;
