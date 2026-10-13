# UCSB × Unwrap Capstone Project: Real-Time Website Surveys

## Overview

Traditional surveys are often delivered only after a user has completed or abandoned a task, requiring them to recall what went wrong from memory. This delay reduces the accuracy and richness of the feedback, making usability issues harder to diagnose.

This capstone project develops an embeddable browser SDK that can be installed on an existing website through a single script tag. The SDK will render a configurable survey widget, detect user-friction events, trigger contextual surveys using configurable targeting rules, and transmit responses with session and event metadata to a database.

## Example Scenario

Dahlia was trying to approve student timecards in Oracle but could not continue because the "Submit" button was greyed out with no clear explanation. She had no quick way to flag the issue to the Oracle team for assistance.

The proposed system would allow a website to detect this type of friction in real time and invite the user to provide contextual feedback.

## Expected Deliverable

Students will build an embeddable browser SDK with the following capabilities:

- Installation on an existing website using a single script tag
- Configurable survey widget rendering
- Detection of selected user-friction events
- Contextual survey triggers based on configurable targeting rules
- Secure transmission of survey responses and relevant metadata to a database

## Stretch Deliverable

Students may also build a dashboard that visualizes aggregated survey responses and contextual metadata. Potential capabilities include:

- Clustering open-text responses into themes
- Correlating context fields such as browser, page, and time of day with complaint types
- Identifying anomalies or recurring failure patterns
- Surfacing possible causes of usability issues

## Project Roadmap

The project will progress through five areas:

1. **Research:** Analyze the competitive landscape, intended infrastructure, and technical limitations.
2. **Trigger Design:** Identify friction, error, abandonment, and explicit signals, then compare polling and event-driven detection.
3. **Frontend Widget:** Build a configurable survey popup with dynamic, trigger-specific questions.
4. **Context Collection:** Capture useful metadata while excluding sensitive information and applying redaction where necessary.
5. **Analysis:** Aggregate responses, identify recurring issues, and visualize key patterns.

## Team Members

- Erik Rodriguez — erik_rodriguez@ucsb.edu
- Wendy Contreras Martinez — wcontrerasmartinez@ucsb.edu
- Longjiao Chen — longjiao@ucsb.edu
- Arjun Malaviya — arjunmalaviya@ucsb.edu
- Nic Santos — nxs@ucsb.edu

## Unwrap Partners

