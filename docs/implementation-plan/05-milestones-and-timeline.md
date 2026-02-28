# Milestones & Timeline — Multi-step Implementation Plan
## Social Media Success Path

This file is the execution plan that ties together:
1) finalizing the **guided chat + task/progress interface**
2) integrating **OpenAI/LLM** with **structured output** to render deterministic UI artifacts (Step Hero + Task cards)
3) integrating with **WordPress membership**, plus **Vercel + Supabase** setup and DB tables
4) building out the **4-module success path** (Module → Steps → Tasks) based on the membership hub

It’s written as a pragmatic engineering plan with clear deliverables and acceptance criteria per phase.

---

## Terminology (locked)
- **Module**: top-level grouping (matches the membership hub)
- **Step**: the guided/coached unit the user works through (membership hub “Lesson” becomes an in-app Step)
- **Task**: a rich card + checkbox completion item within a Step
- **Step Hero / Roadmap Card**: the big dark cover card shown at the start of every Step

Completion model (locked):
- **Tasks-only completion**: a Step is complete when all required Tasks are checked by the user.

---

## Guiding principles
- **UI first, then persistence, then LLM**: the artifact renderer and progress model must exist before LLM can safely drive UI.
- **Deterministic rendering**: the model outputs validated JSON “render plans” only—never HTML/JSX.
- **Stable IDs everywhere**: modules/steps/tasks must use stable IDs so progress persists across edits.
- **Server-side authority**: authentication, LLM calls, and persistence are server-side. Client proposes changes; server validates.
- **Hybrid streaming**: assistant narrative can stream; **artifacts (Step Hero + Task cards) are committed atomically** after validation.

---

## Timeline overview (recommended order)

### Phase 0 — Alignment (0.5–1 day)
**Outcome:** reduce unknowns that can derail later phases.

**Decisions to lock (already aligned in docs)**
- Navigation model: guided-first, with “What should I work on next?” recommendations
- Completion model: tasks-only completion
- Bonus handling: injectable/recommended, not gating by default
- Streaming model: stream messages, commit artifacts atomically

**Deliverables**
- Decisions recorded at the top of each doc:
  - `03-wp-vercel-supabase-integration.md` (auth approach)
  - `04-curriculum-modules-and-lessons.md` (navigation + completion + bonus + ID rules)

**Acceptance criteria**
- You can answer: “How does a logged-in member get into the app?” and “What Step do they resume on?”

---

## Phase 1 — First Working Step (data-driven) using the existing demo (1–2 days)
**Outcome:** the current homepage demo Step becomes the first production Step powered by a Step JSON spec, with no loss of UI quality.

### Milestone 1.1 — Encode the existing demo Step into specs (Markdown + JSON)
**Tasks**
- Create a human-readable Step spec (Markdown) and a machine Step spec (JSON) for the current demo Step:
  - Step: `m1.s01` — “Optimize Your Instagram Bio”
  - Tasks: `m1.s01.t01..t05` (including subtasks for the contact/link checks)

**Deliverables**
- `docs/implementation-plan/steps/m1-s01.md`
- `docs/implementation-plan/steps/m1-s01.json`

**Acceptance criteria**
- The Step spec includes:
  - assessment questions (the current diagnostic)
  - Step Hero card copy
  - all Tasks with instructions/examples
  - stable IDs for every required Task/subtask

### Milestone 1.2 — Refactor UI to render the Step from JSON (no hardcoded missionData)
**Tasks**
- Replace the hardcoded `missionData` structure with a loader that reads the `m1.s01` JSON spec (temporary local file-based load is fine for v1).
- Update UI terminology:
  - the rich cards become **Task cards** (not “Step 1 / Step 2”)
  - the big dark card is the **Step Hero / Roadmap card**
- Ensure progress is computed from stable Task IDs (not indices).

**Deliverables**
- The homepage renders the same experience as today, but driven by `m1.s01.json`.

**Acceptance criteria**
- Visual parity with the current demo:
  - diagnostic → Step Hero card → Task cards → completion callout
- Checking tasks updates the progress chip correctly.
- Refresh does not break the flow (local state is fine at this milestone).

### Milestone 1.3 — Add local resume (localStorage) for the first Step
**Tasks**
- Persist:
  - active Step ID (`m1.s01`)
  - completed Task IDs
- On refresh:
  - resume the Step and restore checkboxes/progress

**Acceptance criteria**
- Refresh resumes exactly where the user left off in the Step.

---

## Phase 2 — Finalize interface architecture (timeline + artifacts + composer) (2–4 days)
**Outcome:** a production-grade UI shell that supports messages + typed artifacts + task progress tracking (local-first).

### Milestone 2.1 — Timeline + artifact renderer
**Tasks**
- Refactor the UI to render a unified timeline of:
  - `message` items (assistant/user)
  - `artifact` items (Step Hero, Task cards, templates, links, actions)
- Add `ArtifactRenderer` support for:
  - `step_hero`
  - `task_card`
  - `template`
  - `resource_links`
  - `next_actions`

**Acceptance criteria**
- The UI can render a Step as:
  - Step Hero card + Task cards + next actions
- Task toggles update progress immediately.

### Milestone 2.2 — Composer + “open mode” entrypoints
**Tasks**
- Add a composer (text input).
- Support “What should I work on next?” as a first-class intent:
  - in v1 this can be a stub response based on incomplete Step IDs
  - later upgraded by LLM + progress-aware routing

**Acceptance criteria**
- User can type a message and see it appear in the timeline.
- The app can respond with 2–3 recommended next Steps (even if rule-based at first).

---

