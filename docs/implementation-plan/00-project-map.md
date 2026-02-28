# Project Map — Social Media Success Path

This document maps what exists in the codebase today and how it should evolve to support:

1) a finalized guided chat + task/progress tracking interface  
2) OpenAI/LLM structured outputs that render deterministic UI artifacts  
3) WordPress membership integration (Vercel + Supabase + DB tables + WP user mapping)  
4) a 4-module “Success Path” curriculum delivered as coached Steps (not a lesson-page course)

---

## Terminology (final)
- **Module**: top-level grouping (matches the membership hub)
- **Step**: the guided/coached unit the user works through (membership hub “Lesson” becomes an in-app Step)
- **Task**: a checklist item the user marks complete within a Step (rich “task card” with instructions/examples/resources)
- **Step Hero / Roadmap Card**: the big dark cover card shown at the start of every Step
- **Bonus/Resource**: optional supporting material that can be recommended/injected when relevant (does not gate completion)

Core rule (locked):
- **Tasks-only completion**: a Step completes when all required Tasks are checked by the user.

---

## 1) Current System (as-is)

### Tech stack (observed)
- **Next.js (App Router)** project
- **Client-side guided flow** with:
  - initialization/loading screen
  - diagnostic questions (buttons)
  - “mission reveal” hero card
  - a stack of rich cards with checkboxes (currently labeled “Step”, functionally acting as Tasks)
- CSS via `globals.css` + module CSS

### Entry point
- `src/app/page.js` renders:
  - `ChatManager` as the main experience

### Primary UI container
- `src/components/chat/ChatManager.js`
  - Controls:
    - Initialization/loading screen
    - Diagnostic questions (hardcoded `DIAGNOSTIC_QUESTIONS`)
    - Branching behavior on first `"No"` answer
    - Step reveal (hardcoded `missionData` that represents one Step)
    - Task toggling (local state)
    - Progress percentage computation (derived from completed tasks)
  - Renders:
    - `ProgressTracker` (top-right chip; only after Step reveal)
    - `AgentHeader`
    - `ChatBubble` list (assistant + user)
    - `ChoiceButtons` during diagnostic
    - `MissionStepCard` list once `missionData` set
      - Note: these cards are effectively **Task cards** inside a single Step experience

### Supporting components (present)
Located in `src/components/chat/`:
- `AgentHeader.js`
- `ChatBubble.js`
- `ChoiceButtons.js`
- `LoadingScreen.js`
- `MissionStepCard.js`
- `ProgressTracker.js`

> Net: The app is currently a **single-page, hardcoded scripted flow** with local-only progress.

---

## 2) Target Architecture (to-be)

### High-level goals
- Convert from “hardcoded diagnostic + mission” to a **data-driven, LLM-guided coaching experience**:
  - user selects an outcome via preset prompts/buttons
  - assistant performs a short assessment
  - app generates a Step plan (hero + tasks) and guides execution
  - user can always ask “what should I work on next?” for recommendations
- Persist state and progress per user (linked to WordPress membership identity).
- Render multiple deterministic artifact types (Step hero, task cards, templates, resources, actions) based on structured outputs.
- Keep guidance “timeless”: allow the LLM to refine instructions/examples over time while **Step/Task IDs remain stable** for progress integrity.

### Proposed conceptual layers

#### A) UI Layer (Next.js)
- Chat UI shell (header, bubbles, composer, timeline)
- Artifact renderer (cards, checklists, templates, downloads, links, etc.)
- Progress UI (per lesson/module, completion, resume)

#### B) Orchestration Layer (App logic)
- “Conversation + state machine” that:
  - routes user intents (diagnostic, lessons, resume, help)
  - chooses next content step
  - requests artifacts from LLM when needed
  - writes progress updates to DB

#### C) Content Layer (Curriculum)
- A structured definition of:
  - Modules → Lessons → Steps
  - Each step has objectives, required artifacts, completion rules, and metadata
- Should be **versioned** (so curriculum changes don’t break progress)

#### D) Integration Layer
- WordPress membership authentication / SSO
- Supabase for:
  - user identity mapping
  - progress storage
  - events/logging
  - optional content personalization storage

#### E) LLM Layer
- OpenAI calls behind server routes
- Structured output schema that the UI can render deterministically
- Guardrails: validation, fallbacks, safety constraints

---

## 3) Data Model (recommended)

### Key entities
- **User**
  - `id` (internal UUID)
  - `wp_user_id` (unique)
  - optional: email, plan/tier, created_at

- **Curriculum**
  - `module` (id, title, order)
  - `lesson` (id, module_id, title, order)
  - `step` (id, lesson_id, title, order, type, requirements)

- **Progress**
  - `user_module_progress`
  - `user_lesson_progress`
  - `user_step_progress`
  - Each step progress includes:
    - `status`: not_started | in_progress | completed
    - `completed_at`
    - `data`: JSON for artifacts, answers, generated text, links, etc.

- **Conversation state**
  - `chat_sessions` (user_id, started_at, last_active_at, state JSON)
  - `chat_messages` (session_id, role, content, created_at)
  - Or store a compressed timeline + events rather than every token

