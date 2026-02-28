# Curriculum Mapping Plan — Four Modules + Steps (in-app) + Tasks (checklist) + Guided Outcomes
## Social Media Success Path

This document defines **how** we represent the 4-module curriculum in a structured, versioned way so the Next.js app can:
- guide users through outcomes (not “lesson pages”)
- treat each hub “Lesson” as an in-app **Step** (Module 1 → Step 1, etc.)
- render deterministically (via artifacts like `step_card`, `checklist`, `template`, `resource_links`, `next_actions`)
- persist progress against (Supabase), keyed to WordPress user identity
- support both:
  - **guided flows** (preset prompts/buttons → assess → next best step), and
  - **open navigation** (“what should I work on next?” → recommend next steps based on completion)

Build rules chosen:
- Completion model: **tasks-only** (a Step is completed when all required Tasks are checked)
- Bonus/resource handling: **recommended/injectable** into relevant paths (still optional; does not gate module completion unless you later decide it should)
- Content evolution: allow the LLM to **refine instructions and examples over time** using current best practices and platform changes, while keeping Step/Task IDs stable for progress tracking
- Source inputs: we will use existing assets:
  - the original course video transcripts (even if partially outdated)
  - the already-built “ChatGPT app” step/task structure (where the current demo content came from)

The membership hub outline (from screenshots) is now captured in this doc under **“4) Real module + lesson outline (source: membership hub)”**.

---

## 1) Content model (Module → Step → Task)

In the product and code, we will model content like this:

### Module
A grouping of Steps (mirrors the hub’s Modules).

### Step (hub “Lesson”)
A coached, outcome-focused guided experience (not a video page). A Step contains:
- a short assessment (optional) to pick the correct starting point/variant
- a set of artifacts rendered in the chat timeline (instructions, examples, templates, resources)
- a checklist of Tasks the user can complete
- optional injected recommendations (bonus materials, related resources)

### Task
The smallest unit of work the user checks off.

A Task should be rendered as a rich card (or checklist row + expandable card) that can include:
- instructions (what to do)
- examples (good/better/best)
- references/links (including deep links into Porchly membership content)
- optional “Need help” / “Generate template” action buttons
- a required completion checkbox (user-driven)

This matches your current demo pattern:
- clarify where to start the user (assessment questions)
- deliver step-by-step guides
- allow marking tasks complete to update progress

---

## 2) Transcript → Guided Step conversion (keeping it current)

We will use the course transcripts as raw source material, but not as literal instructions.

Why: transcripts can be outdated (e.g., old UI names like “Creator Studio”, outdated tactics like heavy hashtag emphasis). The guided assistant needs to be timeless and updateable.

### Conversion pipeline (recommended)
For each Step:
1) **Ingest transcript + existing “ChatGPT app” step structure**
2) Extract:
   - intended outcome(s)
   - key actions (convert into Tasks)
   - any resources/links mentioned
3) Rewrite into:
   - modernized instructions (current platform/UI where possible)
   - updated best practices (algorithm shifts, what matters now)
   - clearer checklists + templates
4) Attach:
   - stable Task IDs (curriculum-defined)
   - required vs optional tasks
   - optional “bonus” resource injections
5) Keep a “source” note internally:
   - transcript timestamp(s) / reference
   - so we can audit where a Task came from

### Guardrails for “timeless + up to date”
- The curriculum defines **stable IDs and required tasks**.
- The LLM is allowed to:
  - refine wording and examples
  - update recommendations based on current best practices
  - add optional suggestions/resources
- The LLM is NOT allowed to:
  - invent new required Task IDs
  - change completion rules
  - mark tasks complete on behalf of the user

---

## 3) Example transcript snippet → Task (illustrative)

Transcript excerpt (Module 1 – Step 1):
- “Check out your insights… Google Creator Studio… Meta Business Suite… take a screenshot… repeat at the end.”

