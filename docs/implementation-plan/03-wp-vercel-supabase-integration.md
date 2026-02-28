# WordPress + Vercel + Supabase Integration Plan
## Social Media Success Path

This plan covers how to integrate the Next.js app with:
- a **WordPress membership platform** (identity + access control)
- **Vercel** deployment (environments, secrets, previews)
- **Supabase** (database, optional auth, RLS, progress persistence)

It is designed to support the product requirements:
1) chat + todo/progress tracking UI
2) OpenAI/LLM structured outputs rendered as UI artifacts
3) persistence keyed to **WordPress user IDs**
4) curriculum phases (4 modules) with progress + resume

---

## 0) Guiding decisions (make these explicit early)

Before implementation, you need to choose the **integration mode** between WordPress membership and the Vercel-hosted app. These are the viable options; pick one as the primary path.

### Option A — SSO from WordPress → Next.js (recommended)
**WordPress remains the source of truth for authentication and membership status.**

Flow:
1. User logs into WP / membership.io.
2. WP generates a **short-lived signed token** (JWT or HMAC-signed payload) containing:
   - `wp_user_id`
   - membership tier/role
   - `exp` (very short TTL, e.g. 5 minutes)
3. User is redirected/embedded into the Next.js app with the token.
4. Next.js verifies token server-side and creates/updates a Supabase user mapping.
5. Next.js issues its own session cookie (httpOnly) for subsequent requests.

Pros:
- No separate login UX
- WP access rules remain authoritative
- Clean mapping to Supabase tables

Cons:
- Requires WP plugin or custom snippet to mint tokens

### Option B — “Shared login” using Supabase Auth
User authenticates directly in Next.js (email magic link/OAuth), and you attempt to correlate to WP membership by email.

Pros:
- Quick to implement if you don’t want WP customization

Cons:
- Membership access becomes messy (you still must verify paid status in WP)
- Email mismatch edge cases
- More support burden

### Option C — WP proxy API (backend-to-backend)
Next.js uses WP as an API to validate session cookies (or REST nonce) on each request.

Pros:
- Minimal token work

Cons:
- CORS/cookie complexity
- Request latency + fragility
- Harder on Vercel edge/runtime constraints

**Recommendation:** Option A.

---

## 1) Identity model and what “user” means

You need a consistent identity boundary:

- **WordPress user**: the paid member identity (primary)
- **App user** (Supabase DB row): internal UUID keyed to `wp_user_id`
- **Session**: cookie-based session in Next.js derived from verified WP token

Avoid trying to make Supabase Auth the primary auth system unless you intend to migrate membership logic away from WP.

---

## 2) Supabase setup

### 2.1 Create Supabase project
- Create a Supabase project for `sociamediasuccesspath`.
- Capture:
  - Project URL
  - `anon` key (safe for client use if RLS is correct)
  - `service_role` key (server-only; never expose to client)

### 2.2 Choose what Supabase is responsible for
Minimum viable responsibilities:
- Postgres database to store:
  - WP user mapping
  - curriculum progress
  - chat sessions (optional)
  - artifact outputs (optional)

Optional responsibilities:
- file storage (templates, uploads)
- realtime (progress sync across tabs)
- Supabase Auth (only if you pick Option B)

### 2.3 Enable RLS (required)
Assume all tables require Row Level Security.
If you are not using Supabase Auth, you will need a strategy:
- either use **service role** only (server-side reads/writes) and never query directly from client
- or implement **JWT-based PostgREST access** with custom JWT claims (more advanced)

**Recommended for this project:** keep all Supabase access server-side initially:
- Next.js API routes read/write Supabase using `service_role`
- Client calls Next.js routes only
This avoids RLS complexity until the product stabilizes.

---

## 3) Database tables (minimum viable)

Below is a practical schema. You can expand later.

### 3.1 `wp_users`
Maps WordPress identity to internal UUID.

Fields:
- `id uuid pk default gen_random_uuid()`
- `wp_user_id bigint unique not null`
- `email text` (optional but useful)
- `display_name text` (optional)
- `membership_tier text` (optional)
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### 3.2 `user_progress`
Stores user completion state in a normalized way.

