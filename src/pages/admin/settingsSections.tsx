// Settings sections. Each form has its own Save with dirty-state detection.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Copy, Eye, EyeOff, Link2, Plug, RefreshCw, Unplug, Webhook } from 'lucide-react';
import { useApp, type Settings } from '../../store/store';
import { Avatar, Badge, Button, Card, Field, Modal, Progress, StatusBadge, Switch, useConfirm } from '../../components/ui';
import { fmtInt, fmtPct, fmtRelative } from '../../lib/format';
import { PERMISSION_META, ROLES, ROLE_DESC, ROLE_TONE, SaveBar, roleHas, useDraft, useLocalStore } from './shared';
import { DAYS } from './complianceA';

const LOCK = 'Requires settings.manage permission';
type P = { canEdit: boolean };
const FS = ({ canEdit, children }: { canEdit: boolean; children: React.ReactNode }) => <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>{children}</fieldset>;
function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return <div className="setting-row"><div style={{ minWidth: 0 }}><div className="title">{title}</div>{desc && <div className="desc">{desc}</div>}</div><div style={{ flexShrink: 0 }}>{children}</div></div>;
}
function useSaver() {
  const app = useApp();
  return (patch: Partial<Settings>, what: string, detail = '') => { app.updateSettings(patch); app.audit(`Updated ${what.toLowerCase()}`, detail || what, 'Settings'); app.toast(`${what} saved`, detail || undefined); };
}

/* ---------- Organisation ---------- */
const TZ = ['Europe/London', 'Europe/Dublin', 'Europe/Amsterdam', 'UTC'];
export function OrganisationSection({ canEdit }: P) {
  const app = useApp(); const save = useSaver();
  const [extra, setExtra] = useLocalStore('org-extra', { legalName: 'Vodafone Limited', regNo: '01471587', address: 'Vodafone House, The Connection, Newbury, RG14 2FN', dpo: 'dpo@vodafone-demo.co.uk', locale: 'en-GB', currency: 'GBP' });
  const d = useDraft({ orgName: app.settings.orgName, timezone: app.settings.timezone, ...extra });
  const err = d.draft.orgName.trim().length < 2 ? 'Organisation name is required' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.draft.dpo) ? 'Enter a valid email' : '';
  return (
    <Card title="Organisation" sub="Legal entity and regional defaults used across the workspace">
      <FS canEdit={canEdit}>
        <div className="form-grid">
          <Field label="Display name" required error={d.draft.orgName.trim().length < 2 && 'Organisation name is required'}><input className="input" value={d.draft.orgName} onChange={(e) => d.patch({ orgName: e.target.value })} /></Field>
          <Field label="Legal entity"><input className="input" value={d.draft.legalName} onChange={(e) => d.patch({ legalName: e.target.value })} /></Field>
          <Field label="Company number"><input className="input mono" value={d.draft.regNo} onChange={(e) => d.patch({ regNo: e.target.value })} /></Field>
          <Field label="Data protection officer" error={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.draft.dpo) && 'Enter a valid email'}><input className="input" value={d.draft.dpo} onChange={(e) => d.patch({ dpo: e.target.value })} /></Field>
          <Field label="Registered address" className="span-all"><input className="input" value={d.draft.address} onChange={(e) => d.patch({ address: e.target.value })} /></Field>
          <Field label="Time zone"><select className="select" value={d.draft.timezone} onChange={(e) => d.patch({ timezone: e.target.value })}>{TZ.map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Locale & currency"><select className="select" value={`${d.draft.locale}|${d.draft.currency}`} onChange={(e) => { const [locale, currency] = e.target.value.split('|'); d.patch({ locale, currency }); }}><option value="en-GB|GBP">English (UK) · GBP £</option><option value="en-IE|EUR">English (Ireland) · EUR €</option></select></Field>
        </div>
      </FS>
      <SaveBar dirty={d.dirty} disabled={!canEdit} reason={LOCK} onReset={d.reset} onSave={() => {
        if (err) { app.toast('Cannot save', err, 'error'); return; }
        const { orgName, timezone, ...rest } = d.draft; setExtra(rest); save({ orgName: orgName.trim(), timezone }, 'Organisation', orgName.trim());
      }} />
    </Card>
  );
}

/* ---------- Workspace ---------- */
const WORKSPACES = ['Consumer & SME Outbound', 'Business Retention', 'Broadband Upgrades'];
export function WorkspaceSection({ canEdit }: P) {
  const app = useApp(); const save = useSaver();
  const [extra, setExtra] = useLocalStore('ws-extra', { description: 'Outbound AI calling for consumer mobile, broadband and SME customers.', defaultAgent: app.agents[0]?.id ?? '', sandbox: true });
  const d = useDraft({ workspace: app.settings.workspace, ...extra });
  return (
    <Card title="Workspace" sub="Separate calling programmes with their own campaigns, agents and reporting">
      <FS canEdit={canEdit}>
        <div className="form-grid">
          <Field label="Active workspace"><select className="select" value={d.draft.workspace} onChange={(e) => d.patch({ workspace: e.target.value })}>{WORKSPACES.map((w) => <option key={w}>{w}</option>)}</select></Field>
          <Field label="Default AI agent" hint="Pre-selected when creating campaigns"><select className="select" value={d.draft.defaultAgent} onChange={(e) => d.patch({ defaultAgent: e.target.value })}>{app.agents.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.status}</option>)}</select></Field>
          <Field label="Description" className="span-all"><textarea className="textarea" rows={2} value={d.draft.description} onChange={(e) => d.patch({ description: e.target.value })} /></Field>
        </div>
        <Row title="Sandbox mode" desc="All telephony runs against sandbox providers. Required for this demonstration."><Switch on={d.draft.sandbox} onChange={() => app.toast('Sandbox mode is enforced in the demo', 'Live dialling is not available', 'info')} label="Sandbox mode" /></Row>
      </FS>
      <SaveBar dirty={d.dirty} disabled={!canEdit} reason={LOCK} onReset={d.reset} onSave={() => { const { workspace, ...rest } = d.draft; setExtra(rest); save({ workspace }, 'Workspace', workspace); }} />
    </Card>
  );
}

