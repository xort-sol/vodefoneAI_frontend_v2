# Vodafone AI Sales Demo Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one real path work in the v2 frontend for the pitch to the Vodafone sales team: sign-in → leads → campaign → real AI call to a test phone → live view → transcript and analysis → qualified lead handover → real overview numbers.

**Architecture:** The old Python backend and Supabase schema have been copied into a new repo, `vodafoneAI_backend_v2`, and are extended there with additive changes. v2 reads and writes Supabase directly under row-level security, and a small FastAPI service holds only what needs the LiveKit secret. v2 gets a **Live** mode alongside today's **Demo data** mode, so out-of-scope screens stay on untouched synthetic data and synthetic records never mix with real ones.

**Tech Stack:** Python 3.13, uv, LiveKit Agents 1.8, psycopg, FastAPI, Supabase Postgres and Auth, React 18, Vite, `@supabase/supabase-js`, `livekit-client`, Vitest.

**Spec:** The "Agreed scope" section below. It records the decisions made in conversation on 5 Nov 2026; there is no separate spec document.

## Agreed scope

- Audience: the Vodafone sales team, as a product pitch. Pitch date: not known yet.
- Market: Ireland (Europe/Dublin, €, +353, existing Twilio trunk).
- The agent says it is calling "on behalf of Vodafone".
- Real calls go to allowlisted test phones only.
- **Real in Live mode:** Login, Overview, Leads and Lead profile, Campaigns and wizard, AI Calling Centre (list, transcript, listen-in), Conversations, Call History, Qualified Leads and Handover.
- **Demo data mode only:** AI Agents builder, Appointments, My Workspace, Analytics, Products editing, Team, Compliance, Notifications, Settings.
- **Not built:** recordings, whisper, takeover, force-end, CRM and calendar integrations, MFA and SSO, Excel import, cloud hosting of the API and dialler.

## Where the work happens

| | Repo | Branch | Base |
| --- | --- | --- | --- |
| Tasks 1-5 | `/Users/mac/Project/vodefoneAI-v2/vodafoneAI_backend_v2` | `demo-backend` | `main`, after the baseline commit |
| Tasks 6-10 | `/Users/mac/Project/vodefoneAI-v2/vodefoneAI_frontend_v2` | `live-data` | `main` |

The backend repo is flat: `src/`, `tests/`, `supabase/` and `pyproject.toml` sit at its root, and all backend commands run from there. It was copied from `VodafonaAi` at `phase-2-web-app` (`b0864dd`) with `tests/conftest.py` pointed at the new `supabase/` location. It has no commits yet, so start with a baseline commit of the copied code. `VodafonaAi` itself stays unchanged. `.env` was not copied: create it from `.env.example` with the values in the old `.env`.

## Global Constraints