Fields:
- `id uuid pk default gen_random_uuid()`
- `user_id uuid not null references wp_users(id)`
- `module_id text not null`
- `lesson_id text not null`
- `step_id text not null`
- `status text not null`  -- not_started | in_progress | completed
- `completed_task_ids jsonb not null default '[]'::jsonb`
- `step_data jsonb not null default '{}'::jsonb` -- stores generated artifacts, user answers, etc.
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Indexes:
- unique `(user_id, module_id, lesson_id, step_id)`
- index `(user_id, updated_at desc)`

### 3.3 `chat_sessions` (optional but recommended)
Fields:
- `id uuid pk default gen_random_uuid()`
- `user_id uuid not null references wp_users(id)`
- `active_module_id text`
- `active_lesson_id text`
- `active_step_id text`
- `state jsonb not null default '{}'::jsonb` -- routing state machine info
- `created_at timestamptz default now()`
- `last_active_at timestamptz default now()`

### 3.4 `chat_events` or `timeline_events` (recommended over raw messages)
Rather than storing full chat logs, store structured events:
- user input
- artifact generated
- task toggled
- step completed

Fields:
- `id uuid pk default gen_random_uuid()`
- `session_id uuid not null references chat_sessions(id)`
- `type text not null`
- `payload jsonb not null`
- `created_at timestamptz default now()`

This is better for privacy and analytics; you can still reconstruct the timeline.

---

## 4) WordPress integration (SSO token minting)

### 4.1 What WP needs to provide
A secure endpoint or page integration that can issue a short-lived token, containing:
- `wp_user_id` (required)
- membership status / tier (required)
- issued at + expiry
- optional: email

Token must be:
- signed with a server-side secret
- short-lived (minutes)
- single-use is a nice-to-have (requires server storage)

### 4.2 Token format
Two reasonable choices:

#### JWT (HS256)
- WP signs JWT with secret `WP_SSO_JWT_SECRET`
- Next.js verifies JWT signature and expiry

Pros: standard tooling, easy to validate
Cons: implement JWT in PHP carefully

#### HMAC-signed payload (simpler)
- WP builds a JSON payload and signs `HMAC_SHA256(payload, secret)`
- Next.js recomputes signature

Pros: dead simple, fewer JWT pitfalls
Cons: custom format, but fine

### 4.3 Delivery mechanism
#### Redirect SSO (most common)
- WP page contains a “Launch Success Path” link to:
  - `https://app.yourdomain.com/sso?token=...`

Next.js `/sso` route:
- validates token
- sets an httpOnly cookie session
- redirects user to `/` (app home)

#### Embedded iframe (possible but adds complexity)
- membership site embeds Vercel app in iframe
- you still need a secure token mechanism
- third-party cookies can break sessions; prefer same-site domain strategy

**Recommendation:** redirect SSO, avoid iframe unless you need seamless embed.

---

## 5) Next.js auth/session design

### 5.1 Session cookie
Once WP token is verified, Next.js should mint its own session cookie:
- httpOnly
- secure
- sameSite=Lax (or Strict if fully same-site)
- stores either:
  - signed session JWT (app-secret)
  - or opaque session id stored in DB/Redis (overkill for v1)

**Recommended v1:** signed session JWT cookie with:
- `user_id` (internal UUID)
- `wp_user_id`
- `tier`
- `exp` (e.g. 7 days)
This avoids a separate session store.

### 5.2 Middleware protection
Add Next.js middleware to protect app routes:
- if no valid session cookie → redirect to WP login/launch page
- if session exists but tier is insufficient → show “upgrade” screen (links back to WP)

### 5.3 Server-side Supabase access
All reads/writes to Supabase should happen in server routes / server actions, using:
- `service_role` key
- never from client until RLS is fully designed and tested

---

## 6) Vercel deployment plan

### 6.1 Environments
Set up:
- **Production**: `app.yourdomain.com`
- **Preview**: Vercel preview deployments per PR
- **Development**: local `.env.local`

