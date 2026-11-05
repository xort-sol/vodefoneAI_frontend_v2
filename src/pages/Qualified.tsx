import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, CalendarCheck, ChevronDown, Flame, ListChecks, Shuffle, Sparkles, UserCheck, UserPlus, Users, BadgeCheck, Clock, Inbox, Wand2 } from 'lucide-react';
import { useApp, type Settings } from '../store/store';
import { Badge, Button, Card, DataTable, FilterSelect, Menu, MenuItem, PageHeader, Progress, ScoreBar, SearchInput, SimBadge, StatusBadge, Switch, Tabs, type Column } from '../components/ui';
import type { Lead, TeamMember } from '../data/types';
import { DAY, NOW } from '../data/seed';
import { fmtInt, fmtRelative } from '../lib/format';
import { QUALIFIED_STATUSES } from '../lib/metrics';
import { ENGAGED, PageFix, RepCell, useCallsByLead, useReps } from './leads/shared';
import { HandoverDrawer } from './leads/Handover';

type Cat = 'all' | 'Hot' | 'Warm' | 'Cold' | 'Not interested' | 'Unreachable' | 'Callback requested';
const CATS: Cat[] = ['all', 'Hot', 'Warm', 'Cold', 'Not interested', 'Unreachable', 'Callback requested'];
type Method = Settings['assignment'];
const METHODS: { value: Method; label: string; desc: string }[] = [
  { value: 'Round-robin', label: 'Automatic round-robin', desc: 'Distribute evenly across all available reps in turn.' },
  { value: 'Product-based', label: 'Product-based', desc: 'Route to reps specialised in the lead’s product of interest.' },
  { value: 'Team-based', label: 'Team-based', desc: 'Consumer → Consumer Sales, SME/Business → Business Sales, churn risk → Retention.' },
  { value: 'Priority-based', label: 'Priority-based', desc: 'Highest-scoring leads go to the best-converting reps first.' },
  { value: 'Manual', label: 'Manual', desc: 'Managers assign each lead from the handover drawer.' },
];

const deadlineOf = (l: Lead) => l.nextFollowUp ?? (l.lastCallAt ? new Date(new Date(l.lastCallAt).getTime() + (l.status === 'Hot' ? 1 : 2) * DAY).toISOString() : null);

function plan(method: Method, leads: Lead[], reps: TeamMember[], load: Map<string, number>) {
  const out = new Map<string, string>(); let skipped = 0;
  const l2 = new Map(load);
  const free = (r: TeamMember) => (l2.get(r.id) ?? 0) < r.capacity;
  const least = (c: TeamMember[]) => c.filter(free).sort((a, b) => (l2.get(a.id) ?? 0) / a.capacity - (l2.get(b.id) ?? 0) / b.capacity)[0];
  const take = (lead: Lead, r?: TeamMember) => { if (!r) { skipped++; return; } out.set(lead.id, r.id); l2.set(r.id, (l2.get(r.id) ?? 0) + 1); };
  let ptr = 0;
  const rr = () => { for (let i = 0; i < reps.length; i++) { const r = reps[(ptr + i) % reps.length]; if (free(r)) { ptr = (ptr + i + 1) % reps.length; return r; } } return undefined; };
  const sorted = [...leads].sort((a, b) => b.score - a.score);
  const top = [...reps].sort((a, b) => b.conversions - a.conversions).slice(0, 3);
  for (const lead of sorted) {
    if (method === 'Round-robin') take(lead, rr());
    else if (method === 'Product-based') { const spec = reps.filter((r) => r.products.includes(lead.productInterest)); take(lead, least(spec.length ? spec : reps) ?? least(reps)); }
    else if (method === 'Team-based') { const team = lead.customerType === 'Consumer' ? (lead.tags.includes('Retention risk') ? 'Retention' : 'Consumer Sales') : 'Business Sales'; const c = reps.filter((r) => r.team === team); take(lead, least(c) ?? least(reps)); }
    else if (method === 'Priority-based') take(lead, lead.score >= 80 || lead.status === 'Hot' ? least(top) ?? least(reps) : rr());
  }
  return { out, skipped };
}