Converted modern Task card (conceptually):
- Task: “Capture your current baseline metrics (screenshot/notes)”
  - Instructions:
    - Open Instagram Insights (path may differ by account type/app version)
    - Record: follows, accounts reached, profile visits, website taps, etc.
  - Output:
    - Upload/save screenshot or note metrics
  - Why:
    - creates before/after proof of progress
  - References:
    - link to membership page (if available)
  - Completion checkbox

---


## 0) Goals and “done” criteria

### What “done” means for curriculum mapping
- [ ] All 4 modules are represented as structured data with stable IDs.
- [ ] Each module contains ordered lessons; each lesson contains ordered steps.
- [ ] Every step has:
  - a `stepId` (stable, never changes once released)
  - a `kind` (what the UI should render)
  - clear completion rules (task-based and/or explicit completion)
  - required artifacts (what must be rendered)
- [ ] The app can:
  - start at Module 1 Lesson 1 Step 1 (or diagnostic-driven starting point)
  - resume at the last active step
  - gate movement by completion rules
- [ ] A curriculum versioning approach exists so we can update content without corrupting progress.

---

## 1) Source of truth options (choose one)

You need to decide where the canonical curriculum definition lives.

### Option A — Repo-authored JSON/YAML (recommended for v1)
- Store curriculum under `src/curriculum/` as `v1.json` or `v1.yaml`.
- Pros: fastest to build; versioned in git; easy to review.
- Cons: editing requires deploy.

### Option B — Supabase tables as source of truth
- Store modules/lessons/steps in Postgres; UI reads from API.
- Pros: content can be updated without redeploy.
- Cons: more engineering upfront; needs admin tooling.

### Option C — WordPress as source of truth (pulled from WP API)
- Pull curriculum from WP posts/custom post types.
- Pros: non-engineers can edit in WP.
- Cons: complexity; coupling; content formatting issues; requires WP modeling work.

**Recommendation:** Option A for v1. Later migrate to B or C once stable.

---

## 2) Curriculum identifiers (ID strategy)

### Why IDs matter
Progress persistence depends on IDs. Titles and ordering can change; IDs should not.

### Stable ID format (suggested)
- Module: `m1`, `m2`, `m3`, `m4`
- Lesson: `m1.l01`, `m1.l02`, …
- Step: `m1.l01.s01`, `m1.l01.s02`, …
- Task: `m1.l01.s01.t01`, …

Rules:
- IDs never reuse old meaning.
- If content changes materially, create a new step ID and deprecate the old one.
- Ordering changes should not change IDs.

---

## 3) Canonical curriculum schema (v1)

This is the structure the app should consume. It is intentionally aligned to the UI artifact renderer and progress model.

### Module
- `id`: string (`m1`)
- `title`: string
- `order`: number
- `description?`: string
- `lessons`: Lesson[]

### Lesson
- `id`: string (`m1.l01`)
- `moduleId`: string
- `title`: string
- `order`: number
- `objective?`: string
- `steps`: Step[]
- `completionRule`: `"all_steps" | "manual"` (default `"all_steps"`)

### Step
- `id`: string (`m1.l01.s01`)
- `lessonId`: string
- `title`: string
- `order`: number
- `goal`: string (what the user achieves)
- `kind`: `"instruction" | "checklist" | "template" | "exercise" | "review" | "milestone"`
- `artifacts`: ArtifactSpec[] (what UI should render)
- `completion`:
  - `rule`: `"all_required_tasks" | "manual" | "llm_verified"` (start with first two)
  - `requiredTaskIds?`: string[]
- `prerequisites?`: `{ stepIds?: string[] }`
- `tags?`: string[] (e.g., `["instagram", "profile", "positioning"]`)

### ArtifactSpec (v1)
- `kind`: `"step_card" | "checklist" | "template" | "resource_links" | "next_actions" | "input_request"`
- `id`: string (stable per step, e.g. `m1.l01.s01.art.checklist`)
- `data`: object (kind-specific)

