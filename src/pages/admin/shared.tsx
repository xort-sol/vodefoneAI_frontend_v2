// Shared helpers for the admin module (Team, Member profile, Compliance, Notifications, Settings).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, RotateCcw, Save } from 'lucide-react';
import { useApp, ROLE_PERMISSIONS, type Permission } from '../../store/store';
import type { Lead, Role, TeamMember } from '../../data/types';
import { Button } from '../../components/ui';
import { NOW } from '../../data/seed';

export const ROLES: Role[] = ['Super Admin', 'Administrator', 'Sales Manager', 'Supervisor', 'Sales Representative', 'Analyst'];
export const TEAMS: TeamMember['team'][] = ['Consumer Sales', 'Business Sales', 'Retention', 'Operations', 'Insights'];
export const MEMBER_STATUSES: TeamMember['status'][] = ['Available', 'Busy', 'Away', 'Offline'];

export const ROLE_DESC: Record<Role, string> = {
  'Super Admin': 'Full control of the platform, including destructive actions such as permanently deleting lead data. Reserved for platform owners.',
  Administrator: 'Manages users, settings, integrations, compliance and AI agents. Can do everything except permanently delete leads.',
  'Sales Manager': 'Runs campaigns, manages the product catalogue, imports and assigns leads, and reports on team performance.',
  Supervisor: 'Monitors live AI calls, can whisper or take over, reassigns leads and coaches representatives.',
  'Sales Representative': 'Works assigned qualified leads: follow-ups, appointments and notes. Can listen to their call recordings.',
  Analyst: 'Read-only analytics access with exports. Can review recordings for quality assurance; cannot edit data.',
};

export const PERMISSION_META: { key: Permission; label: string; desc: string; group: string }[] = [
  { key: 'leads.edit', label: 'Edit leads', desc: 'Update lead details, status, notes and follow-ups.', group: 'Leads' },
  { key: 'leads.assign', label: 'Assign leads', desc: 'Assign or reassign leads to representatives.', group: 'Leads' },
  { key: 'leads.import', label: 'Import leads', desc: 'Upload CSV files and sync leads from CRM.', group: 'Leads' },
  { key: 'leads.export', label: 'Export leads', desc: 'Download lead data containing personal information.', group: 'Leads' },
  { key: 'leads.delete', label: 'Delete leads', desc: 'Permanently erase lead records (irreversible).', group: 'Leads' },
  { key: 'campaigns.manage', label: 'Manage campaigns', desc: 'Create, launch, pause and stop calling campaigns.', group: 'Calling' },
  { key: 'calling.control', label: 'Control calling', desc: 'Pause or resume the calling engine and adjust capacity.', group: 'Calling' },
  { key: 'calling.takeover', label: 'Take over calls', desc: 'Whisper to the AI agent or take over a live call.', group: 'Calling' },
  { key: 'recordings.listen', label: 'Listen to recordings', desc: 'Play back call recordings and read transcripts.', group: 'Calling' },
  { key: 'agents.edit', label: 'Edit AI agents', desc: 'Change prompts, voices, objection handling and flows.', group: 'AI agents' },
  { key: 'agents.publish', label: 'Publish AI agents', desc: 'Promote an agent version to production.', group: 'AI agents' },
  { key: 'products.manage', label: 'Manage products', desc: 'Edit the product catalogue and promotional offers.', group: 'Catalogue' },
  { key: 'reports.export', label: 'Export reports', desc: 'Download analytics and performance reports.', group: 'Reporting' },
  { key: 'team.manage', label: 'Manage team', desc: 'Invite users, change roles, teams and capacity.', group: 'Administration' },
  { key: 'compliance.manage', label: 'Manage compliance', desc: 'Suppression lists, consent, DSRs and retention.', group: 'Administration' },
  { key: 'settings.manage', label: 'Manage settings', desc: 'Organisation settings, integrations and security.', group: 'Administration' },
];

export const roleHas = (r: Role, p: Permission) => ROLE_PERMISSIONS[r].includes(p);

export const ROLE_TONE: Record<Role, 'purple' | 'blue' | 'green' | 'amber' | 'neutral' | 'outline'> = {
  'Super Admin': 'purple', Administrator: 'blue', 'Sales Manager': 'green', Supervisor: 'amber', 'Sales Representative': 'neutral', Analyst: 'outline',
};

