# Step Spec Template (Markdown + JSON)
## Social Media Success Path — Module → Step → Tasks (Tasks-only completion)

Use this template to define each in-app **Step** (hub “Lesson”) in two forms:

1) **Human spec (Markdown)**: easy to review/edit with stakeholders  
2) **Machine spec (JSON)**: source-of-truth structure that the app loads and the LLM uses to generate artifacts

Key rules (locked):
- A **Step** is complete when **all required Tasks** are checked (tasks-only completion).
- Step/Task IDs are **stable** and owned by curriculum (the LLM may not invent required IDs).
- The UI shows at the start of every Step:
  - a **Step Hero / Roadmap card**
  - then a stack of **Task cards**
- Assistant narrative may stream; artifacts are committed atomically after validation.

---

## Part A — Human Step Spec (Markdown)

> Copy this section into a new file like: `docs/implementation-plan/steps/m1-s01.md`

### Step Identity
- **Module:** `mX` — <Module Title>
- **Step:** `mX.sYY` — <Step Title (hub lesson title)>
- **Order:** Step <YY> within Module <X>
- **Time Estimate (optional):** <e.g., 15–30 mins>
- **Primary Outcome:** <1 sentence: what changes for the user when done?>
- **Success Criteria:** <what “done” looks like in the real world>
- **Prerequisites (optional):**
  - Step IDs: <list>
  - Notes: <if user hasn’t done prerequisites, assistant should recommend them>

### User Entry Points (when this step is recommended)
- Preset buttons (examples):
  - “I want ____”
  - “Help me ____”
- “What should I work on next?” recommendation rationale:
  - show when user has completed: <conditions>
  - show when user is missing: <conditions>

### Assessment (1–5 questions max)
Goal: choose the right starting point and avoid repeating completed work.

Format:
- Q1: <question>
  - options: <A/B/C> (or Yes/No)
  - routing implications:
    - if A → <guidance>
    - if B → <guidance>

(Repeat as needed.)

### Step Hero / Roadmap Card (UI copy)
- **Badge:** <e.g., “Your Personalized Roadmap”>
- **Headline:** <e.g., “Your 20-Minute Success Path”>
- **Step Title:** <title>
- **Promise line:** <e.g., “No redesign. No overthinking. Just clarity.”>
- **Short intro message (assistant):** <1–3 sentences>

### Tasks (the core of the step)
Each Task is a rich “task card” + checkbox.

#### Task list (required tasks)
For each required task:
- **Task ID:** `mX.sYY.tZZ`
- **Title:** <task title>
- **Instructions:** <what to do; keep it actionable>
- **Examples:** (optional list)
- **References/Links:** (optional list; include membership deep links if available)
- **Completion:** user checks box

#### Optional enhancements (injectable, not required)
- Bonus/resource links:
  - <link + why>
- Optional tasks (rare):
  - if you add optional tasks, mark `required: false` in JSON and never gate completion

### Templates (optional)
- Template ID: `mX.sYY.tpl.A`
- Purpose: <what it helps the user create>
- Prompt variables needed:
  - niche, offer, location, tone, etc.
- Output format:
  - caption, opt-in copy, email, etc.

### “Need help” flows (what the assistant should do)
- If user says “I’m stuck on Task 2”:
  - ask: <one clarifying question>
  - generate: <template/examples>
- If user asks for feedback:
  - rubric: <what to check>
  - output: <what to return>

### Completion and Next Step
- When all required tasks are checked:
  - show completion message/callout
  - recommend:
    - **Primary:** next Step in the module (`mX.s(Y+1)`)
    - **Secondary:** 1 optional bonus/resource (injectable)
    - **Fallback:** “What should I work on next?” (2–3 options)

---

## Part B — Machine Step Spec (JSON)

> This JSON is what you’ll ultimately place into `src/curriculum/v1.json` (or per-step JSON files) and what the LLM receives as the “curriculum contract”.

### JSON shape (template)