---

## 4) Real module + lesson outline (source: membership hub)
This is the **canonical high-level outline** you provided via screenshots.

In the app:
- each hub **Lesson = Step**
- the user will experience these as **guided, coached success-path steps** inside chat (not as a “lesson page” / video-course navigation)
- each Step has a checklist of required tasks; completion is tasks-only

### Module 1 — Grow Your Base
- Lesson 1 — But First, Let’s Compare
- Lesson 2 — Finding Your Niche
- Lesson 3 — Mastering Your U.S.P.
- Lesson 4 — Revitalize Your Pages & Profiles

### Module 2 — Grow Your Audience
- Lesson 1 — How To Create A Month Of Content
- Lesson 2 — Social Media Content Formula
- Lesson 3 — Content Martini Essentials
- Lesson 4 — The Ultimate Caption Recipe
- Lesson 5 — Pre-Scheduling Your Posts

### Module 3 — Grow Your List
- Lesson 1 — The Essentials
- Lesson 2 — Irresistible Lead Magnets
- Lesson 3 — The Power of an Opt-In Page
- Lesson 4 — Thank You Page Essentials
- Lesson 5 — Delivery Email
- Lead Magnet & Flodesk Instructions (material/resource item)

### Module 4 — Grow Your Business
- Lesson 1 — How To Create an Email Drip Campaign
- Lesson 2 — The Transformative Power of Facebook Groups
- Bonus Materials:
  - Automate New FB Group Members
  - Improving Email Deliverability
  - Create Click-Worthy Headlines

> Interpretation note: items like “Lead Magnet & Flodesk Instructions” and “Bonus Materials” should be modeled as `resource_links` and/or optional “supporting steps”.
> They are **injectable/recommended** by the assistant when relevant to the user’s current goal, but they are **not required to complete** the primary steps by default.

---
## 5) Experience design: guided LLM chat (not lesson pages)

This experience is built around “what are you trying to achieve right now?” rather than “which video do you want to watch?”.

Core interaction patterns:
- **Start / resume**:
  - resume the currently active Step (if in progress), otherwise recommend next best Steps
- **Preset prompt entrypoints** (buttons):
  - user picks a desire/outcome, assistant routes them into the most relevant Step(s)
- **Assessment**:
  - 1–5 quick questions to determine starting point and avoid repeating completed work
- **Guided execution**:
  - assistant delivers Task cards (instructions/examples/templates/resources)
  - user checks tasks complete; progress updates immediately
- **Open help**:
  - user can ask anything mid-step (“help me write this”, “is this good?”)
- **“What should I work on next?”**:
  - assistant recommends 2–3 next options based on completion state + current desire

### What we’re building
Instead of a user clicking lesson-by-lesson like the membership hub UI, the user will:
1) start (or resume) a “Success Path” chat
2) choose an outcome via preset prompts/buttons (examples below)
3) answer a short assessment (1–5 questions)
4) receive a **rich step-by-step guide** with artifacts + checklist tasks
5) mark tasks complete (progress saved)
6) optionally ask open-ended questions at any time
7) at any time, ask: “what should I work on next?” and get recommended next steps based on what’s completed

### Preset prompts/buttons (examples)
- “I want more followers (right people)”
- “I want more leads”
- “I need content ideas”
- “I want to build a lead magnet”
- “Help me set up an email drip campaign”
- “What should I work on next?”

### How a module “Step” becomes a guided path (in-app)
Each membership hub **Lesson** becomes exactly one in-app **Step** (Module → Step order mirrors the hub):
- Step has:
  - clear goal/outcome
  - short assessment (to choose the right starting point / variant)
  - artifacts (`step_card`, `template`, `checklist`, `resource_links`, `next_actions`)
  - completion rules: **tasks-only** (step completes when all required tasks are checked)
