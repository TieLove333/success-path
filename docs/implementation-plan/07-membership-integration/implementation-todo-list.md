Implementation Task List (follow-along checklist)
This is the step-by-step execution list to implement membership integration end-to-end.

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
- [ ] Implement `POST /api/auth/wp/exchange`:
  - [ ] validate origin/referer allowlist
  - [ ] verify HMAC signature
  - [ ] validate TTL (`iat/exp`)
  - [ ] validate membership is active
  - [ ] upsert `app_users` row for `wp_user_id`
  - [ ] ensure `success_path_sessions` active row exists
  - [ ] set httpOnly app session cookie
- [ ] Add CSP header:
  - [ ] `frame-ancestors https://members.porchlyte.com;`

### Phase 4 — App persistence endpoints (Supabase service role)
- [ ] Implement `GET /api/session/ensure`:
  - [ ] read app session cookie
  - [ ] load/create active session
  - [ ] return session + last N messages
- [ ] Implement `PATCH /api/session`:
  - [ ] update `active_step_id`, `active_task_id`, `diagnostic_answers`
- [ ] Implement `PATCH /api/progress`:
  - [ ] persist `completed_item_ids`
- [ ] Implement `POST /api/messages`:
  - [ ] persist messages with optional `step_id/task_id`

### Phase 5 — Wire UI to persistence
- [ ] On app boot:
  - [ ] listen for `postMessage` token
  - [ ] call `/api/auth/wp/exchange`
  - [ ] call `/api/session/ensure`
  - [ ] hydrate `activeStepId`, progress, and chat messages
- [ ] On “Get help on this”:
  - [ ] persist `active_task_id` via `PATCH /api/session`
- [ ] On checklist toggle:
  - [ ] persist via `PATCH /api/progress`
- [ ] On chat send:
  - [ ] store user message via `/api/messages`
  - [ ] call `/api/llm` with persisted context
  - [ ] store assistant message via `/api/messages`

### Phase 6 — QA / reliability
- [ ] Test in Safari + Chrome (iframe contexts)
- [ ] Confirm two WP users see different sessions/messages
- [ ] Confirm token exchange rejects expired/bad signatures
- [ ] Confirm app cannot be embedded outside `members.porchlyte.com`