```/dev/null/step-spec.template.json#L1-150
{
  "curriculumVersion": "v1",
  "module": {
    "id": "mX",
    "title": "<Module Title>",
    "order": 1
  },
  "step": {
    "id": "mX.sYY",
    "moduleId": "mX",
    "order": 1,
    "title": "<Step Title>",
    "timeEstimateMinutes": 20,
    "outcome": "<Primary outcome sentence>",
    "successCriteria": [
      "<bullet 1>",
      "<bullet 2>"
    ],
    "entryPoints": {
      "presetPrompts": [
        { "id": "prompt_1", "label": "<Button label>", "intent": "<intent_key>" }
      ],
      "recommendationRules": [
        {
          "id": "rec_1",
          "when": { "missingTaskIds": ["mX.sYY.t01"] },
          "because": "<rationale>"
        }
      ]
    },
    "assessment": {
      "questions": [
        {
          "id": "mX.sYY.q01",
          "type": "single_select",
          "prompt": "<Question text>",
          "options": [
            { "id": "a", "label": "Option A", "tags": ["beginner"] },
            { "id": "b", "label": "Option B", "tags": ["advanced"] }
          ]
        }
      ]
    },
    "tasks": [
      {
        "id": "mX.sYY.t01",
        "required": true,
        "title": "<Task title>",
        "instructions": "<Task instructions>",
        "examples": ["<example 1>", "<example 2>"],
        "links": [
          { "label": "<Resource name>", "url": "https://...", "description": "<why it matters>" }
        ]
      }
    ],
    "templates": [
      {
        "id": "mX.sYY.tpl.A",
        "format": "text",
        "purpose": "<What this template produces>",
        "inputKeys": ["niche", "offer", "location"],
        "notes": "<Any constraints>"
      }
    ],
    "completion": {
      "rule": "all_required_tasks",
      "requiredTaskIds": ["mX.sYY.t01", "mX.sYY.t02"]
    },
    "artifacts": [
      {
        "id": "mX.sYY.art.step_hero",
        "kind": "step_hero",
        "data": {
          "badge": "Your Personalized Roadmap",
          "headline": "Your 20‑Minute Success Path",
          "stepTitle": "<Step Title>",
          "promiseLine": "No redesign. No overthinking. Just clarity.",
          "icon": "target"
        }
      },
      {
        "id": "mX.sYY.art.task_mX_sYY_t01",
        "kind": "task_card",
        "data": {
          "taskId": "mX.sYY.t01",
          "title": "<Task title>",
          "instructions": "<Task instructions>",
          "examples": ["<example 1>"],
          "links": [{ "label": "<Label>", "url": "https://..." }],
          "required": true
        }
      },
      {
        "id": "mX.sYY.art.next_actions",
        "kind": "next_actions",
        "data": {
          "actions": [
            { "id": "continue", "label": "Continue", "value": "continue", "style": "primary" },
            { "id": "need_help", "label": "Help me with this", "value": "need_help", "style": "secondary" }
          ]
        }
      }
    ],
    "bonus": {
      "injectableResources": [
        {
          "id": "mX.b01",
          "title": "<Bonus title>",
          "links": [{ "label": "<Label>", "url": "https://..." }],
          "recommendWhen": { "intentKeys": ["<intent_key>"] },
          "because": "<why this bonus helps>"
        }
      ]
    },
    "source": {
      "transcript": {
        "videoId": "<optional>",
        "notes": "Optional: store transcript reference timestamps for internal auditing only."
      }
    }
  }
}
```

---

## Artifact contract (what the LLM is allowed to output)
The LLM must output a **Render Plan** containing:
- assistant messages (streamable)
- artifacts (validated; committed atomically), limited to known kinds:
  - `step_hero`
  - `task_card`
  - `template`
  - `resource_links`
  - `next_actions`

Key constraint:
- `taskId` must be one of the curriculum-defined task IDs for that Step.
- LLM may refine wording/examples/templates, but not invent required IDs.

---

## Implementation note (how this ties to the current demo)
Your current homepage demo already represents:
- one Step
- a Step hero/roadmap moment
- multiple rich task cards with checkboxes
- progress chip

So the first milestone is to:
1) encode the current demo Step into:
   - a Markdown spec (reviewable)
   - a JSON spec (loadable)
2) refactor the UI to render from that JSON spec (no hardcoded missionData)
3) later swap the JSON generation from static → LLM-assisted (still schema-validated)
