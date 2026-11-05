# vodefoneAI_frontend_v2 — Vodafone AI Sales Operations frontend

A demo frontend for an AI outbound sales platform. An AI voice agent calls eligible leads, qualifies them, and hands warm and hot leads over to human sales reps along with the transcript, recording reference and an AI summary.

> **Demonstration mode.** All data is synthetic and every call is **simulated**. No real outbound calls are placed. The interface marks simulated activity with a "Simulated" badge.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check + production build to dist/
npm run build:single # one self-contained HTML file in dist-single/
```

Any email and password of 8+ characters will sign you in, followed by any 6-digit MFA code. To check role-based access, switch roles from the avatar menu (Super Admin, Administrator, Sales Manager, Supervisor, Sales Representative, Analyst).

## Stack

React 18, TypeScript, Vite, react-router (hash routing), Recharts and lucide-react. There is no CSS framework: the design system lives in `src/styles.css` as tokens and classes.

## Structure

| Path | Purpose |
| --- | --- |
| `src/styles.css` | Design tokens (colour, type, radius, spacing) and all component classes |
| `src/components/ui.tsx` | Shared UI kit: buttons, badges, cards, data table, modals, drawer, tabs, audio player, transcript, KPI cards |
| `src/data/types.ts` | Domain model (Lead, Call, Campaign, Agent, Product, Offer, TeamMember, Appointment …) |
| `src/data/seed.ts` | Seeded, deterministic demo dataset. Lead status, campaign and agent aggregates are derived from the call log, so the numbers agree across pages |
| `src/store/store.tsx` | App state and actions, RBAC (`can()`), compliance `eligibility()`, toast and audit helpers, and the live call **simulation** engine |
| `src/lib/metrics.ts` | Shared metric selectors (date ranges, daily/weekly/monthly series, summaries) |
| `src/layout/Shell.tsx` | Sidebar (collapsible, mobile drawer), top bar (⌘K search, workspace, notifications, profile), breadcrumbs |
| `src/pages/*` | One file per module |

## Backend integration points

The store actions (`updateLead`, `addCampaign`, `endLive`, …) are the seams to replace with API calls:

- **Telephony and voice AI**: replace the simulation in `store.tsx` (`fillLive`, `advance`, `finishLive`) with a websocket or event stream of real call state and transcript deltas.
- **CRM**: lead import and export, and write-back of outcomes and notes.
- **Recording storage**: `Call.recording` holds a reference, and `AudioPlayer` should stream a signed URL.
- **Analytics**: the selectors in `metrics.ts` map onto aggregate endpoints.
- **Compliance**: `eligibility()` mirrors the server-side pre-call checks (consent, suppression/TPS, attempt limits). The server must enforce these checks too.