export default function Qualified() {
  const app = useApp(); const reps = useReps(); const byLead = useCallsByLead();
  const [params, setParams] = useSearchParams();
  const catParam = params.get('cat') as Cat | null;
  const cat: Cat = catParam && CATS.includes(catParam) ? catParam : 'all';
  const unassignedOnly = params.get('view') === 'unassigned';
  const openId = params.get('lead');
  const [q, setQ] = useState(''); const [product, setProduct] = useState(''); const [repF, setRepF] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const setParams2 = (patch: Record<string, string | null>) => { const p = new URLSearchParams(params); Object.entries(patch).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k))); setParams(p, { replace: !('lead' in patch) }); };
  const setParam = (k: string, v: string | null) => setParams2({ [k]: v });

  const pool = useMemo(() => app.leads.filter((l) => !l.archived && l.attempts > 0), [app.leads]);
  const qualified = pool.filter((l) => (QUALIFIED_STATUSES as readonly string[]).includes(l.status));
  const engaged = pool.filter((l) => ENGAGED.includes(l.status));
  const unassigned = engaged.filter((l) => !l.assignedRepId);
  const qualifiedIds = new Set(qualified.map((l) => l.id));
  const kpis = {
    total: qualified.length,
    newWarm: pool.filter((l) => l.status === 'Warm' && l.lastCallAt && NOW.getTime() - +new Date(l.lastCallAt) < 2 * DAY).length,
    hot: pool.filter((l) => l.status === 'Hot').length,
    awaiting: unassigned.length,
    assigned: engaged.filter((l) => l.assignedRepId).length,
    followUps: app.tasks.filter((t) => !t.done && qualifiedIds.has(t.leadId)).length,
    appts: app.appointments.filter((a) => new Date(a.start) > NOW && ['Scheduled', 'Confirmed', 'Rescheduled'].includes(a.status)).length,
    converted: pool.filter((l) => l.status === 'Converted').length,
  };

  const inCat = (l: Lead, c: Cat) => (c === 'all' ? (QUALIFIED_STATUSES as readonly string[]).includes(l.status) : l.status === c);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return pool.filter((l) => (!s || l.name.toLowerCase().includes(s) || l.id.toLowerCase().includes(s))
      && (!product || l.productInterest === product) && (!repF || (repF === 'none' ? !l.assignedRepId : l.assignedRepId === repF))
      && (!unassignedOnly || (!l.assignedRepId && ENGAGED.includes(l.status))));
  }, [pool, q, product, repF, unassignedOnly]);
  const rows = filtered.filter((l) => inCat(l, cat));
  const openLead = openId ? app.leadById.get(openId) ?? null : null;

  // assignment rules
  const method = app.settings.assignment;
  const load = useMemo(() => { const m = new Map<string, number>(); app.leads.forEach((l) => { if (l.assignedRepId && ENGAGED.includes(l.status) && !l.archived) m.set(l.assignedRepId, (m.get(l.assignedRepId) ?? 0) + 1); }); return m; }, [app.leads]);
  const canAssign = app.can('leads.assign');
  const setMethod = (m: Method) => { app.updateSettings({ assignment: m }); app.audit('Changed assignment rule', m, 'Settings'); app.toast('Assignment rule updated', METHODS.find((x) => x.value === m)?.label); };
  const autoAssign = () => {
    const { out, skipped } = plan(method, unassigned, reps, load);
    const byRep = new Map<string, string[]>();
    out.forEach((r, l) => byRep.set(r, [...(byRep.get(r) ?? []), l]));
    byRep.forEach((ids, r) => app.updateLeads(ids, { assignedRepId: r }));
    const summary = [...byRep.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 4).map(([r, ids]) => `${app.memberById.get(r)?.name.split(' ')[0]} ${ids.length}`).join(' · ');
    app.audit('Auto-assigned leads', `${out.size} leads · ${method}`, 'Data');
    app.toast(`${out.size} lead${out.size === 1 ? '' : 's'} assigned · ${method}`, `${summary}${byRep.size > 4 ? ` · +${byRep.size - 4} more reps` : ''}${skipped ? ` · ${skipped} skipped (reps at capacity)` : ''}`, out.size ? 'success' : 'error');
  };
  const bulkAssign = (ids: string[], repId: string) => { app.updateLeads(ids, { assignedRepId: repId }); app.audit('Bulk assigned leads', `${ids.length} → ${app.memberById.get(repId)?.name}`, 'Data'); app.toast(`${ids.length} lead${ids.length > 1 ? 's' : ''} assigned`, app.memberById.get(repId)?.name); };

  const columns: Column<Lead>[] = [
    { key: 'name', header: 'Lead', render: (l) => <div style={{ maxWidth: 210 }}><div className="cell-primary truncate">{l.name}</div><div className="cell-sub truncate"><span className="mono">{l.id}</span> · {app.productById.get(l.productInterest)?.name}</div></div>, sort: (l) => l.name },
    { key: 'cat', header: 'Category', render: (l) => <StatusBadge status={l.status} />, sort: (l) => l.status },
    { key: 'score', header: 'Score', render: (l) => <ScoreBar value={l.score} />, sort: (l) => l.score },
    { key: 'rep', header: 'Assigned rep', render: (l) => l.assignedRepId ? <span className="row gap-4"><RepCell repId={l.assignedRepId} />{l.tags.includes('Handover accepted') && <UserCheck size={13} className="green" aria-label="Accepted" />}</span> : <Badge tone="amber">Unassigned</Badge>, sort: (l) => app.memberById.get(l.assignedRepId ?? '')?.name ?? '' },
    { key: 'due', header: 'Follow-up by', render: (l) => { const d = deadlineOf(l); const od = d && new Date(d) < NOW && ENGAGED.includes(l.status); return d ? <span className={`small nowrap ${od ? 'red' : ''}`} title={od ? 'Overdue' : undefined}>{fmtRelative(d)}</span> : <span className="muted">—</span>; }, sort: (l) => +new Date(deadlineOf(l) ?? 0) },
    { key: 'last', header: 'Last AI call', render: (l) => <span className="small nowrap">{fmtRelative(l.lastCallAt)}</span>, sort: (l) => +new Date(l.lastCallAt ?? 0) },
    { key: 'open', header: '', render: (l) => <Button size="xs" variant="ghost" iconOnly icon={<ArrowRight />} aria-label={`Open handover for ${l.name}`} title="Open handover" onClick={(e) => { e.stopPropagation(); setParam('lead', l.id); }} /> },
  ];

  const strip: [string, number, ReactNode, () => void][] = [
    ['Total qualified', kpis.total, <BadgeCheck key="i" size={13} />, () => setParams2({ cat: null, view: null })],
    ['New warm · 48h', kpis.newWarm, <Sparkles key="i" size={13} />, () => setParam('cat', 'Warm')],
    ['Hot leads', kpis.hot, <Flame key="i" size={13} />, () => setParam('cat', 'Hot')],
    ['Awaiting assignment', kpis.awaiting, <Inbox key="i" size={13} />, () => setParam('view', 'unassigned')],
    ['Assigned', kpis.assigned, <Users key="i" size={13} />, () => setParam('view', null)],
    ['Follow-ups pending', kpis.followUps, <Clock key="i" size={13} />, () => setParam('cat', null)],
    ['Appointments booked', kpis.appts, <CalendarCheck key="i" size={13} />, () => setParam('cat', null)],
    ['Converted', kpis.converted, <ListChecks key="i" size={13} />, () => setParam('cat', null)],
  ];

  return (
    <>
      <PageFix />
      <style>{'.q-strip{grid-template-columns:repeat(8,minmax(0,1fr))}@media(max-width:1560px){.q-strip{grid-template-columns:repeat(4,minmax(0,1fr))}.q-strip>div:nth-child(-n+4){border-bottom:1px solid var(--ash)}.q-strip>div:nth-child(4n){border-right:0}}'}</style>
      <PageHeader
        title="Qualified leads"
        desc="AI-qualified leads ready for human follow-up — review the handover, assign a rep and track conversion."
        eyebrow={<><Badge tone="amber" dot>{kpis.awaiting} awaiting assignment</Badge><SimBadge /></>}
        actions={<Button size="sm" variant="primary" icon={<Wand2 />} onClick={autoAssign} disabled={!canAssign || method === 'Manual' || !kpis.awaiting} title={!canAssign ? 'Your role cannot assign leads' : method === 'Manual' ? 'Manual mode — assign from the handover drawer' : undefined}>Auto-assign {kpis.awaiting} unassigned</Button>}
      />

      <div className="stat-strip q-strip" style={{ marginBottom: 20 }}>
        {strip.map(([label, v, icon, go]) => (
          <div key={label} className="card-link" onClick={go} style={{ cursor: 'pointer' }}>
            <div className="kpi-label">{icon}<span className="truncate">{label}</span></div>
            <div className="kpi-value mt-4">{fmtInt(v)}</div>
          </div>
        ))}
      </div>

      <div className="side-layout">
        <div style={{ minWidth: 0 }}>
          <Tabs value={cat} onChange={(v) => setParam('cat', v === 'all' ? null : v)} tabs={CATS.map((c) => ({ value: c, label: c === 'all' ? 'All qualified' : c, count: filtered.filter((l) => inCat(l, c)).length }))} />
          <Card flush>
            <DataTable
              rows={rows} columns={columns} rowKey={(l) => l.id} onRowClick={(l) => setParam('lead', l.id)}
              selectable={canAssign} selected={selected} onSelectedChange={setSelected}
              initialSort={{ key: 'score', dir: 'desc' }}
              toolbar={<>
                <SearchInput value={q} onChange={setQ} placeholder="Search name or ID…" width={220} />
                <FilterSelect label="Product" value={product} onChange={setProduct} options={app.products.map((p) => ({ value: p.id, label: p.name }))} />
                <FilterSelect label="Rep" value={repF} onChange={setRepF} options={[{ value: 'none', label: 'Unassigned' }, ...reps.map((r) => ({ value: r.id, label: r.name }))]} />
                <label className="row small" style={{ cursor: 'pointer', marginLeft: 'auto' }}><Switch on={unassignedOnly} onChange={(v) => setParam('view', v ? 'unassigned' : null)} label="Unassigned only" />Unassigned only</label>
              </>}
              bulkActions={(ids, clear) => (
                <Menu align="left" width={240} trigger={(t) => <button className="btn xs" onClick={t}><UserPlus size={13} />Assign rep<ChevronDown size={12} /></button>}>
                  {(close) => <div style={{ maxHeight: 280, overflowY: 'auto' }}>{reps.map((r) => <MenuItem key={r.id} onClick={() => { close(); bulkAssign(ids, r.id); clear(); }}>{r.name}<span className="xs muted" style={{ marginLeft: 'auto' }}>{load.get(r.id) ?? 0}/{r.capacity}</span></MenuItem>)}</div>}
                </Menu>
              )}
            />
          </Card>
        </div>

        <div className="col gap-16">
          <Card title="Assignment rules" sub="How new qualified leads are routed to people" actions={<Shuffle size={15} className="muted" />}>
            <div className="col" style={{ gap: 8 }}>
              {METHODS.map((m) => (
                <button key={m.value} type="button" className={`option-card ${method === m.value ? 'on' : ''}`} style={{ padding: '10px 12px' }} onClick={() => canAssign && setMethod(m.value)} disabled={!canAssign} title={canAssign ? undefined : 'Your role cannot change assignment rules'}>
                  <div className="row between"><span className="medium small" style={{ color: 'var(--ink)' }}>{m.label}</span>{method === m.value && <Badge tone="blue">Active</Badge>}</div>
                  <div className="xs muted mt-4">{m.desc}</div>
                </button>
              ))}
            </div>
            <Button className="mt-12" style={{ width: '100%' }} icon={<Wand2 />} onClick={autoAssign} disabled={!canAssign || method === 'Manual' || !kpis.awaiting}>Auto-assign {kpis.awaiting} unassigned</Button>
            {method === 'Manual' && <div className="xs muted mt-8">Manual mode: open a lead and choose a rep in the handover drawer.</div>}
          </Card>
          <Card title="Rep capacity" sub="Active engaged leads vs capacity">
            <div className="col" style={{ gap: 10 }}>
              {reps.map((r) => {
                const n = load.get(r.id) ?? 0; const pct = (n / Math.max(1, r.capacity)) * 100;
                return (
                  <div key={r.id} className="card-link" style={{ cursor: 'pointer' }} onClick={() => setRepF(r.id)}>
                    <div className="row between small"><span className="row gap-4 truncate"><span className="truncate" style={{ color: 'var(--ink)' }}>{r.name}</span><span className="xs muted">{r.team.replace(' Sales', '')}</span></span><span className="mono">{n}/{r.capacity}</span></div>
                    <div className="mt-4"><Progress value={pct} color={pct >= 90 ? 'var(--tangerine)' : pct >= 70 ? '#F59E0B' : undefined} /></div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      <HandoverDrawer lead={openLead} calls={openLead ? byLead.get(openLead.id) ?? [] : []} onClose={() => setParam('lead', null)} />
    </>
  );
}