/** Revenue model used across the module (monthly price × contract term for converted leads). */
export function useMemberStats() {
  const app = useApp();
  return useCallback((m: TeamMember) => {
    const assigned = app.leads.filter((l) => l.assignedRepId === m.id && !l.archived);
    const converted = assigned.filter((l) => l.status === 'Converted');
    const open = assigned.filter((l) => !['Converted', 'Not interested', 'Do not call'].includes(l.status));
    const tasks = app.tasks.filter((t) => t.repId === m.id);
    const done = tasks.filter((t) => t.done).length;
    const overdue = tasks.filter((t) => !t.done && new Date(t.due) < NOW).length;
    const appts = app.appointments.filter((a) => a.repId === m.id);
    const revenue = converted.reduce((s, l) => { const p = app.productById.get(l.productInterest); return s + (p ? p.monthlyPrice * p.contractMonths : 0); }, 0);
    return {
      assigned, converted, open, tasks, done, overdue, appts, revenue,
      conversions: converted.length,
      convRate: assigned.length ? (converted.length / assigned.length) * 100 : 0,
      load: open.length,
      utilisation: m.capacity ? (open.length / m.capacity) * 100 : 0,
    };
  }, [app.leads, app.tasks, app.appointments, app.productById]);
}

export const leadValue = (l: Lead, price?: { monthlyPrice: number; contractMonths: number }) => (price ? price.monthlyPrice * price.contractMonths : 0);

/** Draft state for forms with dirty-state detection. */
export function useDraft<T>(source: T) {
  const [draft, setDraft] = useState<T>(source);
  const key = JSON.stringify(source);
  useEffect(() => { setDraft(source); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [key]);
  const dirty = JSON.stringify(draft) !== key;
  const patch = (p: Partial<T>) => setDraft((d) => ({ ...d, ...p }));
  const reset = () => setDraft(source);
  return { draft, setDraft, patch, dirty, reset };
}

/** Module-level persistence for demo-only settings that are not part of the shared store. */
const LOCAL = new Map<string, unknown>();
export function useLocalStore<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => (LOCAL.has(key) ? (LOCAL.get(key) as T) : initial));
  const set = (nv: T) => { LOCAL.set(key, nv); setV(nv); };
  return [v, set];
}

export function SaveBar({ dirty, onSave, onReset, disabled, label = 'Save changes', reason }: { dirty: boolean; onSave: () => void; onReset: () => void; disabled?: boolean; label?: string; reason?: string }) {
  return (
    <div className="row between" style={{ borderTop: '1px solid var(--ash)', paddingTop: 14, marginTop: 8, flexWrap: 'wrap' }}>
      <span className="small muted">{disabled ? <span className="row gap-4"><Lock size={13} />{reason ?? 'Read-only for your role'}</span> : dirty ? <span className="row gap-4" style={{ color: 'var(--amber)' }}><span style={{ width: 6, height: 6, borderRadius: 9, background: 'currentColor', display: 'inline-block' }} />Unsaved changes</span> : 'All changes saved'}</span>
      <div className="row">
        <Button size="sm" variant="ghost" icon={<RotateCcw />} disabled={!dirty || disabled} onClick={onReset}>Discard</Button>
        <Button size="sm" variant="primary" icon={<Save />} disabled={!dirty || disabled} onClick={onSave} title={disabled ? reason : undefined}>{label}</Button>
      </div>
    </div>
  );
}

export function ReadOnlyNotice({ perm, what }: { perm: Permission; what: string }) {
  const { role } = useApp();
  return (
    <div className="banner info" style={{ marginBottom: 16 }}>
      <Lock />
      <div>You are viewing {what} as <b>{role}</b>. Editing requires the <span className="mono">{perm}</span> permission — ask an Administrator to make changes.</div>
    </div>
  );
}

/** Toggle chip used for day pickers and filter chips. */
export function Chip({ on, onClick, children, disabled, count, title }: { on: boolean; onClick?: () => void; children: React.ReactNode; disabled?: boolean; count?: number; title?: string }) {
  return (
    <button type="button" className={`adm-chip ${on ? 'on' : ''}`} onClick={onClick} disabled={disabled} aria-pressed={on} title={title}>
      {children}{count !== undefined && <span className="adm-chip-count">{count}</span>}
    </button>
  );
}

