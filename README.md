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

AI receives only numeric topic summaries, not user email/nickname. Core statistics are deterministic. AI interprets them; it does not calculate scores. `store:false` is sent to OpenAI; this is not a claim of zero provider retention.

Topic assessments use the latest 20 independent, unassisted first attempts. Older samples are retained; up to 20 preceding independent attempts are provided for comparison. Fewer than five observations is insufficient evidence. Timings use provisional question targets, not calibrated population norms. Training and rapid-fire timings are separated. Invalid/long browser-interruption timing is excluded from timing summaries. Active time is a browser estimate, not proof of attention or an anti-cheat guarantee. Rapid-fire points use server wall time; pausing does not improve speed bonuses.

AI is limited by a database-backed claim: one successful report per session, maximum three attempts per session, a two-minute retry interval, and ten generation attempts per user per rolling day. A failed AI request preserves answers and statistics. Since this small app uses publishable-key authentication and database RPCs, an authenticated user can overwrite none of the scores but could submit a fabricated private report via the report-save RPC. This does not affect anyone else's data or leaderboard; stronger report provenance would require a server credential and stricter RPC grants.

The dashboard loads up to 100,000 oldest attempts and 1,000 most recent sessions/reports, sufficient for this small beta; extend pagination before those limits are approached. The AI snapshot reflects data through the completed session; newer unanswered/report-pending sessions may make the current statistics newer than the AI summary.

## Question content

84 original AI-authored foundational questions across 14 topics. **Not a complete MCAT bank, calibrated assessment, or official material.** Timing targets are estimates. CARS, full passages, book imports, and conversational AI tutoring are not included yet. Hints and explanations are curated text. Review seed content before relying on it for preparation.

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
