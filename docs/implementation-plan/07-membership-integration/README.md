# Membership Integration Plan (WordPress → Next.js on Vercel → Supabase)
## Social Media Success Path (embedded “inside membership” with Elementor header/nav)

This document defines the **production** integration plan to embed the Success Path app into the existing WordPress membership site:

- WordPress (Elementor Cloud) remains the **Identity Provider** and controls membership access.
- The Success Path app runs on **Vercel**, exposed at the custom app origin:
  - `https://successpath.porchlyte.com`
- All persistence is stored in **Supabase** and keyed to the **current WordPress user**.
- The membership page retains the **global Elementor header/nav** and “page chrome”.

Primary goals:
- A logged-in WordPress member sees **their** Success Path progress and chat history immediately.
- No fragile cross-site cookie dependencies.
- No client-side direct access to Supabase (Pattern A).
- Minimal WP customization: a small shortcode/snippet + an app exchange endpoint.

Key integration constants (v1):
- WordPress membership origin (parent): `https://members.porchlyte.com`
- App origin (iframe): `https://successpath.porchlyte.com`
- postMessage message type: `PORCHLYTE_WP_SSO_V1`

---

## 0) Locked decisions (v1)
### 0.1 Integration shape
- A WordPress page inside the membership (Elementor) embeds the app via an iframe.
- Identity is provided to the iframe using **postMessage** from the parent page.
- The iframe exchanges a **short-lived HMAC-signed payload** for an app session.
- The app is hosted at: `https://successpath.porchlyte.com`

### 0.2 Supabase access pattern
Pattern A:
- Supabase is accessed **server-side only** using the `SUPABASE_SERVICE_ROLE_KEY`.

### 0.3 Token format
We will use an **HMAC-signed JSON payload** (not JWT) minted by WordPress.

Why HMAC is best here:
- fewer PHP JWT pitfalls
- easy to implement + audit
- short-lived tokens are sufficient

---

## 1) High-level architecture
### Components
1. **WordPress membership page** (on `members.porchlyte.com/...`)
   - Renders Elementor header/nav + a content area
   - Includes an iframe to the Vercel app
   - Sends a signed SSO payload to the iframe via `window.postMessage()`

2. **Next.js app on Vercel**
   - Receives the payload
   - Calls `POST /api/auth/wp/exchange`
   - Sets an httpOnly app session cookie for subsequent API calls
   - Hydrates UI by calling `GET /api/session/ensure`

3. **Supabase (Postgres)**
   - Stores:
     - user mapping (`wp_user_id` → internal uuid)
     - active session context (active step/task + progress)
     - chat messages

### Why this is reliable
This avoids the two common failure modes for iframe auth:
- third-party cookie restrictions in iframes
- WP REST nonce/cookie requirements from cross-origin contexts

Instead, we treat WordPress as the IdP and do a standard “token exchange” into the app.

---

## 2) WordPress requirements (minimal)
### 2.1 Shortcode (or Elementor HTML widget) responsibilities
On the membership page, we need:
- an iframe container
- a script that:
  - mints a short-lived payload (server-side PHP)
  - sends it to the iframe using `postMessage`

We can implement as:
- a small plugin with a shortcode, e.g. `[porchlyte_success_path]`, OR
- a theme snippet if you already manage custom code.

### 2.2 Payload contents
Minimum payload fields:
- `wp_user_id` (number)
- `iat` (issued-at unix seconds)
- `exp` (expiry unix seconds; TTL 60–300 seconds)
- `membership` (boolean or tier string)
- optional: `display_name`, `email` (convenience only)

Example payload (conceptual):
```json
{
  "wp_user_id": 456,
  "membership": "active",
  "iat": 1730000000,
  "exp": 1730000300,
  "display_name": "Alex Agent"
}
```

### 2.3 Signing
Compute:
- `sig = HMAC_SHA256(base64url(payload_json), WP_SSO_SECRET)`

Send to iframe:
- `payload` (base64url JSON string)
- `sig` (hex or base64url)
- `v` (version number, e.g. 1)

---

## 3) postMessage protocol (parent → iframe)
### 3.1 Message format
Parent sends:
- `type: "PORCHLYTE_WP_SSO_V1"`
- `payload: "<base64url...>"`
- `sig: "<signature>"`
- `issuedAt: <optional>` (debug)
- `appOrigin: "https://successpath.porchlyte.com"` (optional)

### 3.2 Security requirements
In parent page:
- Only send messages to the expected iframe origin:
  - `iframe.contentWindow.postMessage(msg, "https://successpath.porchlyte.com")`

In iframe app:
- Only accept messages where:
  - `event.origin === "https://members.porchlyte.com"` (or allowed set)
  - `event.data.type` matches