/* ---------- User management ---------- */
export function UsersSection() {
  const app = useApp(); const nav = useNavigate();
  return (
    <Card flush title="User management" sub={`${app.team.length} users · invitations and roles are managed in Sales team`} actions={<><Button size="sm" onClick={() => nav('/team')} iconRight={<ArrowRight size={13} />}>Open Sales team</Button><Button size="sm" variant="primary" disabled={!app.can('team.manage')} title={app.can('team.manage') ? undefined : 'Requires team.manage permission'} onClick={() => nav('/team?invite=1')}>Invite user</Button></>}>
      <div className="table-wrap">
        <table className="table table-responsive">
          <thead><tr><th>User</th><th>Role</th><th>Team</th><th>Status</th><th>Last active</th></tr></thead>
          <tbody>
            {app.team.slice(0, 8).map((m) => (
              <tr key={m.id} className="clickable" onClick={() => nav(`/team/${m.id}`)}>
                <td data-label="User"><div className="row"><Avatar initials={m.initials} size="sm" /><div><div className="cell-primary">{m.name}</div><div className="cell-sub">{m.email}</div></div></div></td>
                <td data-label="Role"><Badge tone={ROLE_TONE[m.role]}>{m.role}</Badge></td>
                <td data-label="Team" className="small">{m.team}</td>
                <td data-label="Status"><StatusBadge status={m.status} /></td>
                <td data-label="Last active" className="mono small muted">{fmtRelative(m.lastActive)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {app.team.length > 8 && <div className="table-foot"><span>Showing 8 of {app.team.length}</span><Button size="xs" variant="link" onClick={() => nav('/team')}>View all</Button></div>}
    </Card>
  );
}

/* ---------- Permissions ---------- */
export function PermissionsSection() {
  const app = useApp(); const nav = useNavigate();
  return (
    <Card title="Permissions" sub="Role-based access control. Roles are fixed policy templates." actions={<Button size="sm" iconRight={<ArrowRight size={13} />} onClick={() => nav('/team?tab=roles')}>Full matrix</Button>}>
      <div className="list">
        {ROLES.map((r) => {
          const n = PERMISSION_META.filter((p) => roleHas(r, p.key)).length;
          return (
            <div key={r} className="list-item" style={{ alignItems: 'flex-start' }}>
              <div style={{ width: 160, flexShrink: 0 }}><Badge tone={ROLE_TONE[r]}>{r}</Badge><div className="xs muted mt-4">{app.team.filter((m) => m.role === r).length} users</div></div>
              <div className="grow small subtle">{ROLE_DESC[r]}</div>
              <div style={{ width: 90, flexShrink: 0 }} className="adm-hide-sm"><div className="mono xs" style={{ textAlign: 'right' }}>{n}/{PERMISSION_META.length}</div><div className="mt-4"><Progress value={(n / PERMISSION_META.length) * 100} /></div></div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ---------- AI configuration ---------- */
const GUARDRAILS = [
  ['selfDisclose', 'AI self-disclosure', 'Agent states it is an AI assistant in the opening line.'],
  ['approvedOnly', 'Approved catalogue only', 'Never pitch products or prices that are not approved in Products & Offers.'],
  ['vulnerability', 'Vulnerability detection', 'Escalate to a human and stop selling when vulnerability cues are detected.'],
  ['redactPII', 'Redact sensitive data', 'Remove card numbers, bank details and dates of birth from transcripts.'],
  ['noPressure', 'No pressure selling', 'Block urgency or scarcity claims that are not part of an active offer.'],
  ['optOutHonour', 'Immediate opt-out', 'End the call and suppress the number when the customer asks not to be called.'],
] as const;
export function AISection({ canEdit }: P) {
  const app = useApp();
  const [cfg, setCfg] = useLocalStore('ai-config', { provider: 'Large language model via secure backend gateway', model: 'Production · conversational (default)', temperature: 0.4, maxTurnSec: 25, selfDisclose: true, approvedOnly: true, vulnerability: true, redactPII: true, noPressure: true, optOutHonour: true });
  const d = useDraft(cfg);
  const required = ['selfDisclose', 'optOutHonour'] as const;
  return (
    <Card title="AI configuration" sub="Defaults applied to every AI agent unless overridden in the agent builder">
      <FS canEdit={canEdit}>
        <div className="form-grid">
          <Field label="Model provider label" hint="Shown in audit logs and agent metadata. Credentials live server-side."><input className="input" value={d.draft.provider} onChange={(e) => d.patch({ provider: e.target.value })} /></Field>
          <Field label="Default model profile"><select className="select" value={d.draft.model} onChange={(e) => d.patch({ model: e.target.value })}>{['Production · conversational (default)', 'Low latency · short turns', 'High accuracy · complex products'].map((m) => <option key={m}>{m}</option>)}</select></Field>
          <Field label={<span className="row between">Temperature <span className="mono muted">{d.draft.temperature.toFixed(2)}</span></span>} hint="Lower values keep the agent closer to the approved script">
            <input type="range" className="range" min={0} max={1} step={0.05} value={d.draft.temperature} onChange={(e) => d.patch({ temperature: +e.target.value })} />
          </Field>
          <Field label={<span className="row between">Max turn length <span className="mono muted">{d.draft.maxTurnSec}s</span></span>} hint="Longest single AI utterance before yielding to the customer">
            <input type="range" className="range" min={10} max={60} step={5} value={d.draft.maxTurnSec} onChange={(e) => d.patch({ maxTurnSec: +e.target.value })} />
          </Field>
        </div>
        <div className="label mt-24" style={{ marginBottom: 4 }}>Guardrails</div>
        {GUARDRAILS.map(([k, t, desc]) => (
          <Row key={k} title={t} desc={desc + ((required as readonly string[]).includes(k) ? ' Required by policy.' : '')}>
            <Switch on={d.draft[k]} disabled={!canEdit || (required as readonly string[]).includes(k)} onChange={(v) => d.patch({ [k]: v } as Partial<typeof cfg>)} label={t} />
          </Row>
        ))}
      </FS>
      <SaveBar dirty={d.dirty} disabled={!canEdit} reason={LOCK} onReset={d.reset} onSave={() => { setCfg(d.draft); app.audit('Updated AI configuration', `temperature ${d.draft.temperature}`, 'Agent'); app.toast('AI configuration saved', 'Applies to new calls'); }} />
    </Card>
  );
}

/* ---------- Voice ---------- */
export function VoiceSection({ canEdit }: P) {
  const app = useApp();
  const [cfg, setCfg] = useLocalStore('voice-config', { voice: 'Ava — warm, British (female)', accent: 'British English (RP)', rate: 1.0, noise: true, amd: true, voicemail: 'Leave approved message', bargeIn: true });
  const d = useDraft(cfg);
  const el = app.settings.integrations['ElevenLabs Voice'];
  return (
    <div className="col" style={{ gap: 16 }}>
      <Card title="Voice settings" sub="Default synthetic voice and call-handling behaviour">
        <FS canEdit={canEdit}>
          <div className="form-grid">
            <Field label="Default voice"><select className="select" value={d.draft.voice} onChange={(e) => d.patch({ voice: e.target.value })}>{['Ava — warm, British (female)', 'Leo — calm, British (male)', 'Isla — bright, Scottish (female)', 'Rhys — friendly, Welsh (male)'].map((v) => <option key={v}>{v}</option>)}</select></Field>
            <Field label="Language & accent"><select className="select" value={d.draft.accent} onChange={(e) => d.patch({ accent: e.target.value })}>{['British English (RP)', 'British English (Northern)', 'Scottish English', 'Welsh English', 'Irish English'].map((v) => <option key={v}>{v}</option>)}</select></Field>
            <Field label={<span className="row between">Speaking rate <span className="mono muted">{d.draft.rate.toFixed(2)}×</span></span>}><input type="range" className="range" min={0.8} max={1.25} step={0.05} value={d.draft.rate} onChange={(e) => d.patch({ rate: +e.target.value })} /></Field>
            <Field label="When voicemail is detected"><select className="select" value={d.draft.voicemail} onChange={(e) => d.patch({ voicemail: e.target.value })}>{['Leave approved message', 'Hang up and retry later', 'Hang up and mark unreachable'].map((v) => <option key={v}>{v}</option>)}</select></Field>
          </div>
          <Row title="Background noise suppression" desc="Filter call-centre and line noise from the customer audio."><Switch on={d.draft.noise} onChange={(v) => d.patch({ noise: v })} label="Noise suppression" /></Row>
          <Row title="Answering-machine detection" desc="Detect voicemail within the first 3 seconds."><Switch on={d.draft.amd} onChange={(v) => d.patch({ amd: v })} label="AMD" /></Row>
          <Row title="Allow barge-in" desc="Customer can interrupt the agent mid-sentence."><Switch on={d.draft.bargeIn} onChange={(v) => d.patch({ bargeIn: v })} label="Barge-in" /></Row>
        </FS>
        <SaveBar dirty={d.dirty} disabled={!canEdit} reason={LOCK} onReset={d.reset} onSave={() => { setCfg(d.draft); app.audit('Updated voice settings', d.draft.voice, 'Settings'); app.toast('Voice settings saved'); }} />
      </Card>
      <IntegrationGrid names={['ElevenLabs Voice']} canEdit={canEdit} />
      {!el?.connected && <div className="small muted">Voice synthesis falls back to the telephony provider’s built-in voices while disconnected.</div>}
    </div>
  );
}

/* ---------- Calling rules ---------- */
export function CallingSection({ canEdit }: P) {
  const app = useApp(); const nav = useNavigate(); const s = app.settings;
  const [retry, setRetry] = useLocalStore('retry-defaults', { maxAttempts: 3, intervalHours: 24, spreadTimes: true });
  const d = useDraft({ maxConcurrent: s.maxConcurrent, dailyCap: s.dailyCap, callingPaused: s.callingPaused, ...retry });
  const err = d.draft.maxConcurrent < 1 || d.draft.maxConcurrent > 200 ? 'Concurrent calls must be 1–200' : d.draft.dailyCap < 1 || d.draft.dailyCap > 50000 ? 'Daily cap must be 1–50,000' : d.draft.maxAttempts < 1 || d.draft.maxAttempts > 6 ? 'Max attempts must be 1–6 (Ofcom persistent misuse guidance)' : '';
  const h = s.callingHours;
  return (
    <Card title="Calling rules" sub="Platform-wide limits. Campaigns can be stricter, never looser.">
      <FS canEdit={canEdit}>
        <div className="form-grid">
          <Field label="Max concurrent calls" hint={`${app.live.length} in progress now`}><input type="number" className="input" value={d.draft.maxConcurrent} onChange={(e) => d.patch({ maxConcurrent: +e.target.value })} /></Field>
          <Field label="Daily call cap" hint="Across all campaigns"><input type="number" className="input" value={d.draft.dailyCap} onChange={(e) => d.patch({ dailyCap: +e.target.value })} /></Field>
          <Field label="Default max attempts per lead"><input type="number" className="input" min={1} max={6} value={d.draft.maxAttempts} onChange={(e) => d.patch({ maxAttempts: +e.target.value })} /></Field>
          <Field label="Default retry interval"><select className="select" value={d.draft.intervalHours} onChange={(e) => d.patch({ intervalHours: +e.target.value })}>{[4, 12, 24, 48, 72].map((n) => <option key={n} value={n}>{n} hours</option>)}</select></Field>
        </div>
        {err && <div className="field-error mt-8">{err}</div>}
        <Row title="Vary retry time of day" desc="Retry at a different time window than the previous attempt."><Switch on={d.draft.spreadTimes} onChange={(v) => d.patch({ spreadTimes: v })} label="Vary retry time" /></Row>
        <Row title="Pause all calling" desc="Emergency stop for the simulated calling engine. In-progress calls finish normally."><Switch on={d.draft.callingPaused} onChange={(v) => d.patch({ callingPaused: v })} label="Pause calling" /></Row>
        <div className="inset-box row between mt-8" style={{ flexWrap: 'wrap' }}>
          <div className="small"><span className="muted">Calling hours: </span><span className="mono">{h.start}–{h.end}</span> · {DAYS.filter((x) => h.days.includes(x)).join(', ')}</div>
          <Button size="xs" variant="ghost" iconRight={<ArrowRight size={12} />} onClick={() => nav('/compliance?tab=hours')}>Edit in Compliance</Button>
        </div>
      </FS>
      <SaveBar dirty={d.dirty} disabled={!canEdit} reason={LOCK} onReset={d.reset} onSave={() => {
        if (err) { app.toast('Cannot save', err, 'error'); return; }
        const { maxAttempts, intervalHours, spreadTimes, ...rest } = d.draft;
        setRetry({ maxAttempts, intervalHours, spreadTimes }); app.updateSettings(rest);
        app.audit('Updated calling rules', `${rest.maxConcurrent} concurrent · ${rest.dailyCap}/day${rest.callingPaused ? ' · paused' : ''}`, 'Settings');
        app.toast('Calling rules saved', rest.callingPaused ? 'Calling is paused' : undefined);
      }} />
    </Card>
  );
}

/* ---------- Qualification ---------- */
export function QualificationSection({ canEdit }: P) {
  const app = useApp(); const save = useSaver();
  const d = useDraft({ hotThreshold: app.settings.hotThreshold, warmThreshold: app.settings.warmThreshold });
  const scored = app.leads.filter((l) => !l.archived && l.score > 0);
  const hot = scored.filter((l) => l.score >= d.draft.hotThreshold).length;
  const warm = scored.filter((l) => l.score >= d.draft.warmThreshold && l.score < d.draft.hotThreshold).length;
  const cold = scored.length - hot - warm;
  const err = d.draft.warmThreshold >= d.draft.hotThreshold ? 'Warm threshold must be below the hot threshold' : '';
  const bucket = [{ l: 'Hot', v: hot, c: 'var(--tangerine)' }, { l: 'Warm', v: warm, c: '#f59e0b' }, { l: 'Cold', v: cold, c: 'var(--blue)' }];
  const tot = Math.max(1, scored.length);
  return (
    <Card title="Qualification rules" sub="Score thresholds that turn an AI call into a hot or warm handover">
      <FS canEdit={canEdit}>
        <div className="form-grid">
          <Field label={<span className="row between">Hot threshold <span className="mono">{d.draft.hotThreshold}</span></span>} hint="Immediate handover, high-priority notification"><input type="range" className="range" min={50} max={100} value={d.draft.hotThreshold} onChange={(e) => d.patch({ hotThreshold: +e.target.value })} /></Field>
          <Field label={<span className="row between">Warm threshold <span className="mono">{d.draft.warmThreshold}</span></span>} hint="Nurture follow-up within 48 hours" error={err}><input type="range" className="range" min={20} max={95} value={d.draft.warmThreshold} onChange={(e) => d.patch({ warmThreshold: +e.target.value })} /></Field>
        </div>
        <div className="mt-24">
          <div className="row between small"><span className="strong">Live preview</span><span className="muted">{fmtInt(scored.length)} scored leads</span></div>
          <div className="mt-8" style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', gap: 2 }}>{bucket.map((b) => <div key={b.l} style={{ width: `${(b.v / tot) * 100}%`, background: b.c, transition: 'width .2s' }} />)}</div>
          <div className="grid g-3 adm-two mt-12" style={{ gap: 8 }}>
            {bucket.map((b) => <div key={b.l} className="inset-box"><div className="row gap-4 xs muted"><i style={{ width: 8, height: 8, borderRadius: 9, background: b.c, display: 'inline-block' }} />{b.l} {b.l === 'Hot' ? `≥ ${d.draft.hotThreshold}` : b.l === 'Warm' ? `${d.draft.warmThreshold}–${d.draft.hotThreshold - 1}` : `< ${d.draft.warmThreshold}`}</div><div className="strong mono mt-4">{fmtInt(b.v)} <span className="muted xs">{fmtPct((b.v / tot) * 100, 0)}</span></div></div>)}
          </div>
          {d.dirty && <div className="small muted mt-8">Current rules: hot ≥ {app.settings.hotThreshold}, warm ≥ {app.settings.warmThreshold}. Existing lead statuses are not changed retroactively.</div>}
        </div>
      </FS>
      <SaveBar dirty={d.dirty} disabled={!canEdit} reason={LOCK} onReset={d.reset} onSave={() => { if (err) { app.toast('Cannot save', err, 'error'); return; } save(d.draft, 'Qualification rules', `hot ≥ ${d.draft.hotThreshold} · warm ≥ ${d.draft.warmThreshold}`); }} />
    </Card>
  );
}

/* ---------- Lead assignment ---------- */
const METHODS: { v: Settings['assignment']; d: string }[] = [
  { v: 'Round-robin', d: 'Distribute handovers evenly across available representatives.' },
  { v: 'Product-based', d: 'Route to reps whose product specialisms match the lead’s interest.' },
  { v: 'Team-based', d: 'Route by customer type: consumer, business or retention teams.' },
  { v: 'Priority-based', d: 'Hot leads go to top converters first; warm leads fill remaining capacity.' },
  { v: 'Manual', d: 'Supervisors assign every handover from the Qualified leads queue.' },
];
export function AssignmentSection({ canEdit }: P) {
  const app = useApp(); const save = useSaver();
  const [opts, setOpts] = useLocalStore('assign-opts', { respectCapacity: true, skipAway: true });
  const d = useDraft({ assignment: app.settings.assignment, ...opts });
  return (
    <Card title="Lead assignment" sub="How AI-qualified leads are handed to the sales team">
      <FS canEdit={canEdit}>
        <div className="grid g-2" style={{ gap: 10 }}>
          {METHODS.map((m) => (
            <button key={m.v} type="button" className={`option-card ${d.draft.assignment === m.v ? 'on' : ''}`} onClick={() => d.patch({ assignment: m.v })} aria-pressed={d.draft.assignment === m.v}>
              <div className="row between"><span className="medium" style={{ color: 'var(--ink)' }}>{m.v}</span>{d.draft.assignment === m.v && <Check size={15} />}</div>
              <div className="small muted mt-4">{m.d}</div>
            </button>
          ))}
        </div>
        <Row title="Respect rep capacity" desc="Skip representatives at or above their open-lead capacity."><Switch on={d.draft.respectCapacity} onChange={(v) => d.patch({ respectCapacity: v })} label="Respect capacity" /></Row>
        <Row title="Skip Away and Offline reps" desc="Only route to representatives who are Available or Busy."><Switch on={d.draft.skipAway} onChange={(v) => d.patch({ skipAway: v })} label="Skip away reps" /></Row>
      </FS>
      <SaveBar dirty={d.dirty} disabled={!canEdit} reason={LOCK} onReset={d.reset} onSave={() => { const { assignment, ...rest } = d.draft; setOpts(rest); save({ assignment }, 'Lead assignment', assignment); }} />
    </Card>
  );
}

/* ---------- Notifications ---------- */
export function NotifySection({ canEdit }: P) {
  const save = useSaver(); const app = useApp();
  const d = useDraft(app.settings.notify);
  const keys = Object.keys(d.draft);
  const set = (k: string, ch: 'inApp' | 'email', v: boolean) => d.setDraft({ ...d.draft, [k]: { ...d.draft[k], [ch]: v } });
  const all = (ch: 'inApp' | 'email', v: boolean) => d.setDraft(Object.fromEntries(keys.map((k) => [k, { ...d.draft[k], [ch]: v }])));
  return (
    <Card flush title="Notification preferences" sub="Choose how each event reaches you">
      <FS canEdit={canEdit}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Event</th><th style={{ width: 90, textAlign: 'center' }}>In-app</th><th style={{ width: 90, textAlign: 'center' }}>Email</th></tr></thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k}>
                  <td className="cell-primary" style={{ whiteSpace: 'normal' }}>{k}</td>
                  <td style={{ textAlign: 'center' }}><Switch on={d.draft[k].inApp} onChange={(v) => set(k, 'inApp', v)} disabled={!canEdit} label={`${k} in-app`} /></td>
                  <td style={{ textAlign: 'center' }}><Switch on={d.draft[k].email} onChange={(v) => set(k, 'email', v)} disabled={!canEdit} label={`${k} email`} /></td>
                </tr>
              ))}
              <tr><td className="small muted">Toggle all</td>
                <td style={{ textAlign: 'center' }}><Button size="xs" variant="ghost" onClick={() => all('inApp', !keys.every((k) => d.draft[k].inApp))}>{keys.every((k) => d.draft[k].inApp) ? 'None' : 'All'}</Button></td>
                <td style={{ textAlign: 'center' }}><Button size="xs" variant="ghost" onClick={() => all('email', !keys.every((k) => d.draft[k].email))}>{keys.every((k) => d.draft[k].email) ? 'None' : 'All'}</Button></td></tr>
            </tbody>
          </table>
        </div>
      </FS>
      <div style={{ padding: '0 16px 14px' }}><SaveBar dirty={d.dirty} disabled={!canEdit} reason={LOCK} onReset={d.reset} onSave={() => save({ notify: d.draft }, 'Notification preferences', `${keys.filter((k) => d.draft[k].email).length} email alerts`)} /></div>
    </Card>
  );
}

/* ---------- Integrations ---------- */
const INTEGRATION_META: Record<string, { desc: string; fields: [string, string][]; regions?: string[] }> = {
  'Twilio Voice': { desc: 'Programmable voice for outbound SIP and PSTN calls.', fields: [['Account SID', 'AC…'], ['Caller ID', '+44 …']], regions: ['Dublin (IE1)', 'London (UK1)'] },
  Vonage: { desc: 'Voice API with UK number ranges.', fields: [['Application ID', ''], ['Caller ID', '+44 …']], regions: ['EU', 'UK'] },
  'Genesys Cloud': { desc: 'Contact-centre platform for human transfer and queues.', fields: [['Organisation', ''], ['Queue for transfers', '']], regions: ['eu-west-2 (London)', 'eu-central-1 (Frankfurt)'] },
  Salesforce: { desc: 'Sync leads, outcomes and tasks with Sales Cloud.', fields: [['Instance URL', 'https://….my.salesforce.com'], ['Lead owner fallback', '']] },
  'Microsoft Dynamics 365': { desc: 'Sync contacts and opportunities with Dynamics Sales.', fields: [['Environment URL', 'https://….crm11.dynamics.com'], ['Business unit', '']], regions: ['UK South', 'North Europe'] },
  HubSpot: { desc: 'Push qualified leads and call notes to HubSpot CRM.', fields: [['Portal ID', ''], ['Pipeline', '']], regions: ['EU1'] },
  Snowflake: { desc: 'Nightly export of call analytics to your data warehouse.', fields: [['Account locator', ''], ['Database', '']], regions: ['AWS eu-west-2', 'Azure uksouth'] },
  'Google Calendar': { desc: 'Book appointments directly into rep calendars.', fields: [['Workspace domain', 'vodafone-demo.co.uk'], ['Booking calendar', '']] },
  'Microsoft Outlook': { desc: 'Exchange Online calendars for appointment booking.', fields: [['Tenant', ''], ['Resource mailbox', '']] },
  'ElevenLabs Voice': { desc: 'Neural text-to-speech voices for AI agents.', fields: [['Workspace', ''], ['Voice library', '']], regions: ['EU residency'] },
  'Amazon S3 Recordings': { desc: 'Encrypted storage for call recordings and transcripts.', fields: [['Bucket', 'vf-recordings'], ['KMS key alias', '']], regions: ['eu-west-2', 'eu-west-1'] },
};
export function IntegrationGrid({ names, canEdit }: { names: string[]; canEdit: boolean }) {
  const app = useApp(); const confirm = useConfirm();
  const [open, setOpen] = useState<string | null>(null);
  const disconnect = async (n: string) => {
    if (!(await confirm({ title: `Disconnect ${n}?`, desc: 'Syncing stops immediately. Existing data already transferred is not deleted. You can reconnect at any time.', confirmLabel: 'Disconnect', danger: true }))) return;
    app.updateSettings({ integrations: { ...app.settings.integrations, [n]: { connected: false } } });
    app.audit('Disconnected integration', n, 'Settings'); app.toast(`${n} disconnected`);
  };
  return (
    <>
      <div className="grid g-2">
        {names.map((n) => {
          const i = app.settings.integrations[n] ?? { connected: false }; const meta = INTEGRATION_META[n];
          return (
            <div key={n} className="card">
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <span className="adm-pipe-icon" style={{ width: 34, height: 34, borderRadius: 9 }}><Plug /></span>
                  <div><div className="medium" style={{ color: 'var(--ink)' }}>{n}</div><div className="small muted">{meta?.desc}</div></div>
                </div>
                {i.connected ? <Badge tone="green" dot>Connected</Badge> : <Badge dot>Not connected</Badge>}
              </div>
              <div className="row between mt-12" style={{ flexWrap: 'wrap' }}>
                <span className="mono xs muted truncate" style={{ maxWidth: 260 }}>{i.connected ? i.account ?? 'Configured' : 'No account linked'}</span>
                <div className="row">
                  {i.connected && <Button size="xs" variant="ghost" icon={<RefreshCw size={12} />} disabled={!canEdit} onClick={() => app.toast('Connection test succeeded (sandbox)', `${n} responded in ${80 + Math.floor(Math.random() * 120)} ms`)}>Test</Button>}
                  {i.connected
                    ? <Button size="xs" variant="danger" icon={<Unplug size={12} />} disabled={!canEdit} title={canEdit ? undefined : LOCK} onClick={() => disconnect(n)}>Disconnect</Button>
                    : <Button size="xs" icon={<Link2 size={12} />} disabled={!canEdit} title={canEdit ? undefined : LOCK} onClick={() => setOpen(n)}>Connect</Button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <ConnectModal name={open} onClose={() => setOpen(null)} />
    </>
  );
}
function ConnectModal({ name, onClose }: { name: string | null; onClose: () => void }) {
  const app = useApp();
  const meta = name ? INTEGRATION_META[name] : undefined;
  const [vals, setVals] = useState<string[]>(['', '']); const [region, setRegion] = useState('');
  const [tested, setTested] = useState(false); const [testing, setTesting] = useState(false); const [touched, setTouched] = useState(false);
  const reset = () => { setVals(['', '']); setRegion(''); setTested(false); setTouched(false); };
  const close = () => { reset(); onClose(); };
  if (!name || !meta) return null;
  const missing = !vals[0].trim();
  const test = () => {
    setTouched(true); if (missing) return;
    setTesting(true);
    setTimeout(() => { setTesting(false); setTested(true); app.toast('Connection test succeeded (sandbox)', `${name} · ${vals[0].trim()}`); }, 700);
  };
  const connect = () => {
    setTouched(true); if (missing) return;
    const account = `${vals[0].trim()}${region ? ` · ${region}` : ''} (sandbox)`;
    app.updateSettings({ integrations: { ...app.settings.integrations, [name]: { connected: true, account } } });
    app.audit('Connected integration', `${name} → ${vals[0].trim()}`, 'Settings');
    app.toast(`${name} connected`, 'Sandbox connection — no production traffic');
    close();
  };
  return (
    <Modal open onClose={close} title={`Connect ${name}`} desc="Only non-secret configuration is collected here. API secrets are entered in the provider’s OAuth flow or the secure vault and are never shown in the browser."
      footer={<><Button onClick={close}>Cancel</Button><Button icon={<RefreshCw size={13} />} onClick={test} disabled={testing}>{testing ? 'Testing…' : 'Test connection'}</Button><Button variant="primary" onClick={connect}>Connect</Button></>}>
      <div className="col gap-16">
        {meta.fields.map(([label, ph], i) => (
          <Field key={label} label={label} required={i === 0} error={i === 0 && touched && missing && `${label} is required`}>
            <input className={`input ${i === 0 && touched && missing ? 'invalid' : ''}`} placeholder={ph} value={vals[i]} onChange={(e) => { const v = [...vals]; v[i] = e.target.value; setVals(v); setTested(false); }} />
          </Field>
        ))}
        {meta.regions && <Field label="Region"><select className="select" value={region} onChange={(e) => setRegion(e.target.value)}><option value="">Select region…</option>{meta.regions.map((r) => <option key={r}>{r}</option>)}</select></Field>}
        {tested && <div className="banner ok"><Check />Connection test succeeded (sandbox).</div>}
      </div>
    </Modal>
  );
}
function randKey() { const c = 'abcdefghijklmnopqrstuvwxyz0123456789'; return 'vf_sbx_' + Array.from({ length: 32 }, () => c[Math.floor(Math.random() * c.length)]).join(''); }
export function WebhookCard({ scope, canEdit }: { scope: string; canEdit: boolean }) {
  const app = useApp(); const confirm = useConfirm();
  const [cfg, setCfg] = useLocalStore(`webhook-${scope}`, { url: `https://hooks.vodafone-demo.co.uk/ai-sales/${scope}`, key: randKey(), rotated: new Date(Date.now() - 41 * 86400000).toISOString() });
  const [show, setShow] = useState(false);
  const d = useDraft({ url: cfg.url });
  const urlOk = /^https:\/\/[^\s/$.?#].[^\s]*$/.test(d.draft.url);
  const masked = cfg.key.slice(0, 8) + '•'.repeat(20) + cfg.key.slice(-4);
  const regen = async () => {
    if (!(await confirm({ title: 'Regenerate API key?', desc: 'The current key stops working immediately. Update any systems that call this endpoint.', confirmLabel: 'Regenerate', danger: true }))) return;
    setCfg({ ...cfg, key: randKey(), rotated: new Date().toISOString() }); setShow(true);
    app.audit('Regenerated API key', `${scope} webhook`, 'Settings'); app.toast('API key regenerated', 'Copy it now — it will be masked again');
  };
  return (
    <Card title="Webhook & API access" sub={`Events for ${scope} integrations are signed with this key`} actions={<Webhook size={16} className="muted" />}>
      <FS canEdit={canEdit}>
        <Field label="Webhook endpoint URL" error={!urlOk && 'Must be a valid https:// URL'}>
          <input className={`input mono ${!urlOk ? 'invalid' : ''}`} value={d.draft.url} onChange={(e) => d.patch({ url: e.target.value })} />
        </Field>
        <div className="field mt-16">
          <span className="field-label">API key</span>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <code className="input soft adm-secret" style={{ display: 'flex', alignItems: 'center', flex: '1 1 240px', overflow: 'hidden', whiteSpace: 'nowrap', background: 'var(--mist)' }}>{show ? cfg.key : masked}</code>
            <Button size="sm" iconOnly icon={show ? <EyeOff /> : <Eye />} onClick={() => setShow(!show)} aria-label={show ? 'Hide key' : 'Reveal key'} disabled={!canEdit} />
            <Button size="sm" iconOnly icon={<Copy />} aria-label="Copy key" disabled={!canEdit} onClick={() => { navigator.clipboard?.writeText(cfg.key).catch(() => undefined); app.toast('API key copied'); }} />
            <Button size="sm" icon={<RefreshCw />} onClick={regen} disabled={!canEdit} title={canEdit ? undefined : LOCK}>Regenerate</Button>
          </div>
          <span className="field-hint">Last rotated {fmtRelative(cfg.rotated)} · rotate at least every 90 days</span>
        </div>
      </FS>
      <SaveBar dirty={d.dirty} disabled={!canEdit} reason={LOCK} onReset={d.reset} label="Save URL" onSave={() => { if (!urlOk) { app.toast('Enter a valid https:// URL', undefined, 'error'); return; } setCfg({ ...cfg, url: d.draft.url }); app.audit('Updated webhook URL', d.draft.url, 'Settings'); app.toast('Webhook URL saved'); }} />
    </Card>
  );
}
export function IntegrationSection({ title, desc, names, scope, canEdit }: { title: string; desc: string; names: string[]; scope: string; canEdit: boolean }) {
  const app = useApp();
  const n = names.filter((x) => app.settings.integrations[x]?.connected).length;
  return (
    <div className="col" style={{ gap: 16 }}>
      <div><div className="section-title">{title}</div><div className="section-desc">{desc} · {n} of {names.length} connected</div></div>
      <div className="banner sim"><Plug />All integrations run against sandbox environments in this demonstration. No customer data leaves the browser.</div>
      <IntegrationGrid names={names} canEdit={canEdit} />
      <WebhookCard scope={scope} canEdit={canEdit} />
    </div>
  );
}

/* ---------- Data retention ---------- */
export function RetentionSection({ canEdit }: P) {
  const app = useApp(); const nav = useNavigate(); const save = useSaver();
  const [extra, setExtra] = useLocalStore('retention-extra', { leadDays: 730, archivedPurgeDays: 90, auditYears: 7, anonymiseAnalytics: true });
  const d = useDraft({ retentionDays: app.settings.retentionDays, transcriptRetentionDays: app.settings.transcriptRetentionDays, ...extra });
  return (
    <div className="col" style={{ gap: 16 }}>
      <Card title="Data retention" sub="How long each type of data is kept before automatic deletion">
        <FS canEdit={canEdit}>
          <div className="form-grid">
            <Field label="Call recordings"><select className="select" value={d.draft.retentionDays} onChange={(e) => d.patch({ retentionDays: +e.target.value })}>{[30, 60, 90, 180, 365].map((n) => <option key={n} value={n}>{n} days</option>)}</select></Field>
            <Field label="Transcripts & AI summaries"><select className="select" value={d.draft.transcriptRetentionDays} onChange={(e) => d.patch({ transcriptRetentionDays: +e.target.value })}>{[90, 180, 365, 730, 1095].map((n) => <option key={n} value={n}>{n} days</option>)}</select></Field>
            <Field label="Inactive lead records" hint="Leads with no activity for this long are erased"><select className="select" value={d.draft.leadDays} onChange={(e) => d.patch({ leadDays: +e.target.value })}>{[365, 730, 1095].map((n) => <option key={n} value={n}>{n / 365} year{n > 365 ? 's' : ''}</option>)}</select></Field>
            <Field label="Purge archived leads after"><select className="select" value={d.draft.archivedPurgeDays} onChange={(e) => d.patch({ archivedPurgeDays: +e.target.value })}>{[30, 90, 180].map((n) => <option key={n} value={n}>{n} days</option>)}</select></Field>
            <Field label="Audit logs" hint="Immutable; minimum 6 years"><select className="select" value={d.draft.auditYears} onChange={(e) => d.patch({ auditYears: +e.target.value })}>{[6, 7, 10].map((n) => <option key={n} value={n}>{n} years</option>)}</select></Field>
          </div>
          <Row title="Anonymise analytics on deletion" desc="Keep aggregate metrics after personal data is erased."><Switch on={d.draft.anonymiseAnalytics} onChange={(v) => d.patch({ anonymiseAnalytics: v })} label="Anonymise analytics" /></Row>
        </FS>
        <SaveBar dirty={d.dirty} disabled={!canEdit} reason={LOCK} onReset={d.reset} onSave={() => { const { retentionDays, transcriptRetentionDays, ...rest } = d.draft; setExtra(rest); save({ retentionDays, transcriptRetentionDays }, 'Data retention', `recordings ${retentionDays}d · transcripts ${transcriptRetentionDays}d`); }} />
      </Card>
      <IntegrationGrid names={['Amazon S3 Recordings']} canEdit={canEdit} />
      <div className="row"><Button size="sm" variant="ghost" iconRight={<ArrowRight size={13} />} onClick={() => nav('/compliance?tab=recording')}>Recording disclosure & storage region</Button></div>
    </div>
  );
}

/* ---------- Audit logs link ---------- */
export function AuditSection() {
  const app = useApp(); const nav = useNavigate();
  const recent = app.auditLog.filter((a) => a.category === 'Settings').sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 6);
  return (
    <Card title="Audit logs" sub="Every settings change is recorded with actor, time and IP" actions={<Button size="sm" iconRight={<ArrowRight size={13} />} onClick={() => nav('/compliance?tab=audit')}>Open audit log</Button>}>
      <div className="list">
        {recent.map((a) => (
          <div key={a.id} className="list-item">
            <div className="grow"><div className="small medium" style={{ color: 'var(--ink)' }}>{a.action}</div><div className="xs muted truncate">{a.target} · {a.actor}</div></div>
            <span className="mono xs muted nowrap">{fmtRelative(a.at)}</span>
          </div>
        ))}
        {!recent.length && <div className="small muted">No settings changes recorded.</div>}
      </div>
    </Card>
  );
}
