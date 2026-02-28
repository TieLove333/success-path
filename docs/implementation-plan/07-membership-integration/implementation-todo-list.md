Implementation Task List (follow-along checklist)
This is the step-by-step execution list to implement membership integration end-to-end.

Status legend:
- [x] Done in repo
- [ ] Not done yet / needs your setup

### Phase 0 — DNS / hosting setup
- [ ] Create Vercel project and deploy app
- [ ] Connect custom domain: `successpath.porchlyte.com` → Vercel
- [ ] Confirm HTTPS works and the app loads at `https://successpath.porchlyte.com`

### Phase 1 — Supabase persistence (schema + keys)
- [ ] Create Supabase project (prod)
- [ ] Add Vercel env vars:
  - [ ] `SUPABASE_URL`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- [ ] Run SQL migrations from `supabase/migrations/*` in order
- [ ] Verify tables exist:
  - [ ] `public.app_users`
  - [ ] `public.success_path_sessions`
  - [ ] `public.success_path_messages`

### Phase 2 — WP → App SSO payload (HMAC)
- [ ] Decide where secret lives in WP (wp-config.php constant or environment)
- [ ] Add `WP_SSO_SECRET` to WP (server-side)
- [ ] Implement a minimal WP shortcode/plugin that:
  - [ ] checks user is logged in
  - [ ] builds payload `{ wp_user_id, membership, iat, exp, display_name? }`
  - [ ] base64url encodes payload JSON
  - [ ] signs with HMAC SHA256
  - [ ] renders iframe pointing to `https://successpath.porchlyte.com/embed`
  - [ ] uses `postMessage(..., "https://successpath.porchlyte.com")` to send `{ type, payload, sig, v }`

### Phase 3 — App token exchange + session cookie
- [ ] Add Vercel env vars:
  - [ ] `WP_SSO_SECRET` (must match WP)
  - [ ] `APP_SESSION_SECRET`
  - [ ] `ALLOWED_WP_ORIGINS=https://members.porchlyte.com`
  - [ ] `APP_ORIGIN=https://successpath.porchlyte.com`
- [x] Implement `POST /api/auth/wp/exchange`:
  - [x] validate origin/referer allowlist
  - [x] verify HMAC signature
  - [x] validate TTL (`iat/exp`)
  - [x] validate membership is active (server policy helper)
  - [x] upsert `app_users` row for `wp_user_id`
  - [x] ensure `success_path_sessions` active row exists
  - [x] set httpOnly app session cookie
- [x] Add CSP header:
  - [x] `frame-ancestors https://members.porchlyte.com;`

### Phase 4 — App persistence endpoints (Supabase service role)
- [x] Implement `GET /api/session/ensure`:
  - [x] read app session cookie
  - [x] load/create active session
  - [x] return session + last N messages
- [x] Implement `PATCH /api/session`:
  - [x] update `active_step_id`, `active_task_id`, `diagnostic_answers`
- [x] Implement `PATCH /api/progress`:
  - [x] persist `completed_item_ids`
- [x] Implement `POST /api/messages`:
  - [x] persist messages with optional `step_id/task_id`

### Phase 5 — Wire UI to persistence
- [x] On app boot (iframe embed route):
  - [x] listen for `postMessage` token (on `/embed`)
  - [x] call `/api/auth/wp/exchange` (sets cookie)
  - [x] call `/api/session/ensure` (fetches session/messages)
  - [ ] hydrate `activeStepId`, progress, and chat messages into the main UI state (still needed)
- [ ] On “Get help on this”:
  - [ ] persist `active_task_id` via `PATCH /api/session`
- [ ] On checklist toggle:
  - [ ] persist via `PATCH /api/progress`
- [x] On chat send:
  - [x] store user message via `/api/messages`
  - [ ] call `/api/llm` with persisted context
  - [x] store assistant message via `/api/messages`

### Phase 5.1 — Follow-up wiring tasks I added (next)
- [ ] Update `ChatManager` to accept optional server-hydrated props:
  - [ ] initial messages from `/api/session/ensure`
  - [ ] initial `activeStepId`, `activeTaskId`, `completedItemIds`, `diagnosticAnswers`
- [ ] Persist UI actions:
  - [ ] When a step is selected/built: `PATCH /api/session` with `activeStepId`
  - [ ] When “Get help on this” is clicked: `PATCH /api/session` with `activeTaskId`
  - [ ] When checklist toggles: `PATCH /api/progress` with `completedItemIds`
  - [ ] When sending chat:
    - [x] `POST /api/messages` for user message
    - [ ] call `/api/llm` using last N persisted messages + current session context
    - [x] `POST /api/messages` for assistant message
- [ ] Decide message window sizes:
  - [ ] how many messages to load (default 20)
  - [ ] how many messages to send to LLM per turn (recommend 8–12)

### Phase 6 — QA / reliability
- [ ] Test in Safari + Chrome (iframe contexts)
- [ ] Confirm two WP users see different sessions/messages
- [ ] Confirm token exchange rejects expired/bad signatures
- [ ] Confirm app cannot be embedded outside `members.porchlyte.com`

### Phase 7 — Deploy + embedded smoke test (added)
- [ ] Deploy to Vercel with production env vars set (see USER TO DO)
- [ ] In WP members page, embed iframe: `https://successpath.porchlyte.com/embed`
- [ ] Confirm `/embed` receives postMessage and the app loads (no “Waiting for sign-in…” screen)
- [ ] Send a chat message and confirm:
 - [ ] a new row is created in `public.success_path_messages` with role `user`
 - [ ] the assistant reply is created in `public.success_path_messages` with role `assistant`
- [ ] Open the same WP page as a second WP user and confirm messages are isolated per user




USER TO DO

What you need to set in Vercel env (Phase 3 + Phase 1)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WP_SSO_SECRET`
- `APP_SESSION_SECRET`
- `ALLOWED_WP_ORIGINS=https://members.porchlyte.com`
- `APP_ORIGIN=https://successpath.porchlyte.com