- Never accept a token from an untrusted origin.

---

## 4) Next.js app session design
### 4.1 Exchange endpoint
`POST /api/auth/wp/exchange`

Request body:
- `{ payload, sig, v }`

Server actions:
- validate request origin (defense-in-depth):
  - require `Origin` or `Referer` to be `https://members.porchlyte.com` (or allowlist)
- recompute expected signature using `WP_SSO_SECRET`
- parse payload JSON
- validate:
  - `exp` not expired
  - `iat` not too far in the future/past
  - `wp_user_id` is a positive integer
  - membership active / tier allowed
- upsert `app_users` for `wp_user_id`
- ensure an active `success_path_sessions` row exists
- set app session cookie (httpOnly, secure)

Response:
- 200 `{ ok: true }` (and cookie is set)

### 4.2 App session cookie
We mint our own session cookie (httpOnly) that contains:
- internal `user_id` uuid
- `wp_user_id`
- expiry (e.g. 7 days)
- signature (APP_SESSION_SECRET)

This avoids requiring the client to repeatedly pass tokens.

---

## 5) Supabase persistence (Pattern A)
We’ll use migrations under:
- `supabase/migrations/*`

Core tables:
- `public.app_users`
- `public.success_path_sessions`
- `public.success_path_messages`

All DB access occurs in Next.js server routes using `SUPABASE_SERVICE_ROLE_KEY`.

---

## 6) Next.js API surface (v1)
All endpoints require a valid app session cookie.

### 6.1 `GET /api/session/ensure`
Returns:
- user mapping
- active session row
- last N messages (e.g. 20)

### 6.2 `PATCH /api/session`
Persists:
- `active_step_id`
- `active_task_id`
- (optional) diagnostic answers

### 6.3 `PATCH /api/progress`
Persists:
- `completed_item_ids` (or toggle semantics)

### 6.4 `POST /api/messages`
Persists:
- user and assistant messages with optional `step_id/task_id`

### 6.5 `POST /api/llm` (already exists)
Update required:
- include:
  - last N messages
  - active step id/spec (or a narrow slice)
  - active task context (if set)
  - progress summary
- persist user + assistant messages via `/api/messages`

---

## 7) Client wiring (Success Path app)
### 7.1 Boot sequence
1. Render a minimal “Connecting…” state in the iframe.
2. Listen for `postMessage` SSO event from parent.
3. Call `/api/auth/wp/exchange`.
4. Call `/api/session/ensure`.
5. Hydrate:
   - active step
   - completed items
   - recent messages

### 7.2 Runtime persistence
- Task toggle → `PATCH /api/progress`
- “Get help on this” → set `active_task_id` via `PATCH /api/session`
- Send message → `/api/messages` then `/api/llm` then `/api/messages`

---

## 8) Environment variables
### Vercel (server-only)
- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_SESSION_SECRET` (for signing app session cookie)
- `WP_SSO_SECRET` (must match WordPress secret)
- `ALLOWED_WP_ORIGINS` (v1: `https://members.porchlyte.com`)
- `APP_ORIGIN` (v1: `https://successpath.porchlyte.com`)

### WordPress (server-side)
- `WP_SSO_SECRET` (same value as Vercel env var)

---

## 9) Hardening / safety checklist
- Use short token TTL (60–300 seconds)
- Verify `Origin`/`Referer` on exchange endpoint
- Add CSP frame restrictions on the app:
  - `Content-Security-Policy: frame-ancestors https://members.porchlyte.com;`
- Never log raw payload/sig
- Rate limit `/api/auth/wp/exchange` and `/api/llm` (Cloudflare or Vercel middleware)
- Ensure `postMessage` targetOrigin is exactly:
  - `https://successpath.porchlyte.com`

---

## 10) Testing checklist (definition of done)
- [ ] Logged-in WP member opens the membership page with iframe and sees their saved state
- [ ] Refresh keeps:
  - active step
  - active task context
  - completed items
  - recent messages
- [ ] Two different WP users never see each other’s data
- [ ] Token exchange rejects:
  - expired tokens
  - wrong signature
  - wrong origin
- [ ] App cannot be embedded on a non-members domain (CSP frame-ancestors)

---

## 11) Open questions (to finalize implementation)
1. Should we store membership tier in Supabase for analytics, or treat WP as the only source of membership truth?
2. How many messages to load by default (20/50) and how many to send to LLM per turn (8–12 recommended)?
3. Do we want “one active session per user” (v1) forever, or support multiple sessions/history (v2)?

---

## 12) Implementation Task List (follow-along checklist)
This is the step-by-step execution list to implement membership integration end-to-end.

TASK LIST: docs/implementation-plan/07-membership-integration/implementation-todo-list.md
