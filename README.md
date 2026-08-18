# BCG GCSE English Language Practice

A password-protected, AQA-style GCSE English Language practice site with two 1 hour 25 minute papers, browser autosave, OpenAI-powered marking, per-question retry, four CENTURY Nugget targets, and combined clipboard output.

## What is included

- Paper 1 — Explorations in Creative Reading and Writing
  - Question 1: 4-mark multiple choice retrieval
  - Question 2: 8-mark language analysis
  - Question 3: 20-mark evaluation
  - Question 4: 40-mark creative writing
- Paper 2 — Writers' Viewpoints and Perspectives
  - Question 1: 4-mark multiple choice retrieval
  - Question 2: 8-mark summary/inference
  - Question 3: 20-mark comparison of viewpoints and methods
  - Question 4: 40-mark viewpoint writing
- Six original scenarios for each paper
- Word limits and browser autosave
- Sources displayed as continuous prose rather than numbered lines
- Secure backend password check
- Sequential marking and individual **Mark again** buttons
- Four AI-selected CENTURY Nugget targets from the supplied target bank

## Repository structure

```text
index.html
styles.css
config.js
app.js
.nojekyll
package.json
vercel.json
api/
  auth.js
  mark.js
  targets.js
server/
  auth.js
  openai.js
data/
  question-bank.js
  question-bank.json
  century-nuggets.json
  ...supporting bank files
```

## Deployment overview

The same repository is used in two places:

1. **GitHub Pages** serves the student-facing website.
2. **Vercel** runs the protected `/api/auth`, `/api/mark`, and `/api/targets` endpoints.

Never place the OpenAI key, teacher password, or signing secret in GitHub files.

## Vercel environment variables

Add these in **Vercel project → Settings → Environment Variables**:

| Key | Value |
|---|---|
| `OPENAI_API_KEY` | Your secret OpenAI API key |
| `OPENAI_MODEL` | `gpt-5.4-mini` |
| `OPENAI_TARGET_MODEL` | `gpt-5.4-mini` (optional; otherwise uses `OPENAI_MODEL`) |
| `OPENAI_REASONING_EFFORT` | `low` |
| `ACCESS_PASSWORD` | The teacher-only password you selected |
| `AUTH_SECRET` | A private random string of at least 32 characters |
| `ALLOW_ORIGIN` | Your GitHub Pages origin, for example `https://mathbase1.github.io` |
| `AUTH_SESSION_HOURS` | `2` (optional; enough for one 1 hour 25 minute paper and marking) |

After adding or changing environment variables, create a new Vercel deployment.

## Connect GitHub Pages to Vercel

After Vercel gives you its permanent production domain:

1. Open `config.js`.
2. Replace `https://REPLACE-WITH-YOUR-VERCEL-DOMAIN.vercel.app` with the permanent Vercel project domain.
3. Commit the change to GitHub.
4. Hard-refresh the GitHub Pages site.

The Vercel URL in `config.js` is public by design. The OpenAI key and access password remain server-side.

## Security notes

- The teacher password is compared only in the Vercel backend and is not embedded in the HTML or JavaScript.
- Successful access produces a short-lived, signed session token stored in `sessionStorage`.
- All marking and target endpoints reject requests without a valid signed session.
- The OpenAI key is read only from Vercel environment variables.
- OpenAI requests use `store: false`.
- Do not ask students to enter names, email addresses, candidate numbers, or other identifying information in answers.
- The question bank itself is public because GitHub Pages is a public static host. The protected backend prevents unauthorised use of the paid AI endpoints.

## Changing the model later

Change `OPENAI_MODEL` in Vercel and redeploy. The frontend files do not need to be rebuilt merely to change the OpenAI model.

## Local development

A local server must provide the three `/api` routes for authentication and marking. Opening `index.html` directly from the file system is not enough to test the backend.
