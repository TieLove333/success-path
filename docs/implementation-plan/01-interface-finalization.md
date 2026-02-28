# Interface Finalization Plan — Chat + Task/Progress Tracking

This plan turns the current hardcoded diagnostic/mission UI into a **production-grade guided chat + progress experience** that supports multi-module curriculum, persistence, and LLM-rendered artifacts later (without rewriting the UI again).

Terminology (locked):
- **Module**: top-level grouping (matches the membership hub)
- **Step**: the guided/coached unit the user is currently working through (hub “Lesson” becomes an in-app Step)
- **Task**: a checklist item the user marks complete within a Step (your existing “Step cards” become “Task cards”)
- **Step Hero / Roadmap Card**: the big dark “Your X-Minute Success Path” cover card that appears at the start of every Step

---

## Goals (what “done” means)

### Chat experience
- A stable “assistant chat” layout with:
  - agent header
  - message timeline (assistant + user)
  - composer (text input + optional quick actions)
  - loading/typing states
- Conversation can:
  - run a diagnostic
  - guide the user through a module/lesson/step
  - resume exactly where the user left off
  - show artifacts (checklists, step cards, templates) inline in the timeline

### Progress / todos
- Task completion is:
  - consistent across all lessons
  - persisted per user
  - reflected in UI immediately
- User can:
  - see current module + lesson progress
  - complete step tasks
  - navigate back to module map (optional v1)
  - resume with one click

### Engineering constraints
- Keep UI components composable.
- Separate **chat messages** from **artifacts** from **progress state**.
- Add minimal tech debt: implement state model now that won’t fight LLM integration later.

---

## Current State (as observed)

`src/components/chat/ChatManager.js` currently:
- stores messages and mission steps in local React state
- computes progress percentage by iterating tasks in `missionData`
- toggles tasks with a local `toggleTask(stepNum, taskIdx)` mutation-like update
- reveals a hardcoded mission after the first "No" diagnostic response

This is a great prototype, but:
- no persistence
- no module/lesson structure
- no artifact typing (everything is “mission steps”)
- no single source of truth for “what is a task” and “what is completed”

---

## Target UX (v1)

### Layout
- **Left/Top**: Agent header + optional breadcrumb (Module > Step)
- **Main**: timeline with:
  - assistant/user bubbles (streamable later)
  - artifact cards (rendered blocks)
- **Bottom**: composer:
  - text box
  - primary send
  - optional “quick actions” buttons (Continue / Need help / What next?)

### Step structure (what the user experiences)
Each in-app **Step** should follow the same pattern:
1) short guided assessment (optional; buttons)
2) **Step Hero / Roadmap Card** (big dark cover card for the Step)
3) a stack of **Task cards** (each has instructions/examples/resources + a completion checkbox)
4) completion callout + “Continue” action

### Progress surfaces
- **Step progress chip/bar** (top-right “Path Progress %”) based on completed Tasks within the current Step
- **Module progress** (optional in v1 UI; required for persistence + recommendations)
- **Completion callout** when a Step completes (tasks-only)
- **Resume entrypoint** on load if user has an in-progress Step

---

## Data Model for the UI (front-end types)

Even before persistence is wired, the UI should adopt these shapes so we don’t refactor later.

### Timeline item model
A timeline is a sequence of items. Each item is either a chat message or an artifact block.

- `TimelineItem`
  - `id` (string)
  - `type`: `"message" | "artifact"`
  - `createdAt` (ISO string)

- If `type === "message"`:
  - `role`: `"assistant" | "user" | "system"`
  - `content`: string (plain text v1; streamable later)

- If `type === "artifact"`:
  - `artifact`: (see below)

> UI rule: artifacts render deterministically and are “committed” as a whole (validated) rather than streamed token-by-token. Assistant messages can stream.

### Artifact model (renderable blocks)
All renderable UI components should come from an `Artifact` union with a `kind` discriminator.

- `ArtifactBase`
  - `id`
  - `kind`
  - `title?`
  - `meta?` (object for UI hints, e.g., compact mode)