## Phase 3 — Curriculum scaffold (all modules/steps defined) (2–5 days, can overlap)
**Outcome:** the app drives steps from curriculum data, not hardcoded arrays.

### Milestone 3.1 — Curriculum v1 scaffold
**Tasks**
- Create `curriculum_v1` containing:
  - 4 Modules
  - Steps (hub lessons) with stable IDs
  - placeholder Tasks where needed, to be filled in iteratively

**Acceptance criteria**
- The app can list Steps and choose “next” based on completion state.

### Milestone 3.2 — Populate real Step specs module-by-module
**Tasks**
- For each Step:
  - create `docs/implementation-plan/steps/<step>.md` and `<step>.json`
  - then migrate JSON into the app’s curriculum source-of-truth

**Acceptance criteria**
- Each Step has stable Task IDs and tasks-only completion rules.

---

## Phase 4 — Supabase + persistence (1–3 days)
**Outcome:** progress is persisted server-side and resumes across devices.

### Milestone 4.1 — Supabase project + tables
**Tasks**
- Create Supabase project.
- Create DB tables for:
  - WP user mapping (`wp_users`)
  - progress (`user_progress`)
  - sessions/events (optional, recommended)

**Acceptance criteria**
- You can write/read a progress record by internal user id.

### Milestone 4.2 — Server routes for progress persistence
**Tasks**
- Implement server endpoints (or server actions) to:
  - fetch progress for a user
  - toggle a task completion

**Acceptance criteria**
- Completing tasks persists and reloads correctly across sessions (once auth exists).

---

## Phase 5 — WordPress membership integration + Vercel deployment (2–6 days, depending on WP work)
**Outcome:** WP members can access the app; user identity is mapped; gating is enforceable.

### Milestone 5.1 — Vercel environments + secrets
**Tasks**
- Configure environment variables:
  - OpenAI key (server-only)
  - Supabase URL + service role key (server-only)
  - app session secret
  - WP SSO secret and redirect URLs
- Deploy preview + production.

**Acceptance criteria**
- App boots on Vercel and can call Supabase from server routes.

### Milestone 5.2 — WP → App SSO handshake (recommended)
**Tasks**
- Implement a WP mechanism to mint short-lived signed tokens containing:
  - `wp_user_id`
  - membership tier/status
  - expiry
- Implement a Next.js `/sso` route:
  - validate token
  - upsert mapping row in `wp_users`
  - set an httpOnly session cookie
  - redirect to app home
- Add middleware to protect app routes:
  - no session → redirect to WP launch/login
  - insufficient tier → show upgrade page linking back to WP

**Acceptance criteria**
- A logged-in WP member can click “Launch” and land in the app authenticated.
- The app can resolve `wp_user_id` → internal user UUID.

### Milestone 5.3 — Persisted progress tied to WP identity
**Tasks**
- On authenticated app load:
  - fetch progress for user
  - resume active Step
- On task toggles:
  - persist to Supabase (server-side)

**Acceptance criteria**
- A WP member’s progress persists across devices and sessions.

---

## Phase 6 — OpenAI/LLM structured outputs (2–5 days)
**Outcome:** the assistant can generate current, up-to-date guidance and artifacts (Step Hero + Task cards + templates) while keeping deterministic rendering and stable IDs.

### Milestone 6.1 — Mock render-plan API (no OpenAI)
**Tasks**
- Add an API endpoint that returns a hardcoded “render plan” JSON for:
  - Step Hero
  - Task cards
  - templates/actions
- Wire UI to call it for “Need help” flows in `m1.s01` (e.g., generate bio drafts).

**Acceptance criteria**
- UI can render server-provided artifacts end-to-end.

### Milestone 6.2 — OpenAI integration with schema validation + hybrid streaming
**Tasks**
- Add server-side OpenAI call.
- Enforce structured output:
  - validate against schema (Zod/AJV)
  - retry once on validation failure
  - fallback to safe response if still invalid
- Implement hybrid streaming:
  - stream assistant narrative text
  - commit artifacts atomically after validation

**Acceptance criteria**
- Model outputs render consistently as artifacts.
- Invalid output does not break the UI.

### Milestone 6.3 — Curriculum-aware generation with stable IDs
**Tasks**
- For “Need help” flows:
  - send active Step spec + allowed Task IDs
  - generate templates/examples that attach to existing Tasks
- For “What should I work on next?”:
  - provide progress state + candidate Steps and return 2–3 recommended options

**Acceptance criteria**
- The model may refine wording and best practices, but cannot invent required IDs or mark completion.

---

## Phase 7 — Full 4-module buildout + QA (ongoing)
**Outcome:** the complete success path is implemented, QA’d, and ready for members.

**Acceptance criteria**
- A user can complete Module 1 through Module 4 with no dead ends.
- “What next?” recommendations are accurate and progress-aware.
- Optional bonus/resources are recommended contextually and do not block completion.

---

## Definition of Done (overall MVP)
- [ ] The existing demo Step is fully data-driven (JSON spec) with local resume.
- [ ] Progress persists in Supabase and resumes reliably (WP-mapped identity).
- [ ] WP members can SSO into the app on Vercel and are gated by membership.
- [ ] Curriculum contains real 4-module structure (Modules → Steps → Tasks).
- [ ] LLM can generate at least one personalized artifact (e.g., bio drafts) via validated structured output.
- [ ] Hybrid streaming is in place (messages stream; artifacts commit atomically).

---

## What I need from you to finalize exact dates
1) Target launch date and preferred sequencing (UI vs WP vs LLM).
2) Whether to store full transcripts/chat logs or only structured events + progress.
