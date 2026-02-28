# UI Layout Exploration — Guided Success Path (Phase Shift: Full-Width → Split View)
## Chat-first onboarding → Step Workspace + Persistent Chat

This document maps the upgraded UI/UX you described:

- The experience begins as a **full-width guided chat** (premium, calm, focused).
- Once a **Step is selected and Tasks load**, the UI transitions into a **split view**:
  - **Left:** a persistent Step Workspace (Step Hero + Tasks + progress) that never disappears until the Step is completed or the user changes steps.
  - **Right:** the ongoing chat UI (sticky composer, streaming assistant text, templates/resources, brainstorming, “what next?”).

It also defines a “Get help on this” interaction for each Task that injects Task context into the right-side chat without losing the workspace.

---

## 0) Core UX problem to solve (locked)
The user must never lose their active Step + Tasks in a long chat history.

The UI must preserve:
- **Anchoring:** “What Step am I in? What’s my next task?”
- **Execution clarity:** tasks remain visible and actionable
- **Continuity:** user can still ask questions, brainstorm, and get feedback
- **Context control:** help requests should be scoped to a specific Task when possible

---

## 1) New layout model (recommended)
### Phase 1 — Full-width chat (Onboarding / Diagnostic)
- Initialization screen
- Assistant intro bubbles
- Diagnostic question card + Yes/No buttons
- No split view yet (the focus is the guided assessment)

### Phase 2 — Split view (Execution Mode)
Triggered when:
- the router selects a Step and the Step plan begins loading (“Building your plan…”), or
- the Step Hero / Task list is rendered

Split view:
- **Left pane (Workspace):**
  - Step Hero / Roadmap card (pinned at top of pane)
  - Task list/cards (scrollable)
  - Progress chip (visible)
  - Completion callout + Continue button (at end or sticky)
- **Right pane (Chat):**
  - Chat timeline (assistant/user bubbles + generated artifacts like templates/resources)
  - Sticky composer (always available)
  - Optional “context chip” area above composer showing the active Task context (see below)

---

## 2) Why this solves your concern
- The Step workspace is **always visible**; chat cannot bury it.
- The chat stays “open” for brainstorming and questions without becoming the primary navigation.
- “Help” becomes contextual: Task → Chat rather than generic chat that drifts.

---

## 3) Task-scoped help (context chips + injection)
### Desired interaction
Each Task card in the workspace includes:
- Button: **Get help on this**

When clicked:
1) The right-side chat receives a **context chip card** (non-message UI element) that says:
   - “You’re asking about: Task 3 — Write a Clear Bio Statement”
   - includes an “X” to remove
2) The composer placeholder changes to:
   - “Ask about Task 3…”
3) The next user message is sent with:
   - `activeStepId`
   - `activeTaskId`
   - the Task’s instructions/examples/links included in the context payload

### Why a “context chip” instead of automatically sending a message?
- It keeps the user in control: they can add their question first.
- It makes context explicit (“we’re talking about THIS task”).
- It’s reversible (remove chip).

### Context chip behavior
- Only one active chip at a time (v1).
- Clicking another “Get help on this” replaces the chip.
- The chip can be cleared manually or automatically after a successful “help output” is delivered (optional).

---

## 4) Chat types (one chat, but scoped context)
We keep **one ongoing chat thread** on the right to avoid fragmentation.
Scoping happens via the context chip and request payload, not via separate chat sessions (v1).

Later (v1.1/v2), you can add:
- a lightweight “Saved help threads per task”
- or a small “Recent help” list
…but v1 can be one chat + scoped context.

---

## 5) Layout options (updated)
### Option A — Full-width always (single timeline)
Not recommended long-term because tasks get buried.

### Option B — Split view after Step starts (RECOMMENDED)
- Full-width chat for onboarding/diagnostic
- Split view for execution mode
- Workspace never disappears while Step is active

### Option C — Split view + collapsible chat drawer (mobile-first)
- Workspace full width
- Chat opens as a drawer/sheet
- Useful if mobile usage dominates

---

## 6) Sticky Composer spec (right-side chat)
### Visual
- Same width as the right chat pane
- On-brand premium card styling:
  - subtle border
  - soft shadow
  - gradient fade behind it
- Expandable textarea (1–5 lines)

### Elements
- Text input
- Send button
- Optional quick actions (row):
  - “What next?”
  - “Need help”
  - “Show tasks” (desktop: focuses workspace; mobile: switches tab)
- Optional context chip zone (above input):
  - “Asking about Task X” + X remove

### Behavior
- Hidden during initialization
- Visible during execution mode
- Works with streaming assistant messages
- Artifacts (templates/resources) appear as committed cards in the chat

---

## 7) “Continue where you left off” + navigation surfaces
### Resume behavior (v1)
On load:
- If user has an active Step in progress:
  - open directly into execution mode (split view)
  - workspace shows Step + task completion state
  - chat can show a “Welcome back” assistant message + “Continue” button
- If no active Step:
  - show onboarding full-width chat (diagnostic / goal selection)

### Switching steps (later)
Add a lightweight Step selector:
- “Change focus” / “Start a new success path”
- The router can recommend 2–3 options (LLM-assisted) based on progress.

---

## 8) Implementation plan (UI upgrade)
### Milestone 1 — Split layout scaffold
- Add a responsive layout container with:
  - `StepWorkspace` pane
  - `ChatPane` pane
- Keep your existing visual components; just relocate them into panes.

### Milestone 2 — Context chip + “Get help on this”
- Add “Get help on this” CTA to each Task card
- On click, set active context:
  - `{ stepId, taskId }`
- Render the context chip above composer

### Milestone 3 — LLM wiring for task-scoped help
- When sending chat with active context:
  - include Task instructions/examples
  - constrain allowed task IDs
- Output:
  - streaming assistant text
  - optional committed `template` artifact (non-streamed)

### Milestone 4 — Resume + step switching
- Persist:
  - active step id
  - completed task ids
  - (optional) last active task id
- “Resume” goes straight to split view

---

## 9) Decision log (current)
- Full-width chat until Step starts
- Split view once Step + Tasks are loaded
- Workspace never disappears until completion/switch
- One ongoing chat on the right, with task-scoped context chip injection
- “Get help on this” button on each Task card
- LLM-assisted routing constrained to known Step IDs
- Tasks-only completion

---