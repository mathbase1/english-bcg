# Build report

## Requested rebuild completed

- Reduced the selector to two complete papers.
- Each paper is labelled for 1 hour 25 minutes and contains four questions.
- Paper 1 uses 4, 8, 20 and 40 marks.
- Paper 2 uses 4, 8, 20 and 40 marks.
- Questions are displayed as Questions 1–4.
- Multiple-choice retrieval remains the opening question.
- Added a new original scenario to each paper, producing six scenarios per paper.
- Added browser autosave for the selected scenario, answers, marking results and targets.
- Added enforced answer word limits of 220, 240, 520 and 900 words as appropriate.
- Removed visible source-line numbering and rendered extracts as prose.
- Rebuilt the layout for desktop, tablet and mobile use.
- Replaced Groq-specific backend logic with the OpenAI Responses API.
- Added strict structured JSON output for marking and target generation.
- Added per-question **Mark again** controls.
- Added four CENTURY Nugget targets selected from the supplied 118-item bank.
- Disabled clipboard output until marking and target generation are complete.
- Added backend password authentication without embedding the password in public files.
- Added signed, expiring access sessions and authentication checks on paid API endpoints.

## Validation completed

- JavaScript syntax checks passed for all frontend and backend modules.
- All JSON files parsed successfully.
- Static question-bank audit passed for all 12 scenarios.
- All opening multiple-choice questions contain eight options and four correct answers.
- Backend authentication, marking and target endpoints passed mocked execution tests.
- Browser interaction test passed for login, paper rendering, autosave, word limits, marking, per-question retry controls, target generation and clipboard enablement.
- No OpenAI API key or teacher password is present in the repository files.

## Required before live use

- Add the private environment variables in Vercel.
- Deploy the repository to Vercel.
- Put the permanent Vercel production domain into `config.js`.
- Enable GitHub Pages and perform a live end-to-end test with a small OpenAI spend limit.