### 6.2 Environment variables (minimum)
On Vercel:
- `OPENAI_API_KEY` (server-only)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (optional; server-only use is fine)
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `APP_SESSION_SECRET` (signing session cookie)
- `WP_SSO_SECRET` (JWT secret or HMAC secret)
- `WP_BASE_URL` (for redirects back to WP)
- `APP_BASE_URL` (canonical app URL)

Security notes:
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.
- Keep secrets different per environment.
- If you use JWT tokens from WP, rotate secrets periodically.

### 6.3 Domain strategy
Prefer same-site domain pairing to reduce cookie pain:
- WP: `members.yourdomain.com`
- App: `app.yourdomain.com`

This makes SSO and redirects simpler and more reliable.

---

## 7) Implementation phases (sequenced)

### Phase 1 — Infrastructure (Supabase + Vercel baseline)
- [ ] Create Supabase project
- [ ] Create DB tables
- [ ] Configure Vercel env vars
- [ ] Add server-side Supabase client helper (service role only)
- [ ] Add basic health endpoint `/api/health` that checks DB connectivity

Deliverable: app deploys to Vercel and can talk to Supabase.

### Phase 2 — WP SSO handshake
- [ ] WP: implement token minting (plugin or code snippet)
- [ ] Next.js: implement `/sso` route:
  - validate token
  - upsert `wp_users` mapping
  - set session cookie
  - redirect to app
- [ ] Add middleware that requires session cookie for app routes

Deliverable: a logged-in WP member can enter the app and has a stable internal user id.

### Phase 3 — Progress persistence
- [ ] On load, fetch user’s current active context and progress
- [ ] On checklist toggle, persist `completed_task_ids`
- [ ] On step completion, persist `status = completed` and `completed_at`
- [ ] Add resume behavior (active step)

Deliverable: user progress survives refresh and works across devices.

### Phase 4 — Membership gating + tier logic
- [ ] Store tier from WP in session + `wp_users.membership_tier`
- [ ] Add server checks for access to modules/lessons by tier
- [ ] Add upgrade redirect flow back to WP

Deliverable: only paid members can access, and tiers can unlock content.

### Phase 5 — Operational hardening
- [ ] Logging + request IDs
- [ ] Rate limiting on sensitive endpoints (`/sso`, `/api/llm`)
- [ ] Audit events table for key actions
- [ ] Alerts/monitoring (Vercel logs + Supabase logs)

---

## 8) Security checklist (must-have)

### WP token security
- token TTL: 5 minutes (or less)
- include `aud` / `iss` fields and verify them server-side
- verify signature and expiry server-side only
- never log raw tokens

### Session cookie security
- httpOnly + secure
- rotate session secret periodically
- keep session TTL reasonable (7–30 days)

### Supabase security
- service role key is server-only
- if/when you expose Supabase to client, implement RLS and JWT claims properly

### Input validation
- validate all IDs (`moduleId`, `lessonId`, `stepId`) server-side
- never trust client “completed” claims without verifying allowed transitions

---

## 9) Testing plan

### Local testing
- “Mock SSO” route in dev only:
  - allows you to simulate a WP user id without WP
- Seed a fake user mapping and progress data
- Verify:
  - session cookie set
  - middleware redirects when missing
  - progress saves and reloads

### Integration testing
- From WP membership site:
  - logged out → cannot access app
  - logged in → can launch app
  - expired token → rejected
  - tier mismatch → upgrade prompt

---

## 10) Open questions (need your answers to finalize)
1) Do you want the app embedded in membership.io, or opened in a new tab as a dedicated app URL?
2) What is the membership access model?
   - single tier with full access, or multiple tiers unlocking modules?
3) Do you want to store full chat transcripts, or only structured “timeline events” + progress?
4) Is WP allowed to call the Vercel app server-to-server (webhooks) for subscription changes, or do we poll?

---

## 11) Definition of Done (integration)
- [ ] WP member can SSO into the Vercel app
- [ ] App can map `wp_user_id` → internal `user_id`
- [ ] Progress persists in Supabase and resumes on reload
- [ ] Membership tier gates modules/lessons correctly
- [ ] Secrets are correctly configured on Vercel and not exposed client-side
- [ ] Basic logging exists for SSO + progress writes

---