- **Events (optional but useful)**
  - `user_events` (user_id, type, payload JSON, created_at)

---

## 4) Current Gaps vs. Requirements

### Requirement 1: Finalize chat + task/progress UI
**Current:**  
- Progress is computed in-memory from `missionData.steps[].tasks[]`
- No persistence, no multi-module Step navigation, no resume
- “Step” terminology is overloaded (UI shows “Step 1/2/3” cards that are really Tasks)

**Needed:**  
- A consistent **Module → Step → Task** completion model (tasks-only completion)
- Resume capability (return to the active Step + incomplete Tasks)
- Clear separation between:
  - chat narrative messages (streamable later)
  - rendered artifacts (committed atomically)
  - progress state (stable IDs)

### Requirement 2: OpenAI structured outputs → UI artifacts
**Current:**  
- Hardcoded Step (mission) object and scripted messages

**Needed:**  
- Server-side routes that:
  - send context + Step definition + user progress snapshot
  - receive structured output (JSON render plan)
  - validate and commit artifacts atomically
- UI renderer that can render (v1):
  - **Step Hero / Roadmap card**
  - **Task cards** (rich instructions + checkbox completion)
  - templates (copy blocks)
  - resources/links (including injectable bonus materials)
  - next actions (buttons)
- Streaming approach:
  - stream assistant narrative messages
  - do **not** stream artifact JSON; validate then render
- Fallback for invalid outputs (retry once, then safe minimal response)

### Requirement 3: WP membership integration + Vercel + Supabase
**Current:**  
- No auth layer visible in the mapped files

**Needed:**  
- Identify membership platform integration option:
  - WP JWT? OAuth? Signed SSO token? membership.io embed pattern?
- DB tables for WP user mapping
- Middleware/session handling in Next.js
- Deployment environments configured (Vercel env vars; Supabase keys)

### Requirement 4: Build phases of success path (4 modules)
**Current:**  
- Single Step prototype (“Optimize Your Instagram Bio”) with multiple internal Task cards

**Needed:**  
- Curriculum mapping:
  - 4 Modules
  - each hub “Lesson” becomes an in-app **Step**
  - each Step contains multiple **Tasks** (rich task cards + checkboxes)
- Guided-first navigation:
  - user chooses an outcome via buttons/prompts
  - assistant routes to the best Step based on progress + assessment
  - user can also ask “what should I work on next?” and receive 2–3 recommended next Steps
- Step gating rules:
  - tasks-only completion
  - module completion is derived from Step completion
  - bonus/resources are optional and injectable (recommended when relevant)

---

## 5) Proposed Folder/Doc Layout (docs)

This `docs/implementation-plan/` should hold:
- `00-project-map.md` (this file)
- `01-interface-finalization.md` (chat + progress UI plan)
- `02-llm-structured-output.md` (schemas + API routes + rendering)
- `03-wp-vercel-supabase-integration.md` (auth + DB + deployment)
- `04-curriculum-modules-and-lessons.md` (4-module content map)
- `05-milestones-and-timeline.md` (multi-step execution plan)
- `schemas/` (JSON schema drafts for structured artifacts)
- `db/` (SQL table definitions and migrations strategy)

---

## 6) UI Artifact Types (initial set)

These are the “renderable components” the LLM should be allowed to output (validated JSON only):

- `message` (assistant narrative; streamable)
- `step_hero` (big dark Step Roadmap card)
- `task_card` (rich Task card with checkbox completion)
- `checklist` (optional compact list view of tasks)
- `template` (copy/paste blocks)
- `resource_links` (curated URLs with labels; includes injectable bonus materials)
- `input_request` (ask user for specific fields)
- `next_actions` (buttons/choices)

Rules:
- Artifacts are deterministic to render and easy to validate.
- The LLM may refine wording and examples over time, but **Step IDs and Task IDs are owned by the curriculum** and must remain stable.

---

## 7) Risk Notes / Decisions Needed

To proceed efficiently, you’ll want to decide:

1) **Auth approach** between WP membership and Next.js:
   - embedded app inside membership.io?
   - link-out to Vercel app with SSO token?
   - direct login on Vercel app?

2) **Curriculum source of truth**:
   - replicate membership.io content into code/DB
   - or fetch from WP API (if exposed)
   - or manually curate JSON/YAML in repo

3) **Persistence scope**:
   - store full chat logs vs. store only structured events + outputs

4) **LLM guardrails**:
   - strict JSON schema enforcement
   - deterministic rendering only
   - fallback to pre-authored content if model output fails

---

## 8) Immediate Next Step

Create the remaining planning docs in `docs/implementation-plan/`:
- UI finalization plan (state model + components)
- LLM integration plan (schemas + routes + validation)
- WP/Supabase/Vercel integration plan (auth + tables + env vars)
- Curriculum mapping plan (4 modules → lessons → steps)

Once those are drafted, implement in the same order:
1) finalize UI + state model
2) add persistence (Supabase) + auth mapping
3) add LLM structured output
4) expand curriculum + gating + analytics