Initial artifact kinds to support **in the interface** (even if authored manually first):

- `step_hero` (a.k.a. roadmap card)
  - Purpose: the “chapter cover” for a Step (big dark card)
  - Fields: `{ subtitle?, headline, stepTitle, promiseLine?, icon? }`

- `task_card`
  - Purpose: a rich “Task” block with a completion checkbox
  - Fields: `{ taskId, title, instructions, examples?, links?, required?: boolean }`

- `checklist` (optional alternative rendering)
  - Used for compact task lists (may link to expanded task cards)
  - `items`: `{ id, label, completed, required? }[]`
  - `completionRule?`: `"all" | "any" | "manual"` (v1 uses tasks-only completion via `"all"`)

- `template`
  - `format`: `"text"`
  - `content`: string
  - `copyLabel?`: string

- `resource_links`
  - `links`: `{ label, url, description? }[]`

- `next_actions`
  - `actions`: `{ id, label, value }[]`

> Note: your current `MissionStepCard` maps more naturally to `task_card` than to “step”. We’re renaming for clarity: Step = the overall guided unit; Task = the card the user checks off.

### Progress model
Progress should be keyed by curriculum identity, not UI indices.

- `ProgressState`
  - `active`: `{ moduleId, stepId } | null`
  - `completedTaskIds`: `Set<string>` (or array)
  - `stepStatusById`: `{ [stepId]: "not_started" | "in_progress" | "completed" }`
  - `moduleCompletion`: `{ completedSteps, totalSteps }`

Rules (v1):
- A **Step** is complete when **all required Tasks** in that Step are completed (tasks-only completion).
- Task completion is user-driven via checkboxes; no “mark complete” button required.

> Key decision: **Tasks must have stable IDs** (`taskId`) so completion can be persisted and merged safely.

---

## Component Plan (what to build/change)

### 1) Extract “timeline” into its own component
**New**: `ChatTimeline`
- props:
  - `items: TimelineItem[]`
- renders:
  - `ChatBubble` for message items
  - `ArtifactRenderer` for artifact items

**Why:** prevents `ChatManager` from becoming a monolith.

### 2) Add an `ArtifactRenderer`
**New**: `ArtifactRenderer`
- props:
  - `artifact: Artifact`
  - `onAction?` (for next actions)
  - `onToggleTask?` (for task cards / checklist)

Internally maps `artifact.kind` → component:
- `StepHeroCard` (roadmap card)
- `TaskCard`
- `ChecklistCard` (optional compact view)
- `TemplateCard`
- `ResourceLinksCard`
- `NextActionsBar`

You can reuse `MissionStepCard` as the base for the new `TaskCard` component (rename + adjust props), since that UI is already the desired “rich task card” pattern.

### 3) Replace mission-only UI with artifacts in the timeline
Instead of:
- rendering `MissionStepCard` list below messages

Move to a single timeline that includes:
- assistant messages
- a `step_hero` artifact (the big dark roadmap card) at the start of the Step
- a sequence of `task_card` artifacts (the rich check-off cards)
- optional `resource_links`, `template`, `next_actions`

This creates a single scrollable “coached session” story that matches the current premium UI, while making it data-driven.

### 4) Build a reusable composer
**New**: `ChatComposer`
- controlled input
- send handler
- disabled state
- optional quick actions

This enables:
- typed chat (v1 can still be mostly scripted)
- LLM integration later without reworking layout

### 5) ProgressTracker becomes progress-aware
Update `ProgressTracker` usage:
- accepts computed progress from `ProgressState` rather than recomputing from `missionData`

Add:
- `StepProgressPill` (optional): shows current step status

### 6) Replace `toggleTask(stepNum, taskIdx)` with `toggleTask(taskId)`
Tasks should be identified by stable IDs.

Example:
- checklist item `{ id: "m1.l1.s3.t2", label: "...", completed: false }`

---

## State Management Plan (v1 → v2)

### v1 (local-only but structured)
In `ChatManager`:
- keep:
  - `timelineItems`
  - `progressState`
  - `activeContext` (module/lesson/step)