- [Max Dekle](https://www.linkedin.com/in/max-dekle/) — SDE, NLP Team
- [Ashwin Singhania](https://www.linkedin.com/in/ashwin-singhania-53b6a72a/?lipi=urn%3Ali%3Apage%3Ad_flagship3_search_srp_all%3BrUy8poTBQUC8auetSHF9cg%3D%3D) — Co-Founder
- [Johnny Manzo](https://www.linkedin.com/in/johnlmanzo/?lipi=urn%3Ali%3Apage%3Ad_flagship3_search_srp_all%3BFlu%2F5KU6QVe99lEjVVs8%2BQ%3D%3D) — GM of New Products, Surveys Team
- [Franco Muniz](https://www.linkedin.com/in/francomuniz/?lipi=urn%3Ali%3Apage%3Ad_flagship3_search_srp_all%3BhZDLHMzmTluC3crZZXxulw%3D%3D) — SDE, Surveys Team
- [Isaac Song](https://www.linkedin.com/in/isaaczsong/?lipi=urn%3Ali%3Apage%3Ad_flagship3_search_srp_all%3Bju4LX0q4TKOXXmEnbeP9Hg%3D%3D) — SDE, Surveys Team

## Project Status

- **Sprint 2 (Week 3): Trigger heuristics and DB setup.** Done. The SDK detects rage clicks, dead clicks (including clicks on disabled controls), errors (JS exceptions, unhandled promise rejections, `console.error`, failed resources, failed network calls), and idle form abandonment. Every trigger carries the user's trail: pages visited, elements clicked, fields focused. PostgreSQL stores sessions, the trail, friction events, and templated surveys.
- **Sprint 3 (Week 4): Dynamic survey widget.** Done. A small launcher sits in the corner of the page. It opens a survey automatically when friction is detected, and a stuck user can open it at any time. The widget lives in a Shadow DOM, so host-site CSS can't affect it and its CSS can't leak out. A rule engine picks the best survey for each trigger, personalizes it with what happened (for example, “Submit timecards” isn't available yet), and shows follow-up questions based on earlier answers, with at most 3 questions per survey. Answers are stored linked to the friction event and trail that caused them.

## Repository Layout

| Path | What it is |
| --- | --- |
| `sdk/` | The embeddable SDK (TypeScript, built with Rollup into one zero-dependency file) |
| `server/` | Ingestion API (Node.js/Express) and PostgreSQL migrations |

## Getting Started

Requirements: Node.js 20+ and PostgreSQL 14+ running locally.

```bash
npm install
createdb pulse_dev          # once
npm run db:migrate          # creates tables and seeds the default survey templates
npm run dev                 # builds the SDK and starts the API on http://localhost:4000
npm test                    # SDK unit tests + API integration tests (uses a pulse_test database)
```

Set `DATABASE_URL` (see `server/.env.example`) if your PostgreSQL isn't at `postgres://localhost:5432`.

### Embedding the SDK

Add one line to any page:

```html
<script src="http://localhost:4000/sdk.js" data-site-key="pk_dev_local" async></script>
```

`pk_dev_local` is the development site created by the seed migration. Optional attributes:

| Attribute | Effect |
| --- | --- |
| `data-debug="true"` | Log every detected trigger to the browser console |
| `data-auto-open="false"` | Never pop up on its own; users open it from the launcher |
| `data-widget="false"` | Detection and recording only, no UI |
| `data-position="bottom-left"` | Put the launcher in the bottom-left corner |
| `data-accent="#0f766e"` | Widget accent color |

A site can also open the help survey from its own button with `Pulse.open()`.

### Survey Rules

Templates live in the `survey_templates` table. For each trigger, the SDK keeps the templates whose `conditions` all match, then picks the highest `priority`. Ties go to the template with more conditions.

```json
{ "urlPattern": "/checkout/*", "elementTags": ["button"], "context": { "kind": ["network"] } }
```

Prompts can use placeholders that are filled from the trigger: `{{element.label}}`, `{{page.title}}`, `{{page.path}}`, `{{context.lastField}}`, and any other `context.*` field. Add `|fallback` for values that may be missing, for example `{{context.lastField|this field}}`. A question with `"showIf": {"question": "kind", "in": ["lost"]}` (or `notIn`) only appears for those answers. A site-specific template with the same `slug` as a default overrides it for that site.

### AI-Written Surveys

With `data-ai="true"` on the script tag and `OPENAI_API_KEY` set in `server/.env` (never committed), the server asks a language model to write a 1–3 question survey for each specific moment. Its input is the trigger, the element and the card it sits in, the user's route across pages, and coarse browser context: timezone-based region, time of day, weekday, browser, OS, and device. No geolocation permission is used. Each generated survey, and exactly what the model was shown, is stored in `generated_surveys`, and answers link to it. If the model is unavailable, the SDK falls back to the templates above. Generation is capped at 6 surveys per session.

When a user opens the orb themselves, it first asks why they're there: "I'm lost", "Something went wrong", or "I have a question". The survey then matches that choice and doesn't assume anything broke.

The SDK also detects pages that load with an HTTP error, such as a 404 from a broken link. It keeps the route in `sessionStorage`, so the survey on the error page knows which link on the previous page led there.

Included variants: disabled controls (for a rage click or dead click on a greyed-out button) and failed network requests each get their own survey, instead of the generic one.

### API

| Method & path | Purpose |
| --- | --- |
| `GET /sdk.js` | The minified SDK |
| `POST /v1/events` | Batched trail and friction events from the SDK (`application/json` or `text/plain` for `sendBeacon`) |
| `GET /v1/surveys?siteKey=` | Active survey templates for a site, including their rules (site-specific templates override the defaults) |
| `POST /v1/responses` | A submitted or dismissed survey, linked to its trigger. Answers are validated against the template |
| `GET /health` | Liveness and database check |

### Detection Defaults

| Trigger | Rule |
| --- | --- |
| Rage click | 3+ clicks within 700 ms, within 30 px of each other |
| Dead click | Clicking something interactive produces no DOM change or navigation within 1 s, or the control is disabled |
| Error | Any captured error is stored; it may prompt only if it happens within 3 s of a click |
| Form abandonment | User typed in a form, then went idle for 30 s without submitting (leaving mid-form is recorded, never prompted) |

To limit false positives, prompts are budgeted per tab session: at most 3 per session, at least 60 s apart, and at least 5 minutes apart for the same trigger type. All thresholds are configurable through `Pulse.init({...})`. Only field labels and names are collected, never typed values, and URLs are stored without query strings.