- Migrations are new files only; never edit an applied migration. Changes are additive.
- All SQL stays in `src/shared/db.py`; blocking DB calls run through `asyncio.to_thread` from async code.
- Keep `leads.status` as the dialler's own state. Salesperson decisions go in the new `leads.sales_status`.
- The dialler refuses to start without `DIAL_ALLOWLIST`. Never use `*` for the pitch.
- Dialler never rings a lead without consent, on the suppression list, archived, or with a `sales_status`.
- Secrets stay server-side: `LIVEKIT_API_SECRET` and `DATABASE_URL` never reach the browser. Only `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_API_URL` are frontend env.
- Tests never touch the production database or real Sheet (`conftest.safe_env`).
- Any prompt change requires the persona eval: `uv run pytest -m eval`. It spends LLM credits, so confirm with the user first.
- Commits in both repos carry no Claude attribution: no `Co-Authored-By: Claude ...` trailer, no `Claude-Session:` link, and no other Claude attribution lines (each repo's `CLAUDE.md`).
- **User approval required before:** `supabase db push`, `lk agent deploy`, updating LiveKit secrets, and any real call.

## Review Focus

1. Irish numbers typed in local form (`087 123 4567`) must import as `+353871234567`, or the allowlist, suppression and live-room matching all fail. Test in Task 6.
2. A live room with no matching lead (for example a manual test) must still show as a call, labelled by phone, and never crash the Calling page. Test in Task 9.
3. The API or LiveKit being down during the pitch must show an error on the Calling page, while every Supabase-backed screen keeps working. Tests in Tasks 5 and 9.
4. A signed-in user with no role must see a clear message and no data. Test in Task 7.
5. A salesperson's decision must stop the dialler: a lead marked Not interested must not be rung again and must not hold a campaign open. Test in Task 2.

---

## File structure

**Backend (`vodafoneAI_backend_v2`)**

| File | Change |
| --- | --- |
| `supabase/migrations/20261106120000_v2_demo.sql` | Create: columns, `lead_notes`, policies, column grants |
| `src/shared/db.py` | Modify: claim filters, lead summary fields, per-campaign retries, time parsing, role lookup |
| `src/dialler/main.py` | Modify: calling days, per-campaign concurrency |
| `src/analysis/analyse.py` | Modify: extra analysis fields |
| `src/agent/main.py` | Modify: wording, UTC offset, transcript offsets |
| `src/api/__init__.py`, `src/api/main.py` | Create: FastAPI service |
| `scripts/demo.sh` | Create: starts API and dialler together |

**Frontend (v2)**

| File | Change |
| --- | --- |
| `src/live/client.ts` | Create: Supabase client, `isLiveConfigured()`, mode storage |
| `src/live/adapters.ts` | Create: database rows ↔ v2 types, pure functions |
| `src/live/repo.ts` | Create: all Supabase reads and writes |
| `src/live/liveCalls.ts` | Create: API polling, LiveKit listen-in |
| `src/store/store.tsx` | Modify: Live mode loading and write-through |
| `src/App.tsx`, `src/pages/Login.tsx`, `src/layout/Shell.tsx` | Modify: real auth, nav, mode switch |
| `src/pages/Calling.tsx` | Modify: real live calls |
| `src/data/seed.ts`, `src/lib/format.ts`, `src/pages/leads/shared.tsx` | Modify: Irish market |

---

## Backend tasks

### Task 1: Schema for v2

**Files:**
- Create: `supabase/migrations/20261106120000_v2_demo.sql`
- Modify: `tests/test_schema.py`, `tests/test_dialler.py`, `tests/test_db.py` (lead fixtures gain `consent = true`)

**Interfaces:**
- Produces, on `leads`: `email text, city text, customer_type text, source text, tags text[] not null default '{}', consent boolean not null default false, archived boolean not null default false, assigned_to uuid references profiles, sales_status text, score int, sentiment text, ai_summary text, last_call_at timestamptz, next_follow_up timestamptz, product_ref text`.
- Produces, on `campaigns`: `product_ref text, agent_ref text, offer_ref text, description text, segment text, start_date timestamptz, end_date timestamptz, days text[] not null default '{Mon,Tue,Wed,Thu,Fri}', max_attempts int not null default 3, retry_hours int not null default 4, concurrency int not null default 2, min_score int not null default 70`, plus check `calling_hours_end > calling_hours_start`.
- Produces: `transcripts.t_seconds int`; `analyses.questions text[]`, `analyses.unanswered text[]`, `analyses.qualification jsonb`.
- Produces: table `lead_notes (id bigint identity pk, lead_id bigint not null references leads on delete cascade, author text not null, text text not null, created_at timestamptz not null default now())`.

- [ ] **Step 1: Write the failing tests in `test_schema.py`**

```python
def test_salesperson_can_set_sales_status_but_not_dialler_state(conn, as_user, users):
    lead_id = conn.execute("insert into leads (phone) values ('+353870000001') returning id").fetchone()[0]
    as_user(conn, users["salesperson"])
    assert conn.execute("update leads set sales_status = 'Converted' where id = %s", [lead_id]).rowcount == 1
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        conn.execute("update leads set attempts = 0 where id = %s", [lead_id])

def test_analyst_cannot_change_leads(conn, as_user, users):
    lead_id = conn.execute("insert into leads (phone) values ('+353870000002') returning id").fetchone()[0]
    as_user(conn, users["analyst"])
    assert conn.execute("update leads set sales_status = 'Hot' where id = %s", [lead_id]).rowcount == 0

def test_every_role_can_read_team_names(conn, as_user, users):
    as_user(conn, users["analyst"])
    assert conn.execute("select count(*) from profiles").fetchone()[0] >= 4

def test_calling_hours_must_end_after_they_start(conn):
    with pytest.raises(psycopg.errors.CheckViolation):
        conn.execute("insert into campaigns (name, calling_hours_start, calling_hours_end) values ('x', '22:00', '06:00')")

def test_sellers_add_suppression_and_managers_remove_it(conn, as_user, users):
    as_user(conn, users["salesperson"])
    assert allowed(conn, "insert into suppression (phone, source) values ('+353870000003', 'manual')", [])
    assert conn.execute("delete from suppression where phone = '+353870000003'").rowcount == 0
```

Reuse the role-creation helper already in `test_schema.py`; if it has a different name, expose it as the `users` fixture.

- [ ] **Step 2: Run to verify failure**

Run: `uv run pytest tests/test_schema.py -v`
Expected: FAIL, columns do not exist.

- [ ] **Step 3: Write the migration**

Beyond the columns above:
- Policy `"sellers change leads"` on `leads` for update: `app_role() in ('admin','sales_manager','salesperson')`, using and with check.
- `revoke update on public.leads from anon, authenticated;` then `grant update (name, email, city, customer_type, tags, consent, archived, assigned_to, sales_status, next_follow_up, product_ref, campaign_id) on public.leads to authenticated;` so the web can never edit `status`, `attempts`, `next_attempt_at` or `dialled_at`.
- Replace the `profiles` select policy with one for any role: `app_role() is not null or id = auth.uid()`.
- `lead_notes`: enable RLS; any role reads; admin, manager and salesperson insert.
- `suppression`: insert for admin, manager, salesperson with `source = 'manual'`; delete for admin, manager.
- Backfill any existing campaign with `calling_hours_end <= calling_hours_start` before adding the check.

- [ ] **Step 4: Set `consent = true` in the lead fixtures of `test_dialler.py` and `test_db.py`, then run the full suite**

Run: `uv run pytest`
Expected: PASS, apart from tests that need LiveKit keys when those are absent.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations tests
git commit -m "feat: schema for the v2 frontend: lead fields, notes, campaign settings, column-level lead writes"
```

### Task 2: Dialler rules v2 depends on

**Files:**
- Modify: `src/shared/db.py`, `src/dialler/main.py`
- Test: `tests/test_dialler.py`, `tests/test_db.py`

**Interfaces:**
- Consumes: Task 1 columns.
- Produces: `next_lead_state(outcome: str, attempts: int, callback_at: datetime | None, now: datetime, max_attempts: int = 3, retry_after: timedelta = RETRY_AFTER) -> tuple[str, datetime | None]`.
- Produces: `claim_leads(campaign_id: int, n: int, allowlist: set[str] | None, now: datetime, max_attempts: int = MAX_ATTEMPTS) -> list[dict]`.
- Produces: `running_campaigns()` rows also carry `days, concurrency, max_attempts`.
- Produces: `in_calling_days(local: datetime, days: list[str]) -> bool` in `dialler/main.py`.

- [ ] **Step 1: Write the failing tests**

```python
def test_lead_without_consent_is_never_claimed(...):        # consent=false -> claim_leads returns []
def test_archived_lead_is_never_claimed(...):               # archived=true -> []
def test_lead_with_sales_status_is_not_claimed_and_does_not_hold_the_campaign_open(...):
    # sales_status='Not interested', status='retry' -> [] and finish_campaign_if_empty sets 'done'
def test_suppressed_lead_moves_to_do_not_call_and_campaign_finishes(...):
    # status 'new', phone suppressed -> after claim_leads status == 'do_not_call'; campaign reaches 'done'
def test_given_up_lead_has_no_next_call_time(...):
    # stale dialling at max attempts -> status 'exhausted', next_attempt_at is None
def test_campaign_retry_settings_are_used():
    now = datetime(2026, 11, 4, 12, tzinfo=timezone.utc)
    assert next_lead_state("no_answer", 1, None, now, max_attempts=2, retry_after=timedelta(hours=1)) == ("retry", now + timedelta(hours=1))
    assert next_lead_state("no_answer", 2, None, now, max_attempts=2, retry_after=timedelta(hours=1)) == ("exhausted", None)
def test_no_calls_on_a_day_the_campaign_is_off():
    assert not in_calling_days(datetime(2026, 11, 8, 12, tzinfo=IRELAND), ["Mon", "Tue", "Wed", "Thu", "Fri"])  # a Sunday
def test_campaign_concurrency_limits_the_tick(...):         # concurrency=1, two due leads -> one dispatch
def test_callback_time_without_offset_is_read_as_irish_time(...):
    # callback_at '2027-07-01T10:00:00' -> stored as 09:00 UTC
def test_callback_time_in_the_past_counts_as_no_usable_time(...):
    # outcome 'callback', past callback_at -> lead status 'interested', next_attempt_at None
```

- [ ] **Step 2: Run to verify failure**

Run: `uv run pytest tests/test_dialler.py tests/test_db.py -v`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement**

- `claim_leads`: first update suppressed `new/retry/callback` leads of the campaign to `do_not_call`; clear `next_attempt_at` when moving to `exhausted`; add `and consent and not archived and sales_status is null` to the due query.
- `finish_campaign_if_empty`: count only leads where `consent and not archived and sales_status is null`.
- `save_call`: read `max_attempts` and `retry_hours` by joining the lead's campaign, defaulting to 3 and 4 when there is no campaign, and pass them to `next_lead_state`.
- `_parse_time(value, now)`: a naive value takes `ZoneInfo("Europe/Dublin")`; a value before `now` returns `None`.
- `tick`: skip when `in_calling_days` is false; use `min(concurrency, c["concurrency"])`; pass `c["max_attempts"]`.

- [ ] **Step 4: Run to verify they pass**

Run: `uv run pytest tests/test_dialler.py tests/test_db.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: dialler honours consent, sales decisions, calling days and campaign retry settings"
```

### Task 3: Analysis fields and lead summary

**Files:**
- Modify: `src/analysis/analyse.py`, `src/shared/db.py`
- Test: `tests/test_analysis.py`, `tests/test_db.py`

**Interfaces:**
- Produces: `parse_analysis` result adds `questions: list[str]`, `unanswered: list[str]`, `qualification: {"need": int, "budget": int, "timeline": int, "authority": int}`, each 0-25.
- Produces: `save_analysis` also writes `leads.score, sentiment, ai_summary`. `save_call` also writes `leads.last_call_at` and `leads.next_follow_up = callback_at`.

- [ ] **Step 1: Write the failing tests**

```python
def test_parse_keeps_questions_and_qualification():
    reply = json.dumps({**GOOD, "questions": ["Is it 5G?"], "unanswered": ["Porting?"],
                        "qualification": {"need": 20, "budget": 15, "timeline": 10, "authority": 25}})
    parsed = parse_analysis(reply)
    assert parsed["unanswered"] == ["Porting?"]
    assert parsed["qualification"]["authority"] == 25

def test_parse_rejects_qualification_out_of_range():
    bad = {**GOOD, "questions": [], "unanswered": [],
           "qualification": {"need": 26, "budget": 0, "timeline": 0, "authority": 0}}
    assert parse_analysis(json.dumps(bad)) is None

def test_analysis_updates_the_lead_summary(...):
    # after save_analysis: leads.score == 80, leads.sentiment == 'positive', leads.ai_summary == brief

def test_saving_a_call_records_last_call_and_follow_up(...):
    # leads.last_call_at is set; leads.next_follow_up == callback_at
```

Add the three new keys to the `GOOD` fixture so existing tests stay valid.

- [ ] **Step 2: Run to verify failure**

Run: `uv run pytest tests/test_analysis.py tests/test_db.py -v`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement**

Add to the prompt in `build_prompt`: `"questions"` (what the customer asked), `"unanswered"` (what the agent could not answer), and `"qualification"` (need, budget, timeline, authority, each an integer 0-25). Validate them in `parse_analysis`. Wrap `qualification` in `psycopg.types.json.Json` when saving.

- [ ] **Step 4: Run to verify they pass**

Run: `uv run pytest tests/test_analysis.py tests/test_db.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: analysis records questions and qualification; leads carry their latest score and summary"
```

### Task 4: Agent wording, timing and transcript offsets

**Files:**
- Modify: `src/agent/main.py`, `src/shared/db.py`, `src/analysis/analyse.py`, `.env.example`
- Test: `tests/test_agent.py`, `tests/test_analysis.py`, `tests/test_db.py`

**Interfaces:**
- Produces: `transcript_lines(items, started_at: float) -> list[tuple[str, str, int]]`, as `(role, text, seconds_from_start)`.
- Consumes the same three-part tuple in `db.save_transcript` (writes `t_seconds`), `analyse.build_prompt` and `analyse.analyse_call`.
- Produces: `now_line(now)` output ending with the current UTC offset.

- [ ] **Step 1: Write the failing tests**

```python
def test_agent_introduces_itself_on_behalf_of_the_business(monkeypatch):
    monkeypatch.setattr(agent_module, "BUSINESS_NAME", "Vodafone")
    assert "AI assistant calling on behalf of Vodafone" in agent_module.SalesAgent(agent_module.TEST_LEAD).instructions

def test_prompt_gives_the_summer_utc_offset():
    now = datetime(2027, 7, 1, 10, 0, tzinfo=agent_module.IRELAND)
    assert "+01:00" in agent_module.now_line(now)

def test_transcript_lines_carry_seconds_from_the_start():
    # one assistant message created 12.4 s after started_at -> ("agent", "Hi", 12)

def test_transcript_offsets_are_stored(...):
    # save_transcript("j1", [("agent", "Hi", 3)]) -> t_seconds == 3
```

Update existing `lines` fixtures to three-part tuples.

- [ ] **Step 2: Run to verify failure**

Run: `uv run pytest tests/test_agent.py tests/test_analysis.py tests/test_db.py -v -k "not real"`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement**

- In the prompt's "Open" line and the voicemail instruction, use `AI assistant calling on behalf of {BUSINESS_NAME}`.
- In the `callback_at` line, replace the hardcoded `+00:00` example with "use the UTC offset given above".
- Do **not** add a "this call is recorded" line: the demo has no recordings.
- Store `self.started_at = time.time()` in `SalesAgent.__init__` and pass it to `transcript_lines` in `on_shutdown`.
- In `.env.example`, set `BUSINESS_NAME=Vodafone`.

- [ ] **Step 4: Run tests, then the persona eval**

Run: `uv run pytest`
Expected: PASS.

Run, after the user confirms the credit spend: `uv run pytest -m eval`
Expected: all personas pass, zero invented prices, AI disclosure on every call.

- [ ] **Step 5: Commit**

```bash
git add src tests .env.example
git commit -m "feat: agent calls on behalf of Vodafone, knows the UTC offset, and timestamps transcript lines"
```

### Task 5: Live-call API and demo runner

**Files:**
- Create: `src/api/__init__.py`, `src/api/main.py`, `scripts/demo.sh`
- Modify: `pyproject.toml` (add `fastapi`, `uvicorn`, `httpx`; add `src/api` to wheel packages), `src/shared/db.py`, `.env.example`
- Test: `tests/test_api.py`

**Interfaces:**
- Consumes: `db.role_of(user_id: str) -> str | None`, added here.
- Produces `GET /health` → `{"ok": true}`.
- Produces `GET /live-calls` → `[{"room": str, "phone": str | null, "started_at": int}]`, for rooms matching `^call-` with at least one participant.
- Produces `POST /live-token`, body `{"room": str}` → `{"serverUrl": str, "participantToken": str}`.
- Auth: `Authorization: Bearer <Supabase access token>`, checked by `GET {SUPABASE_URL}/auth/v1/user`. No token or an invalid one gives 401; no role or `analyst` gives 403.

- [ ] **Step 1: Write the failing tests with FastAPI `TestClient`, faking auth and LiveKit**

```python
def test_live_calls_needs_a_token(client):
    assert client.get("/live-calls").status_code == 401

def test_analyst_cannot_see_live_calls(client, signed_in):
    signed_in("analyst")
    assert client.get("/live-calls", headers=AUTH).status_code == 403

def test_user_without_a_role_is_refused(client, signed_in):
    signed_in(None)
    assert client.get("/live-calls", headers=AUTH).status_code == 403

def test_only_customer_call_rooms_are_listed(client, signed_in, rooms):
    signed_in("salesperson")
    rooms([("call-353871234567-1793710403", 2), ("web_test_x", 2), ("call-353870000000-1", 0)])
    body = client.get("/live-calls", headers=AUTH).json()
    assert [r["phone"] for r in body] == ["+353871234567"]

def test_token_is_hidden_and_listen_only(client, signed_in, rooms):
    signed_in("sales_manager")
    rooms([("call-353871234567-1793710403", 2)])
    token = client.post("/live-token", json={"room": "call-353871234567-1793710403"}, headers=AUTH).json()["participantToken"]
    grant = jwt_video_grant(token)
    assert grant["hidden"] is True and grant["canPublish"] is False and grant["canSubscribe"] is True

def test_token_for_a_room_that_is_not_live_is_404(client, signed_in, rooms):
    signed_in("sales_manager")
    rooms([])
    assert client.post("/live-token", json={"room": "call-1-1"}, headers=AUTH).status_code == 404

def test_livekit_outage_returns_502(client, signed_in, rooms_fail):
    signed_in("salesperson")
    assert client.get("/live-calls", headers=AUTH).status_code == 502
```

Fixtures live in `test_api.py`: `signed_in(role)` patches token checking and `db.role_of`; `rooms(list)` and `rooms_fail()` patch the LiveKit room list; `jwt_video_grant(token)` is `jwt.decode(token, options={"verify_signature": False})["video"]`, using PyJWT from `livekit-api`.

- [ ] **Step 2: Run to verify failure**

Run: `uv run pytest tests/test_api.py -v`
Expected: FAIL, `api.main` not found.

- [ ] **Step 3: Implement `api/main.py` and `demo.sh`**

- CORS allows only `FRONTEND_ORIGIN` (default `http://localhost:5173`).
- Token: `api.AccessToken` with a one-hour TTL, identity `observer_<uuid>`, and `VideoGrants(room_join=True, room=room, hidden=True, can_subscribe=True, can_publish=False, can_publish_data=False)`.
- `demo.sh` runs `uv run uvicorn api.main:app --port 8000` and `uv run python -m dialler.main --every 5`, stopping both on exit. It fails with a clear message when `DIAL_ALLOWLIST` is unset or `*`.
- Add `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `FRONTEND_ORIGIN` and `DIAL_ALLOWLIST` to `.env.example`.

- [ ] **Step 4: Run to verify they pass**

Run: `uv run pytest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests scripts pyproject.toml uv.lock .env.example
git commit -m "feat: live-call API with hidden listen-only tokens and a one-command demo runner"
```

---

## Frontend tasks

### Task 6: Irish market and test setup

**Files:**
- Modify: `package.json` (add `vitest`, script `"test": "vitest run"`), `src/lib/format.ts`, `src/data/seed.ts`, `src/store/store.tsx`, `src/pages/leads/shared.tsx`, `src/pages/leads/Importers.tsx`, every `fmtGBP` caller (19 files)
- Test: `src/lib/format.test.ts`, `src/pages/leads/shared.test.ts`

**Interfaces:**
- Produces: `fmtEUR(n: number, dp = 0): string`, replacing `fmtGBP`.
- Produces: `normaliseIrishPhone(raw: string): string | null`, replacing `normaliseUKPhone`, returning E.164 or null.

- [ ] **Step 1: Write the failing tests**

```ts
it('formats euro', () => expect(fmtEUR(1250)).toBe('€1,250'));
it.each([
  ['087 123 4567', '+353871234567'],
  ['00353871234567', '+353871234567'],
  ['+353 87 123 4567', '+353871234567'],
  ['(01) 437 8407', '+35314378407'],
])('normalises %s', (raw, out) => expect(normaliseIrishPhone(raw)).toBe(out));
it('rejects junk', () => expect(normaliseIrishPhone('12')).toBeNull());
```

- [ ] **Step 2: Run to verify failure**

Run: `npm install && npm test`
Expected: FAIL, exports missing.

- [ ] **Step 3: Implement**

- Rename `fmtGBP` to `fmtEUR` across all callers, using `en-IE`.
- Replace `products` in `seed.ts` with the Irish plans from `data/vodafone_business_products.csv` in the backend repo. Keep the existing `Product` fields and `p-…` id style, and make sure every campaign and lead seed reference still resolves.
- `initialSettings`: `orgName: 'Vodafone Ireland'`, `timezone: 'Europe/Dublin'`, and a disclosure with no recording statement: `I am an AI assistant calling on behalf of Vodafone.`
- Replace UI copy: `£` to `€`, `TPS` to `National Directory Database`, `Ofcom` to `ComReg`, `Vodafone UK` to `Vodafone Ireland`. Keep the `Suppression.reason` type in step with the copy change.

- [ ] **Step 4: Verify**

Run: `npm test && npm run build && grep -rnE "£|Vodafone UK|Ofcom|TPS" src`
Expected: tests and build pass; grep prints nothing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: Irish market: euro, Irish plans, Dublin time, Irish phone numbers and regulator names"
```

### Task 7: Adapters, real sign-in and Live mode

**Files:**
- Create: `src/live/client.ts`, `src/live/adapters.ts`, `src/live/adapters.test.ts`, `.env.example`
- Modify: `package.json` (add `@supabase/supabase-js`), `src/App.tsx`, `src/pages/Login.tsx`, `src/layout/Shell.tsx`

**Interfaces:**
- Produces in `client.ts`: `supabase`, `isLiveConfigured(): boolean`, `getMode(): 'live' | 'demo'`, `setMode(m): void`, `signInLive(email: string, password: string): Promise<{ role: string } | { error: string }>`. Storage key is `vf-mode`; the default is `live` when configured.
- Produces in `adapters.ts`, all pure: `toRole(dbRole: string): Role`, `toLeadStatus(row): LeadStatus`, `leadStatusPatch(status: LeadStatus): { sales_status: string | null }`, `toLead(row, notes): Lead`, `toCampaign(row, stats): Campaign`, `campaignStatusToDb(s: Campaign['status']): string`, `toCall(row): Call`, `toTranscript(rows): TranscriptLine[]`, `toMember(row): TeamMember`, `stripTags(text: string): string`.

**Mappings to pin:**

| DB | v2 |
| --- | --- |
| role `admin` / `sales_manager` / `salesperson` / `analyst` | `Administrator` / `Sales Manager` / `Sales Representative` / `Analyst` |
| lead `new` | `New` |
| lead `dialling`, `retry` | `Contacted` |
| lead `callback` | `Callback requested` |
| lead `interested` | `Hot` if score ≥ 85, otherwise `Warm` |
| lead `closed` | `Not interested` |
| lead `exhausted` | `Unreachable` |
| lead `do_not_call` | `Do not call` |
| `sales_status`, when set | wins over all of the above |
| campaign `draft` / `approved` / `running` / `paused` / `done` | `Draft` / `Scheduled` / `Active` / `Paused` / `Completed` |
| outcome `interested` | `Qualified` if score ≥ 85, otherwise `Interested` |
| outcome `callback` / `not_interested` / `do_not_call` | `Callback requested` / `Not interested` / `Opted out` |
| outcome `no_answer` / `voicemail` | `No answer` / `Voicemail` |
| outcome `no_response` | `No answer` |
| outcome `unreachable` | `Failed` |
| outcome `hung_up` | `Not interested` |

`leadStatusPatch`: `New` and `Queued` clear `sales_status` to null; any other value is stored as is. `campaignStatusToDb('Stopped')` is `done`. `Call.startedAt` is `created_at`; `Call.duration` is `duration_s ?? 0`; `Call.cost` is `duration / 60 * 0.22`, and `Campaign.costPerMinute` is `0.22` (assumed rate, shown as an estimate); `agentId` and `productId` come from the call's campaign. `Call.recording` is always `'Not recorded'`, and `connected` is false for `no_answer`, `voicemail`, `unreachable`, `no_response`. Widen `Call.simulated` to `boolean`; it is false for real calls.

- [ ] **Step 1: Write the failing tests**

One `it.each` per mapping table above, plus:

```ts
it('a salesperson decision wins over dialler state', () =>
  expect(toLeadStatus({ status: 'retry', sales_status: 'Converted', score: 10 })).toBe('Converted'));
it('hides delivery tags', () => expect(stripTags('[warmly] Hi [curious] there?')).toBe('Hi there?'));
it('turns seconds into transcript speakers', () =>
  expect(toTranscript([{ position: 0, role: 'agent', text: '[warmly] Hi', t_seconds: 3 }]))
    .toEqual([{ t: 3, speaker: 'AI', text: 'Hi' }]));
it('uses real qualification scores when present', () => { /* toCall carries analyses.qualification */ });
it('a user with no role is signed out with a clear message', async () => {
  // supabase mocked: sign-in succeeds, profiles.role is null
  expect(await signInLive('a@b.ie', 'password1')).toEqual({ error: 'Your account has no role yet. Ask an administrator to assign one.' });
  expect(supabase.auth.signOut).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement**

- `Login.tsx`, Live mode: call `signInLive`, skipping the MFA step and the prefilled demo credentials, and show any returned error. Demo mode is unchanged.
- `App.tsx` `RequireAuth`, Live mode: use `supabase.auth.getSession()` and `onAuthStateChange`.
- `Shell.tsx`, Live mode: show only Overview, Leads, Calling, Campaigns, Conversations, Qualified and Call History; hide "View as role"; add a `Live data` / `Demo data` switch that calls `setMode` and reloads; sign out through Supabase.
- `qualBreakdown` in `conversations/state.ts`: prefer `Call.qualification` when set, and fall back to the hash only in Demo mode. Add optional `qualification`, and show nothing in Live mode when it is absent.

- [ ] **Step 4: Verify**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: real sign-in, Live and Demo data modes, and database-to-screen adapters"
```

### Task 8: Live data in the store

**Files:**
- Create: `src/live/repo.ts`
- Modify: `src/store/store.tsx`, `src/lib/metrics.ts`, `src/pages/CampaignWizard.tsx`, `src/pages/leads/shared.tsx`, `src/pages/leads/Importers.tsx`, `src/pages/campaigns/shared.tsx`, `src/pages/LeadProfile.tsx`
- Test: `src/store/store.live.test.tsx`

**Interfaces:**
- Consumes: Task 7 adapters.
- Produces in `repo.ts`: `loadAll(): Promise<Pick<State,'leads'|'calls'|'campaigns'|'team'|'suppressions'>>`, `saveLead(id, patch)`, `saveLeads(ids, patch)`, `insertLead(l)`, `insertLeads(ls)`, `addNote(leadId, author, text)`, `insertCampaign(c)`, `saveCampaign(id, patch)`, `insertSuppression(s)`, `deleteSuppression(phone)`, `loadTranscript(callId): Promise<TranscriptLine[]>`.
- Changes: `addLead` and `addCampaign` return `Promise`. Update their callers to `await`.
- Produces: `Ctx.mode`, `Ctx.loadError: string | null`.

- [ ] **Step 1: Write the failing tests, with `repo.ts` mocked**

```ts
it('live mode starts empty and runs no simulation', ...);   // no seed leads; state.live stays [] after timers advance
it('live mode loads real rows', ...);                        // loadAll result appears in state
it('updateLead writes through and maps status', ...);        // updateLead('1',{status:'Converted'}) -> saveLead with sales_status
it('a failed write shows an error toast and reloads', ...);
it('a failed load sets loadError and keeps the shell usable', ...);
it('transcriptFor fetches once and caches', ...);
it('demo mode is unchanged', ...);                           // seed leads present, simulation runs
it('live charts use only real calls', ...);                  // dailySeries adds no dailyHistory rows in Live mode
it('campaign totals come from its calls', ...);              // attempted, connected, warm, qualified, minutes
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement**

- Live mode: initial state uses `[]` for leads, calls, campaigns and team, and also for appointments, tasks, notifications, consents, deletionRequests and auditLog. It keeps seed `agents`, `products` and `offers` as reference data.
- `Campaign` stores `product_ref`, `agent_ref`, `offer_ref`. Wizard settings map to `days`, `calling_hours_*`, `max_attempts`, `retry_hours`, `concurrency`, `daily_cap`, `min_score`.
- Refresh with `loadAll()` every 5 seconds in Live mode, with this comment: `shortcut: loads whole tables and PostgREST caps at 1000 rows, move to server paging before real campaign volumes`.
- `me` comes from the signed-in profile; `can()` uses the mapped role.
- Skip `fillLive` and the interval in Live mode.
- `dailySeries` in `metrics.ts` must not merge seed `dailyHistory` in Live mode.
- `loadAll` selects only calls with a `lead_id`, so console tests stay out of the numbers. `toCampaign` stats are computed from those calls.
- `transcriptFor`: return the cached lines, or `[]` while `loadTranscript` runs, then update state.
- Live mode hides lead delete, the CRM import modal and the Lead profile "Call now" button. Dialling happens through a running campaign.
- `audit()` is a no-op in Live mode, since the audit screens are out of scope.
- Real pages must not show a `Simulated` badge when `Call.simulated` is false. `SimBadge` returns null in Live mode.

- [ ] **Step 4: Verify**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: Live mode reads and writes Supabase; Demo data mode stays on the seeded dataset"
```

### Task 9: Real calls in the AI Calling Centre

**Files:**
- Create: `src/live/liveCalls.ts`, `src/live/liveCalls.test.ts`
- Modify: `package.json` (add `livekit-client`), `src/store/store.tsx`, `src/pages/Calling.tsx`

**Interfaces:**
- Consumes: `GET /live-calls`, `POST /live-token` from Task 5, with `VITE_API_URL`.
- Produces: `fetchLiveRooms(): Promise<LiveRoom[]>`, `roomToLiveCall(room: LiveRoom, leads: Lead[], campaigns: Campaign[]): LiveCall`, `joinCall(room: string, onLine: (line: TranscriptLine, segmentId: string) => void, listen: boolean): Promise<() => void>`, returning a leave function.
- Produces: `Ctx.liveError: string | null`.

- [ ] **Step 1: Write the failing tests**

```ts
it('matches a room to its lead by phone', ...);
it('still returns a call when no lead matches, labelled by phone', () => {
  const lc = roomToLiveCall({ room: 'call-353870000000-1', phone: '+353870000000', started_at: 1 }, [], []);
  expect(lc.leadId).toBe(''); expect(lc.phone).toBe('+353870000000');
});
it('treats sip- identities as the customer', ...);
it('replaces a line when the same segment updates', ...);
it('strips delivery tags from live lines', ...);
it('an API failure sets liveError and leaves saved data alone', ...);
it('liveError clears on the next successful poll', ...);
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement**

- Poll `fetchLiveRooms` every 3 seconds in Live mode and put the results in `state.live`, keeping existing `lines`. On failure, set `liveError` and keep polling. Add optional `phone` to `LiveCall`.
- `joinCall`: connect with the hidden token, and `room.registerTextStreamHandler('lk.transcription', …)` for lines. Use the `lk.segment_id` attribute to update a line in place. When `listen` is true, attach subscribed audio tracks; the Listen click provides the user gesture browsers need for playback.
- `Calling.tsx`, Live mode:
  - Show `liveError` as a banner: `Live call service is unavailable. Saved calls and leads are not affected.`
  - Hide the stage bar, buying intent and qualification meters; the agent does not report them. Show elapsed time and the transcript.
  - Use `lead?.name ?? lc.phone` everywhere, with no non-null assertions on the lead.
  - Hide whisper, takeover, end and outcome controls.
  - Calling pause: set every `running` campaign to `paused`. Remove the Live banner text about simulation.

- [ ] **Step 4: Verify**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: AI Calling Centre shows real calls with live transcript and hidden listen-in"
```

---

## Launch task

### Task 10: End-to-end rehearsal

**Files:** none unless a defect is found. Fix defects with a test in the owning task's style.

Every step marked **(approval)** waits for the user.

- [ ] **Step 1: Re-check prices.** Compare `src/agent/services.md` in the backend repo and the seed products with vodafone.ie. Have a salesperson review `objections.md` if possible.

- [ ] **Step 2: Apply and deploy (approval).** This changes the shared Supabase project and the deployed agent.

From the backend repo root. The Supabase link was not copied, so link it first:

```bash
supabase link --project-ref <the existing project ref>
supabase db push
lk agent update-secrets --help
lk agent deploy
```

Set `BUSINESS_NAME=Vodafone` using the syntax the help shows (not verified here). `livekit.toml` was copied, so this deploy replaces the agent running today (`CA_vKFW8WWjkgD2`). Expected: migration applied, agent reports healthy. Existing leads default to `consent = false` and will not dial until re-imported.

- [ ] **Step 3: Create demo users.** Create one admin, one manager and one salesperson in Supabase Auth and set `profiles.role`. Do not put passwords in the repo.

- [ ] **Step 4: Start everything.**

```bash
DIAL_ALLOWLIST=+3538XXXXXXXX ./scripts/demo.sh
```

```bash
npm run dev
```

Expected: `/health` returns `{"ok": true}` and Live mode shows empty lists rather than errors.

- [ ] **Step 5: Run the whole path in a browser (approval for the real call).**

Sign in as the manager; import a 3-lead CSV with `consent` Y on allowlisted test phones; create and launch a campaign; answer the call.

Expected:
- Call appears in the Calling Centre within about 5 seconds, with live transcript and audible listen-in.
- The agent says "on behalf of Vodafone" in its first sentence.
- Within 60 seconds of hang-up: Conversation shows the transcript with timestamps and analysis, and the lead appears in Qualified Leads with a brief.
- Overview numbers reflect the calls.
- Sign in as the salesperson and accept and convert the lead; a reload keeps the change.
- Say "don't call me" on a second call; the number lands on suppression and is never rung again.

- [ ] **Step 6: Check failure behaviour.** Stop the API mid-demo: the Calling page shows the banner, other screens keep working. Switch to Demo data: every out-of-scope screen renders with no console errors.

- [ ] **Step 7: Rehearse.** Run the storyline three times in a row, then record a backup video of a good call.
