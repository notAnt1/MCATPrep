# MCATprep

A personal MCAT practice app built around session feedback and persistent learning analysis.

## Run locally

Requires Node.js 22 or later. Copy `.env.example` to `.env.local` and fill in the values. Never commit `.env.local`.

```sh
npm install
npm run dev
```

Open http://localhost:3000. **Explore a local demo** works without a database. Demo answers stay on this browser and reports are statistical, not AI-generated.

## Supabase setup (once)

1. Open your project's SQL Editor.
2. Run `supabase/setup.sql` (contains both the schema and starter questions).
3. Verify the tables beginning with `mcat_` appear in the Table Editor.
4. Under Authentication > URL Configuration, allow `http://localhost:3000` and your Vercel production URL; set the Site URL to the production URL once deployed.
5. Email/password sign-up is used. If email confirmation is enabled, confirm the email before signing in. For ten invited users, manage who can sign up through your Supabase authentication settings.

Schema uses an `mcat_` prefix, row-level security, authenticated database functions, and private answer keys. No service-role key is required. Do not disable RLS. Tables are read-only to clients except their own profile. Scoring and answer writes happen atomically inside database functions. Functions use a fixed search path and validate ownership.

## Vercel

Import `notAnt1/MCATPrep`, choose branch `main`, framework Next.js, root directory `./`. Add these environment variables to Production (and Preview if wanted):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `OPENAI_API_KEY` (server-only)
- `OPENAI_MODEL` (optional; default `gpt-4.1-mini`)

Deploy, then update Supabase URL configuration. Vercel does not read your local `.env.local`.

## What is implemented

- Email/password accounts; private cloud history via Supabase.
- Training, two curated hint steps, answer explanations, and rapid-fire rounds.
- Pause/hidden-tab aware active time, local refresh recovery, atomic answer submission, resumable sessions.
- Topic-level accuracy, median timing split by mode, hint use, repeats, and evidence counts.
- Per-session AI reports with overall summaries. Saved reports are reused; no AI call when reading a dashboard.
- Persistent profile from the most recent saved AI report plus live statistics from attempt history.
- Optional public nickname/weekly rapid-fire leaderboard, scored in the database. Repeats earn no points.
- Fully usable local demo, with explicitly non-AI reports.

## Analytics and limitations

AI reports receive only numeric topic summaries, not user email/nickname. The optional question tutor receives the question, passage, answer choices, answer key, explanation, figure descriptions, selected answer, and the recent chat messages. Core statistics are deterministic. AI interprets them; it does not calculate scores. `store:false` is sent to OpenAI; this is not a claim of zero provider retention.

Topic assessments use the latest 20 independent, unassisted first attempts. Older samples are retained; up to 20 preceding independent attempts are provided for comparison. Fewer than five observations is insufficient evidence. Timings use provisional question targets, not calibrated population norms. Training and rapid-fire timings are separated. Invalid/long browser-interruption timing is excluded from timing summaries. Active time is a browser estimate, not proof of attention or an anti-cheat guarantee. Rapid-fire points use server wall time; pausing does not improve speed bonuses.

AI is limited by a database-backed claim: one successful report per session, maximum three attempts per session, a two-minute retry interval, and ten generation attempts per user per rolling day. A failed AI request preserves answers and statistics. Since this small app uses publishable-key authentication and database RPCs, an authenticated user can overwrite none of the scores but could submit a fabricated private report via the report-save RPC. This does not affect anyone else's data or leaderboard; stronger report provenance would require a server credential and stricter RPC grants.

The dashboard loads up to 100,000 oldest attempts and 1,000 most recent sessions/reports, sufficient for this small beta; extend pagination before those limits are approached. The AI snapshot reflects data through the completed session; newer unanswered/report-pending sessions may make the current statistics newer than the AI summary.

## Question content

84 original AI-authored foundational questions across 14 topics. **Not a complete MCAT bank, calibrated assessment, or official material.** Timing targets are estimates. The active pilot now includes CARS, complete passage sets, figures, and optional conversational tutoring. Hints and explanations are curated text. Review seed content before relying on it for preparation.

For an existing installation with the original 36 questions, run `supabase/expansion-01.sql` in the Supabase SQL Editor. It adds 48 questions across eight topics and is safe to rerun. Existing question versions and user results are preserved. New installations can use `supabase/setup.sql` for all 84 questions.

Local PDFs, study records, extracted book text, and credentials are excluded from Git. No books are uploaded to an AI provider or distributed with the app. Import only content authorized for the intended use. Preserve question IDs/versions and mark incomplete extractions unpublished. Attempts snapshot the original topic, version, timing target, and results.

To regenerate the seed after editing `src/lib/questions.ts`, run `npm run db:seed`. Existing IDs are intentionally not overwritten; use new versioned IDs for changed questions.

## Verification

```sh
npm run typecheck
npm test
npm run build
```

Database tests run the actual schema in local PostgreSQL-compatible PGlite with mock auth users. They exercise RLS isolation, hidden answers, grading, hint tracking, deduplication, repeat scoring, report claims, and leaderboard opt-in. No production users or data are created by tests.

## Optional question tutor

For an existing installation, apply `supabase/tutor.sql` before deploying the tutor UI. New installs include it in `supabase/setup.sql`. No existing answers or scores are changed.

The tutor is available after every saved answer (correct or incorrect), including session review. Opening it and choosing a suggested prompt make no API calls. Only Send calls `/api/tutor`. Demo users are prompted to sign in. The API authenticates the user and retrieves the matching saved question version through an ownership-checked database function; clients cannot supply or change the question context or answer key.

`OPENAI_TUTOR_MODEL` defaults to `gpt-5.4-nano`, independently of the report model. It uses the existing server-only `OPENAI_API_KEY`, Responses API, no extended reasoning, a 22-second timeout, no automatic retries, and up to 500 output tokens. History is limited to six messages / 6,000 characters, new messages to 1,000 characters, and question context to 24,000 characters. Figure captions and descriptions are sent; image pixels are not. Oversized question context fails rather than silently dropping facts.

Database reservations limit attempts to 8 per question per user, 20 per user, and 1,000 across the app per rolling 24 hours. Failed provider calls also consume a reservation. The usage table stores IDs/timestamps, not chat content. Chat stays in component memory and clears on leaving the question. `store:false` is sent; it does not guarantee zero provider retention. There are no browsing or action tools. Answer scores remain deterministic and independent of tutoring.

At the documented GPT-5.4 nano rates ($0.20/million input tokens, $1.25/million output tokens), a reply using 2,000 input and 300 output tokens costs about $0.000775, or $0.78 per 1,000 such replies. Actual usage varies. This model remains available but is deprecated and shuts down April 1, 2027; evaluate and configure its replacement before that date. Official references: https://developers.openai.com/api/docs/models/gpt-5.4-nano and https://developers.openai.com/api/docs/deprecations.