- The assistant can branch within the Step:
  - if user already completed some tasks, compress the guidance
  - if user is missing prerequisites, recommend prerequisite Steps (or “fast-track” mini-tasks) before continuing
  - inject optional bonus/resources when they’ll materially improve success

### “What should I work on next?” logic (core)
Given a user’s completion graph:
- Recommend 2–3 next best steps:
  - 1 “highest leverage” step (primary)
  - 1 “easy win” step (secondary)
  - 1 “optional support” step (resource/template)
Recommendations should consider:
- prerequisites
- what is incomplete in the current module
- the user’s current stated desire (audience vs list vs business)
- recency (avoid repeating completed steps unless user requests review)

---
## 6) Mapping procedure (how we convert the hub outline → curriculum spec)

### Step 1 — Inventory and normalize
For each module and lesson listed above:
- capture lesson objective (1–2 sentences)
- decide if the lesson is:
  - an actionable step (checklist)
  - a conceptual step (instruction + quick quiz)
  - a resource item (links/downloads)

### Step 2 — Define step granularity
Heuristics:
- If a lesson implies multiple actions, split into multiple steps (e.g., “Email drip campaign” might become: strategy → outline → write emails → setup/automation → QA).
- If a lesson is mostly a framework, keep as a single step with:
  - `step_card` + `template` + `next_actions` to apply it.

### Step 3 — Define tasks + stable IDs
For each step:
- list checklist tasks with stable IDs:
  - `m2.l03.s02.t01` etc.
- mark required tasks
- completion rule defaults to `all_required_tasks`

### Step 4 — Define artifacts
Minimum per Step:
- `step_card`
- `next_actions` (Continue / Need help / Save for later)

For actionable Steps:
- `checklist` (required tasks)

For writing-heavy Steps:
- `template` artifacts (copy blocks)

For bonus/resources:
- `resource_links` (optionally injected/recommended by the assistant based on the user’s goal and current bottleneck)

### Step 5 — Add assessment + branching hooks
Add step metadata to support guided assessment:
- `assessment`:
  - questions with multiple choice options
  - scoring or routing outcomes (e.g., “beginner vs advanced”)
- `routesTo`:
  - choose next step based on answers and completion state

### Step 6 — LLM hooks (without making completion LLM-dependent)
The “timeless” value comes from letting the LLM keep guidance current while preserving deterministic UI + progress integrity.

Practical interpretation:
- transcripts + existing “ChatGPT app” content give us structure and intent
- the LLM turns that into:
  - modern instructions (UI paths change)
  - updated best practices (algorithms evolve)
  - personalized templates/examples for the user’s niche and context

But: the app remains in charge of:
- which Step/Task IDs exist
- what is required vs optional
- what counts as completion

- LLM can generate/refine:
  - personalized templates (captions, opt-in copy, drip emails)
  - examples tailored to niche + platform changes
  - updated best-practice guidance (algorithm shifts, format trends, deliverability changes)
  - suggested next steps (including optional bonus/resources)

- Guardrails (non-negotiable):
  - step IDs and task IDs are defined by curriculum, not invented by the LLM
  - checklist/task completion remains user-driven (checkboxes)
  - the LLM may propose better wording/instructions, but cannot change completion rules or mutate the curriculum structure at runtime

---

## 7) ID mapping for the real outline (proposed)
We now have the real module + lesson titles. Next we assign stable IDs so progress can be persisted safely.
This mapping is proposed (you can rename titles later without changing IDs).