- all updates flow through reducer-like functions:
  - `appendMessage(role, content)`
  - `appendArtifact(artifact)`
  - `toggleChecklistItem(artifactId, itemId)`
  - `setActiveStep(moduleId, lessonId, stepId)`
  - `markStepCompleted(stepId)`

Recommended: use `useReducer` to avoid nested immutable updates.

### v2 (persisted)
When Supabase is added:
- hydrate on load:
  - fetch active step + progress + saved timeline (or events)
- optimistic UI:
  - toggle locally first
  - persist in background
  - reconcile on error

---

## Flows to Implement (interface-level)

### Flow A: App load → resume
1. show LoadingScreen (existing)
2. load `ProgressState` (v1: from localStorage; v2: from DB)
3. if user has `active.stepId`:
   - show “Resume” message + actions
4. else:
   - start diagnostic / onboarding

### Flow B: Diagnostic → personalized focus
Keep diagnostic questions, but represent them as:
- assistant message
- `next_actions` artifact (Yes/No)
- optionally store diagnostic answers as structured data for later personalization

### Flow C: Step execution (the core pattern)
For each in-app Step:
- assistant introduces the Step (message; streamable later)
- render `step_hero` (roadmap card)
- render the Step’s `task_card` sequence (rich tasks with checkboxes)
- task completion updates progress in real time
- when all required tasks are completed:
  - show completion callout + “Continue”
  - route to the next Step in the module, or next module when the module’s last Step completes

---

## Persistence UX (localStorage fallback)

Until WordPress + Supabase are live, do this:
- Save minimal state to localStorage:
  - `activeContext`
  - `progressState` (task completions)
  - optionally `timelineItems` (or just key events)

Keys:
- `sociamediasuccesspath:v1:progress`
- `sociamediasuccesspath:v1:active`
- `sociamediasuccesspath:v1:timeline` (optional; cap size)

This enables:
- refresh without losing progress
- quick testing during UI iteration

---

## Acceptance Criteria (interface finalization)

### Chat
- [ ] Timeline supports both messages and artifacts
- [ ] Composer exists and can send a user message (even if scripted response)
- [ ] Typing/loading state is visible during transitions

### Artifacts
- [ ] Checklist artifact renders and toggles items
- [ ] Step card artifact renders title/body/examples
- [ ] Next actions artifact renders buttons and handles click

### Progress
- [ ] Progress bar updates as checklist items are completed
- [ ] Step completion triggers a completion state (status + callout)
- [ ] Resume works after refresh (localStorage v1)

### Code quality
- [ ] `ChatManager` no longer mixes rendering of all concerns (timeline + artifacts + progress)
- [ ] Task toggles are keyed by stable IDs (not array index)

---

## Implementation Steps (sequenced)

1) **Refactor timeline structure**
- Introduce `TimelineItem[]` state in `ChatManager`
- Replace `messages` map render with `ChatTimeline`

2) **Implement `ArtifactRenderer` + at least checklist**
- Migrate current mission tasks into a `checklist` artifact
- Wire `onToggleChecklistItem`

3) **Add progress state**
- Introduce `ProgressState`
- Compute progress percentage from completed task IDs
- Update `ProgressTracker` to use that

4) **Add `ChatComposer`**
- Minimal send support
- Append user message + scripted assistant reply for now

5) **Add localStorage persistence**
- Hydrate on mount
- Save on changes (debounced)

6) **Polish**
- Empty states
- Resume actions
- Scroll-to-bottom behavior in timeline

---

## Open Questions (you should answer before deeper build-out)

1) Should the user be able to browse modules/lessons freely in v1, or only guided “next step” flow?
2) Do you want “progress” to be:
   - tasks-only (simple)
   - or step + lesson completion with explicit “Mark step complete”?
3) Should chat history be persisted, or just progress + last known step?

---

## Notes for LLM Integration Later

This interface plan intentionally aligns with structured LLM output:
- The LLM will output `Artifact[]` with stable shapes.
- The UI already knows how to render each artifact kind.
- Progress toggles can be triggered by user interactions or LLM instructions, but UI remains deterministic.