export const ADMIN_CSS = `
.adm-chip { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 11px; border-radius:9999px; border:1px solid var(--ash); background:var(--canvas); color:var(--slate); font-size:12.5px; font-weight:500; cursor:pointer; white-space:nowrap; }
.adm-chip:hover { border-color: var(--smoke); color: var(--ink); }
.adm-chip.on { background: var(--blue-tint); border-color: #bfd4fe; color: var(--sapphire); }
.adm-chip:disabled { opacity:.5; cursor:not-allowed; }
.adm-chip svg { width:14px; height:14px; }
.adm-chip-count { font-family: var(--font-mono); font-size: 11px; color: var(--fog); }
.adm-chip.on .adm-chip-count { color: var(--sapphire); }
.adm-matrix th, .adm-matrix td { text-align:center; }
.adm-matrix th:first-child, .adm-matrix td:first-child { text-align:left; }
.adm-check { display:inline-grid; place-items:center; width:20px; height:20px; border-radius:6px; background: var(--mint); color: var(--green); }
.adm-dash { color: var(--smoke); }
.adm-pipe { display:flex; align-items:stretch; gap:0; overflow-x:auto; padding-bottom:4px; }
.adm-pipe-node { flex: 1 1 0; display:flex; flex-direction:column; justify-content:flex-start; border:1px solid var(--ash); border-radius: 10px; padding: 12px; background: var(--canvas); cursor:pointer; min-width: 118px; text-align:left; font: inherit; color: inherit; }
.adm-pipe-node:hover { border-color: var(--smoke); }
.adm-pipe-node.end { background: var(--mist); border-style: dashed; cursor: default; }
.adm-pipe-arrow { display:flex; align-items:center; color: var(--silver); padding: 0 2px; flex-shrink:0; }
.adm-pipe-icon { width:26px; height:26px; border-radius:7px; display:grid; place-items:center; background: var(--mist); color: var(--slate); }
.adm-pipe-icon svg { width:14px; height:14px; }
.adm-section-nav .step svg { width: 15px; height: 15px; flex-shrink: 0; }
.adm-notif { display:flex; gap:12px; padding:12px 16px; border-bottom:1px solid var(--ash); cursor:pointer; align-items:flex-start; position:relative; }
.adm-notif:hover { background:#fafafa; }
.adm-notif.unread { background: #fbfcff; }
.adm-notif.unread::before { content:''; position:absolute; left:6px; top:20px; width:6px; height:6px; border-radius:50%; background: var(--blue); }
.adm-notif-icon { width:30px; height:30px; border-radius:8px; display:grid; place-items:center; flex-shrink:0; border:1px solid var(--ash); background: var(--canvas); }
.adm-notif-icon svg { width:15px; height:15px; }
.adm-hours { display:grid; grid-template-columns: 40px repeat(24, minmax(0,1fr)); gap:2px; }
.adm-hours .hcell { height: 14px; border-radius: 2px; background: var(--ash); }
.adm-hours .hcell.on { background: var(--ink); opacity: .8; }
.spin { animation: adm-spin 0.9s linear infinite; }
@keyframes adm-spin { to { transform: rotate(360deg); } }
.adm-secret { font-family: var(--font-mono); font-size: 12.5px; }
@media (max-width: 720px) {
  .adm-pipe { flex-direction: column; overflow: visible; }
  .adm-pipe-node { flex: none; min-width: 0; }
  .adm-pipe-arrow { justify-content:center; padding: 2px 0; transform: rotate(90deg); }
  .adm-hide-sm { display: none !important; }
  .adm-two { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
}
`;
export function AdminStyles() { return <style>{ADMIN_CSS}</style>; }

export function useStatusTone() {
  return useMemo(() => ({ Available: 'green', Busy: 'orange', Away: 'amber', Offline: 'neutral' } as const), []);
}

export const isUKPhone = (raw: string) => /^(?:\+44|0044|0)(?:7\d{9}|[123]\d{8,9})$/.test(raw.replace(/[\s()-]/g, ''));
export function formatUKPhone(raw: string) {
  let d = raw.replace(/[\s()-]/g, '');
  if (d.startsWith('0044')) d = d.slice(4); else if (d.startsWith('+44')) d = d.slice(3); else if (d.startsWith('0')) d = d.slice(1);
  if (d.startsWith('7')) return `+44 ${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  return `+44 ${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
}
export const maskPhone = (p: string) => p.replace(/(\+44 \d)\d{3} \d{3} (\d{3})/, '$1*** *** $2');