Terminology in the app:
- hub “Module” = in-app **Module**
- hub “Lesson” = in-app **Step**
- checklist items inside each Step = in-app **Tasks**
- “bonus” / “resource” items = optional injected recommendations (not required completion)
+
+### Module IDs
+- `m1`: Grow Your Base
+- `m2`: Grow Your Audience
+- `m3`: Grow Your List
+- `m4`: Grow Your Business
+
+### Lesson IDs
+#### `m1` — Grow Your Base
+- `m1.l01`: But First, Let’s Compare
+- `m1.l02`: Finding Your Niche
+- `m1.l03`: Mastering Your U.S.P.
+- `m1.l04`: Revitalize Your Pages & Profiles
+
+#### `m2` — Grow Your Audience
+- `m2.l01`: How To Create A Month Of Content
+- `m2.l02`: Social Media Content Formula
+- `m2.l03`: Content Martini Essentials
+- `m2.l04`: The Ultimate Caption Recipe
+- `m2.l05`: Pre-Scheduling Your Posts
+
+#### `m3` — Grow Your List
+- `m3.l01`: The Essentials
+- `m3.l02`: Irresistible Lead Magnets
+- `m3.l03`: The Power of an Opt-In Page
+- `m3.l04`: Thank You Page Essentials
+- `m3.l05`: Delivery Email
+- `m3.r01`: Lead Magnet & Flodesk Instructions (resource/support item)
+
+#### `m4` — Grow Your Business
+- `m4.l01`: How To Create an Email Drip Campaign
+- `m4.l02`: The Transformative Power of Facebook Groups
+- `m4.b01`: Automate New FB Group Members (bonus)
+- `m4.b02`: Improving Email Deliverability (bonus)
+- `m4.b03`: Create Click-Worthy Headlines (bonus)
+
### Step IDs inside steps (internal sub-steps)
Because hub “Lesson” becomes an in-app **Step**, we should treat the `mX.lYY` entity as the user-visible Step.

If we need smaller units inside a Step, we model them as **internal sub-steps** (still deterministic and progress-trackable if needed), for example:
- `m4.s01.p01`: Define drip goal + segmentation
- `m4.s01.p02`: Outline sequence
- `m4.s01.p03`: Draft emails with templates
- `m4.s01.p04`: Implement + QA automation

Where:
- `m4.s01` corresponds to the hub: Module 4 → Lesson 1
- `p01..pNN` are “parts” within that Step (optional; use only when necessary)

This preserves your product rule:
- **Module → Step (hub Lesson) is the primary navigation**
- the assistant can still guide the user through multiple parts inside a Step as needed
+
+---
+

## 6) Example step definition (how we encode a real step)

Below is an example that mirrors what you already prototyped (“Optimize Instagram Bio”). This shows the intended level of structure.

```/dev/null/curriculum.example.json#L1-120
{
  "id": "m1.l01.s01",
  "lessonId": "m1.l01",
  "title": "Optimize Your Instagram Bio",
  "order": 1,
  "goal": "Your profile immediately communicates who you help, how, and what to do next.",
  "kind": "checklist",
  "artifacts": [
    {
      "id": "m1.l01.s01.art.step_card",
      "kind": "step_card",
      "data": {
        "title": "Optimize Your Instagram Bio",
        "body": "We’ll fix clarity leaks in 20 minutes. Follow the checklist and check off each item as you complete it.",
        "examples": [
          "I help first-time buyers in Dallas purchase confidently.",
          "I help growing families in Phoenix upgrade without financial stress."
        ]
      }
    },
    {
      "id": "m1.l01.s01.art.checklist",
      "kind": "checklist",
      "data": {
        "title": "Checklist",
        "completionRule": "all",
        "items": [
          { "id": "m1.l01.s01.t01", "label": "Write your niche statement", "required": true },
          { "id": "m1.l01.s01.t02", "label": "Add a keyword to your Name field", "required": true },
          { "id": "m1.l01.s01.t03", "label": "Write a clear 4-line bio structure", "required": true },
          { "id": "m1.l01.s01.t04", "label": "Add a direct CTA + link", "required": true },
          { "id": "m1.l01.s01.t05", "label": "Verify email button + link works", "required": true }
        ]
      }
    },
    {
      "id": "m1.l01.s01.art.next_actions",
      "kind": "next_actions",
      "data": {
        "actions": [
          { "id": "continue", "label": "Continue", "value": "continue", "style": "primary" },
          { "id": "need_help", "label": "Help me write it", "value": "need_help", "style": "secondary" }
        ]
      }
    }
  ],
  "completion": {
    "rule": "all_required_tasks",
    "requiredTaskIds": [
      "m1.l01.s01.t01",
      "m1.l01.s01.t02",
      "m1.l01.s01.t03",
      "m1.l01.s01.t04",
      "m1.l01.s01.t05"
    ]
  }
}
```

