# Finish connecting MCATprep

The application is ready to import into Vercel after the first push to main.

## 1. Create the Supabase tables

In your existing Supabase project, open **SQL Editor > New query**. Paste the complete contents of `supabase/setup.sql` and run it. This creates the app's tables, privacy rules, scoring functions, and 36 original starter questions. It does not upload or import the local books.

## 2. Fund the OpenAI API

The key passed authentication, but the live report check on September 26, 2026 returned **no credits remaining**. Add a small credit balance in OpenAI Platform > Settings > Billing. ChatGPT subscription billing is separate. The app still saves results and calculates statistics if AI is unavailable.

## 3. Import into Vercel

From your `oscar-tos-projects` dashboard, add a new project and import `notAnt1/MCATPrep`. Use **Next.js**, root directory `./`, and branch `main`.

Add the same three values from your local `.env.local` as Vercel environment variables:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
OPENAI_API_KEY
```

Do not upload the `.env.local` file or PDFs to GitHub. The project already excludes them.

## 4. Enable login redirects

In Supabase **Authentication > URL Configuration**, set the Site URL to your deployed address and add that address to allowed redirect URLs. Add `http://127.0.0.1:3000` and `http://localhost:3000` if testing locally. Create an account in the app and confirm the email if required.

## 5. Try the complete loop

Sign in, complete a training session, review its report, open **My analysis**, sign out, and sign back in. Your history should remain. Opt into the leaderboard from **Profile & settings** if wanted.

For a preview without any setup, run `npm run dev`, open http://localhost:3000, and choose **Explore a local demo**. Demo mode uses browser-local history and statistical reports, not cloud AI.

## Current content scope

The six added review books contain approximately 5,680 pages in total, with extractable text in the sampled opening pages. This first build does **not** ingest them automatically. Figure extraction, complete question/answer matching, and content review still need a dedicated import pass. The shipped starter bank is original material, clearly labeled in the app.