---

## 7) Curriculum gating and navigation rules (product behavior)

### Default gating (recommended)
- Steps within a lesson are sequential:
  - user can view next step only after completing current step
- Lessons within a module are sequential:
  - user can start lesson N+1 after lesson N completion
- Modules are sequential:
  - user can start module N+1 after module N completion

### Optional flexibility (v1.1)
- Allow browsing all steps, but:
  - show “Recommended next” and “Locked until you complete …”
  - allow marking “Skipped” with a warning (don’t count as complete)

### Resume rules
- On load:
  - if an active step is `in_progress`, resume there
  - else resume at the next not-started step
  - else if module complete, move to next module

---

## 8) Curriculum versioning and migrations

### Versioning approach
- Every curriculum release has a version tag, e.g. `curriculum_v1`.
- Progress rows should store:
  - `curriculum_version`
  - `module_id`, `lesson_id`, `step_id` (stable IDs)

### When to bump version
Bump if:
- step IDs are added/removed
- step completion rules change materially
- lesson/module ordering changes significantly

### Migration strategy
- Never rewrite user progress IDs in-place without an explicit migration.
- Prefer:
  - keep old steps readable (deprecated)
  - map users forward via a `step_migrations` table if needed (future enhancement)

---

## 10) Remaining extraction needed (to fully implement step-by-step inside each lesson)

We now have the full module + lesson outline from screenshots.
What we still need (to build the guided steps correctly) is the *inside* of each lesson:
- the sub-steps (if any)
- the desired outcome(s)
- any templates/downloads/links referenced
- any “assessment questions” you want per lesson (or we derive them)

Fastest way to provide this:
- for each lesson, paste:
  - 3–8 bullet “actions” the user should complete
  - any copy templates you already have (optional)

If you don’t have that yet, we can still proceed by:
- building a first-pass guided step breakdown per lesson (based on the titles),
- then iterating with your approval.

---

## 10) Implementation milestones (curriculum workstream)

### Milestone A — Curriculum scaffold committed
- [ ] Create `curriculum_v1` with 4 modules, placeholder lessons/steps
- [ ] UI can render module/lesson/step titles from data
- [ ] Progress keys off IDs

### Milestone B — Hub content mapped
- [ ] Replace placeholders with exact membership.io structure
- [ ] Every step has at least `step_card` and (if actionable) `checklist`

### Milestone C — Personalization hooks
- [ ] Identify which steps benefit from LLM personalization
- [ ] Add `input_request` artifacts where required inputs are missing

### Milestone D — QA pass
- [ ] Run through all modules end-to-end
- [ ] Validate completion rules feel correct
- [ ] Ensure no dead-ends / loops / missing next actions

---

## 11) Open questions (to finalize build rules)
We now have module + lesson titles. To finalize implementation behavior:
+
+1) Navigation model for v1:
+   - **guided-first with optional recommendations** (user chooses an outcome; assistant drives next step; user can ask “what next?” anytime)
+   - or fully browsable module map (still supported later)
+
+2) Completion model:
+   - tasks-only (step completes when all required tasks checked)
+   - or tasks + explicit “Mark step complete” for reflective steps
+
+3) Data retention:
+   - store only structured events + artifacts + progress (recommended)
+   - or store full chat transcript as well
+
+4) Bonus materials handling:
+   - purely optional resource items
+   - or integrated into certain guided paths as recommended “support steps”
+
+---