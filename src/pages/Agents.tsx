import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine, LabelList } from 'recharts';
import { Archive, Bot, Copy, LayoutGrid, List, MoreHorizontal, Pause, Play, Plus, Smile, Timer, PhoneCall, BadgeCheck, ArchiveRestore, Pencil } from 'lucide-react';
import { useApp } from '../store/store';
import {
  Avatar, Badge, Button, Card, ChartTip, CHART, DataTable, EmptyState, Field, FilterSelect, KpiCard, Menu, MenuItem, Modal, PageHeader,
  SearchInput, Segmented, SimBadge, StatusBadge, Switch, useConfirm, type Column,
} from '../components/ui';
import { fmtDur, fmtInt, fmtPct, fmtRelative } from '../lib/format';
import { NOW } from '../data/seed';
import type { Agent } from '../data/types';
import { AGENT_COLORS, LANGUAGES, VOICES, ACCENTS, type AgentX } from './agents/model';

type Row = AgentX & { campaigns: { id: string; name: string; status: string }[] };

export default function Agents() {
  const app = useApp(); const nav = useNavigate(); const confirm = useConfirm();
  const canEdit = app.can('agents.edit');
  const noEdit = 'Your role cannot edit AI agents';
  const [view, setView] = useState<'cards' | 'table'>(() => { try { return (localStorage.getItem('vf-agents-view') as 'cards' | 'table') || 'cards'; } catch { return 'cards'; } });
  const setViewP = (v: 'cards' | 'table') => { setView(v); try { localStorage.setItem('vf-agents-view', v); } catch { /* ignore */ } };
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const rows: Row[] = useMemo(() => (app.agents as AgentX[]).map((a) => ({
    ...a, campaigns: app.campaigns.filter((c) => c.agentId === a.id).map((c) => ({ id: c.id, name: c.name, status: c.status })),
  })), [app.agents, app.campaigns]);

  const filtered = rows.filter((a) => (showArchived ? true : !a.archived)
    && (!status || a.status === status)
    && (!q || `${a.name} ${a.voice} ${a.language} ${a.accent} ${a.personality}`.toLowerCase().includes(q.toLowerCase())));

  const active = rows.filter((a) => !a.archived);
  const withCalls = active.filter((a) => a.totalCalls > 0);
  const totalCalls = active.reduce((s, a) => s + a.totalCalls, 0);
  const wAvg = (k: 'qualificationRate' | 'sentimentScore' | 'avgDuration') => totalCalls ? withCalls.reduce((s, a) => s + a[k] * a.totalCalls, 0) / totalCalls : 0;
  const chart = [...withCalls].sort((a, b) => b.qualificationRate - a.qualificationRate).map((a) => ({ name: a.name, rate: a.qualificationRate, color: a.color }));
  const avgRate = wAvg('qualificationRate');
  const xMax = Math.max(10, Math.ceil((Math.max(0, ...chart.map((c) => c.rate)) + 2) / 5) * 5);

  const duplicate = (a: AgentX) => {
    const { id: _id, archived: _ar, ...rest } = a;
    const copy = app.addAgent({
      ...rest, name: `${a.name} (copy)`, status: 'Draft', version: 'v0.1.0', totalCalls: 0, avgDuration: 0, qualificationRate: 0, sentimentScore: 0, escalationRate: 0,
      updatedAt: NOW.toISOString(), versions: [{ version: 'v0.1.0-draft', at: new Date().toISOString(), author: app.me.name, note: `Duplicated from ${a.name} ${a.version}`, status: 'Draft' }],
    } as Omit<Agent, 'id'>);
    app.audit('Duplicated AI agent', `${a.name} → ${copy.name}`, 'Agent');
    app.toast('Agent duplicated', `${copy.name} created as a draft.`);
  };
  const togglePause = (a: AgentX) => {
    const next: Agent['status'] = a.status === 'Paused' ? 'Live' : 'Paused';
    app.updateAgent(a.id, { status: next, updatedAt: new Date().toISOString() });
    app.audit(next === 'Paused' ? 'Paused AI agent' : 'Resumed AI agent', a.name, 'Agent');
    app.toast(next === 'Paused' ? `${a.name} paused` : `${a.name} resumed`, next === 'Paused' ? 'Campaigns using this agent will hold new simulated calls.' : 'Agent is live again for assigned campaigns.');
  };
  const archive = async (a: Row) => {
    if (a.archived) {
      app.updateAgent(a.id, { archived: false } as Partial<Agent>);
      app.audit('Restored AI agent from archive', a.name, 'Agent'); app.toast(`${a.name} restored`, 'Agent restored as paused.');
      return;
    }
    const activeCamps = a.campaigns.filter((c) => ['Active', 'Scheduled'].includes(c.status));
    const ok = await confirm({
      title: `Archive ${a.name}?`, danger: true, confirmLabel: 'Archive agent',
      desc: activeCamps.length
        ? <>This agent is assigned to <b>{activeCamps.length}</b> active or scheduled campaign{activeCamps.length > 1 ? 's' : ''} ({activeCamps.map((c) => c.name).join(', ')}). Archiving pauses it — reassign those campaigns to another agent.</>
        : 'The agent will be paused and hidden from the listing. Its version history and call records are retained.',
    });
    if (!ok) return;
    app.updateAgent(a.id, { archived: true, status: 'Paused' } as Partial<Agent>);
    app.audit('Archived AI agent', a.name, 'Agent');
    app.toast(`${a.name} archived`);
  };

  const rowMenu = (a: Row) => (
    <Menu width={190} trigger={(t) => <Button size="xs" variant="ghost" iconOnly icon={<MoreHorizontal />} onClick={t} aria-label={`Actions for ${a.name}`} />}>
      {(close) => (<>
        <MenuItem icon={<Pencil />} onClick={() => { close(); nav(`/agents/${a.id}`); }}>Open builder</MenuItem>
        <MenuItem icon={<Copy />} disabled={!canEdit} onClick={() => { close(); if (canEdit) duplicate(a); }}>Duplicate</MenuItem>
        {!a.archived && (a.status === 'Live' || a.status === 'Paused' || a.status === 'Testing') && (
          <MenuItem icon={a.status === 'Paused' ? <Play /> : <Pause />} disabled={!canEdit} onClick={() => { close(); if (canEdit) togglePause(a); }}>{a.status === 'Paused' ? 'Resume' : 'Pause'}</MenuItem>
        )}
        <div className="menu-sep" />
        <MenuItem icon={a.archived ? <ArchiveRestore /> : <Archive />} danger={!a.archived} disabled={!canEdit} onClick={() => { close(); if (canEdit) archive(a); }}>{a.archived ? 'Restore' : 'Archive'}</MenuItem>
        {!canEdit && <div className="menu-label xs muted">{noEdit}</div>}
      </>)}
    </Menu>
  );

  const campCell = (a: Row) => a.campaigns.length
    ? <div className="row-wrap gap-4">{a.campaigns.slice(0, 2).map((c) => <button key={c.id} className="tag" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); nav(`/campaigns/${c.id}`); }} title={`${c.name} · ${c.status}`}><span className="truncate" style={{ maxWidth: 150 }}>{c.name}</span></button>)}{a.campaigns.length > 2 && <span className="xs muted">+{a.campaigns.length - 2}</span>}</div>
    : <span className="muted small">Not assigned</span>;

  const columns: Column<Row>[] = [
    { key: 'name', header: 'Agent', sort: (a) => a.name, render: (a) => (
      <div className="row"><Avatar initials={a.initials} color={a.color} agent /><div style={{ minWidth: 0 }}><div className="cell-primary">{a.name}{a.archived && <> <Badge tone="outline">Archived</Badge></>}</div><div className="cell-sub mono">{a.id} · {a.version}</div></div></div>
    ) },
    { key: 'voice', header: 'Voice', sort: (a) => a.voice, render: (a) => <span className="small">{a.voice}</span> },
    { key: 'lang', header: 'Language / accent', render: (a) => <div><div className="small">{a.language}</div><div className="cell-sub">{a.accent}</div></div> },
    { key: 'camps', header: 'Campaigns', sort: (a) => a.campaigns.length, render: campCell },
    { key: 'calls', header: 'Calls', align: 'right', sort: (a) => a.totalCalls, render: (a) => <span className="mono">{fmtInt(a.totalCalls)}</span> },
    { key: 'dur', header: 'Avg dur.', align: 'right', sort: (a) => a.avgDuration, render: (a) => <span className="mono">{a.totalCalls ? fmtDur(a.avgDuration) : '—'}</span> },
    { key: 'qr', header: 'Qual. rate', align: 'right', sort: (a) => a.qualificationRate, render: (a) => <span className="mono">{a.totalCalls ? fmtPct(a.qualificationRate) : '—'}</span> },
    { key: 'sent', header: 'Sentiment', align: 'right', sort: (a) => a.sentimentScore, render: (a) => <span className="mono">{a.totalCalls ? `${a.sentimentScore}/100` : '—'}</span> },
    { key: 'status', header: 'Status', sort: (a) => a.status, render: (a) => <StatusBadge status={a.status} /> },
    { key: 'menu', header: '', render: (a) => <span onClick={(e) => e.stopPropagation()}>{rowMenu(a)}</span>, width: 40 },
  ];

  return (
    <>
      <PageHeader
        title="AI agents"
        desc="Voice agents that run outbound sales conversations. Configure voice, scripts, conversation flow and guardrails, then publish versions to campaigns."
        eyebrow={<><Badge tone="green" dot live>{active.filter((a) => a.status === 'Live').length} live</Badge><SimBadge label="Simulated calls" /></>}
        actions={<Button size="sm" variant="primary" icon={<Plus />} disabled={!canEdit} title={canEdit ? undefined : noEdit} onClick={() => setCreateOpen(true)}>Create agent</Button>}
      />

      <div className="grid g-4 keep-2" style={{ marginBottom: 16 }}>
        <KpiCard label="Active agents" icon={<Bot size={13} />} value={active.length} prevLabel={`${active.filter((a) => a.status === 'Live').length} live · ${active.filter((a) => a.status === 'Testing').length} testing · ${active.filter((a) => a.status === 'Paused').length} paused`} />
        <KpiCard label="Total calls handled" icon={<PhoneCall size={13} />} value={fmtInt(totalCalls)} prevLabel="last 90 days · simulated" onClick={() => nav('/history')} />
        <KpiCard label="Avg. qualification rate" icon={<BadgeCheck size={13} />} value={fmtPct(avgRate)} prevLabel="weighted by call volume" />
        <KpiCard label="Avg. sentiment" icon={<Smile size={13} />} value={`${Math.round(wAvg('sentimentScore'))}/100`} prevLabel={<span className="row gap-4"><Timer size={12} />avg {fmtDur(wAvg('avgDuration'))} per connected call</span>} />
      </div>

      <div className="grid g-main-side" style={{ marginBottom: 16 }}>
        <Card title="Qualification rate by agent" sub="Share of connected calls qualified or handed to a human · dashed line = fleet average">
          <div style={{ height: Math.max(200, chart.length * 46 + 30) }}>
            <ResponsiveContainer>
              <BarChart data={chart} layout="vertical" margin={{ left: 0, right: 24, top: 4, bottom: 0 }}>
                <CartesianGrid stroke={CHART.grid} horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} domain={[0, xMax]} ticks={Array.from({ length: xMax / 5 + 1 }, (_, i) => i * 5)} />
                <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={56} />
                <Tooltip content={<ChartTip fmt={(v) => `${v}%`} />} cursor={{ fill: '#F5F5F5' }} />
                <ReferenceLine x={+avgRate.toFixed(1)} stroke={CHART.grey} strokeDasharray="4 3" />
                <Bar dataKey="rate" name="Qualification rate" radius={[0, 3, 3, 0]} barSize={16}>
                  <LabelList dataKey="rate" position="right" formatter={(v: number) => `${v}%`} style={{ fontSize: 11, fill: 'var(--steel)', fontFamily: 'var(--font-mono)' }} />
                  {chart.map((c) => <Cell key={c.name} fill={c.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Fleet health" sub="Agents needing attention">
          <div className="list">
            {active.map((a) => {
              const issue = a.status === 'Paused' ? 'Paused — campaigns on hold' : a.status === 'Testing' ? 'In testing — not yet live' : a.status === 'Draft' ? 'Draft — not published' : a.totalCalls && a.qualificationRate < avgRate * 0.8 ? 'Below-average qualification' : a.escalationRate > 8 ? `High escalation (${fmtPct(a.escalationRate)})` : null;
              return (
                <div key={a.id} className="list-item clickable" onClick={() => nav(`/agents/${a.id}`)}>
                  <Avatar initials={a.initials} color={a.color} agent size="sm" />
                  <div className="grow"><div className="cell-primary">{a.name} <span className="mono muted">{a.version}</span></div><div className="cell-sub truncate">{issue ?? 'Healthy'} · updated {fmtRelative(a.updatedAt)}</div></div>
                  <StatusBadge status={a.status} />
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card flush>
        <div className="table-toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search agents, voices, accents…" />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={['Live', 'Testing', 'Paused', 'Draft']} />
          <label className="row small subtle" style={{ cursor: 'pointer' }}><Switch on={showArchived} onChange={setShowArchived} label="Show archived" />Show archived</label>
          <div style={{ marginLeft: 'auto' }}>
            <Segmented value={view} onChange={setViewP} options={[{ value: 'cards', label: <span className="row gap-4"><LayoutGrid size={13} />Cards</span> }, { value: 'table', label: <span className="row gap-4"><List size={13} />Table</span> }]} />
          </div>
        </div>
        {view === 'table' ? (
          <DataTable rows={filtered} columns={columns} rowKey={(a) => a.id} onRowClick={(a) => nav(`/agents/${a.id}`)} initialSort={{ key: 'calls', dir: 'desc' }}
            empty={<EmptyState icon={<Bot size={18} />} title="No agents match" desc="Try clearing the search or status filter." />} />
        ) : (
          <div style={{ padding: 16 }}>
            {filtered.length === 0 && <EmptyState icon={<Bot size={18} />} title="No agents match" desc="Try clearing the search or status filter." />}
            <div className="grid g-3">
              {filtered.map((a) => (
                <Card key={a.id} onClick={() => nav(`/agents/${a.id}`)} style={a.archived ? { opacity: 0.6 } : undefined}>
                  <div className="row" style={{ alignItems: 'flex-start' }}>
                    <Avatar initials={a.initials} color={a.color} agent size="lg" />
                    <div className="grow">
                      <div className="row between"><span className="cell-primary" style={{ fontSize: 14.5 }}>{a.name}</span><span className="row gap-4">{a.archived ? <Badge tone="outline">Archived</Badge> : <StatusBadge status={a.status} />}{rowMenu(a)}</span></div>
                      <div className="cell-sub truncate">{a.voice}</div>
                      <div className="cell-sub">{a.language} · {a.accent} · <span className="mono">{a.version}</span></div>
                    </div>
                  </div>
                  <div className="small subtle mt-12" style={{ minHeight: 36 }}>{a.personality}</div>
                  <div className="stat-strip mt-12" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
                    {[['Calls', fmtInt(a.totalCalls)], ['Avg dur.', a.totalCalls ? fmtDur(a.avgDuration) : '—'], ['Qual.', a.totalCalls ? fmtPct(a.qualificationRate) : '—'], ['Sentiment', a.totalCalls ? String(a.sentimentScore) : '—']].map(([k, v]) => (
                      <div key={k} style={{ padding: '8px 10px' }}><div className="xs muted">{k}</div><div className="mono strong" style={{ fontSize: 13 }}>{v}</div></div>
                    ))}
                  </div>
                  <div className="mt-12"><div className="label" style={{ marginBottom: 6 }}>Campaigns</div>{campCell(a)}</div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </Card>

      <style>{'@media(max-width:720px){.page-head > .grow{flex-basis:100%}}'}</style>
      {createOpen && <CreateAgentModal onClose={() => setCreateOpen(false)} onCreated={(id) => nav(`/agents/${id}`)} />}
    </>
  );
}

function CreateAgentModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const app = useApp();
  const [name, setName] = useState('');
  const [voice, setVoice] = useState(VOICES[6]);
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [accent, setAccent] = useState(ACCENTS[4]);
  const [template, setTemplate] = useState(app.agents[0]?.id ?? '');
  const [tried, setTried] = useState(false);
  const nameErr = !name.trim() ? 'Name is required' : name.trim().length > 24 ? 'Keep it under 24 characters' : (app.agents as AgentX[]).some((a) => a.name.toLowerCase() === name.trim().toLowerCase()) ? 'An agent with this name already exists' : '';
  const create = () => {
    setTried(true);
    if (nameErr) return;
    const n = name.trim();
    const tpl = app.agents.find((a) => a.id === template) as AgentX | undefined;
    const color = AGENT_COLORS[app.agents.length % AGENT_COLORS.length];
    const base = tpl ?? app.agents[0];
    const rename = (s: string) => tpl ? s.split(tpl.name).join(n) : s;
    const ag = app.addAgent({
      name: n, initials: n.slice(0, 2).toUpperCase(), color, voice, language, accent,
      personality: tpl ? tpl.personality : 'Friendly, clear and helpful',
      status: 'Draft', version: 'v0.1.0', totalCalls: 0, avgDuration: 0, qualificationRate: 0, sentimentScore: 0, escalationRate: 0,
      instructions: tpl ? rename(tpl.instructions) : `You are ${n}, a Vodafone UK sales assistant. Always identify yourself as an AI assistant calling on behalf of Vodafone and state that the call is recorded. Only quote approved prices and terms.`,
      greeting: tpl ? rename(tpl.greeting) : `Hi, is that {first_name}? This is ${n}, an AI assistant calling on behalf of Vodafone. This call is recorded for quality and training.`,
      speakingRate: tpl?.speakingRate ?? 1, temperature: tpl?.temperature ?? 0.4, updatedAt: new Date().toISOString(),
      versions: [{ version: 'v0.1.0-draft', at: new Date().toISOString(), author: app.me.name, note: tpl ? `Created from template ${tpl.name} ${tpl.version}` : 'Created from blank template', status: 'Draft' }],
      objections: tpl ? tpl.objections.map((o) => ({ ...o })) : base.objections.slice(0, 2).map((o) => ({ ...o })),
      escalation: tpl ? tpl.escalation.map((e) => ({ ...e })) : base.escalation.map((e) => ({ ...e })),
      ...(tpl?.builder ? { builder: { ...tpl.builder, tests: [], snapshots: {}, environment: 'Draft' } } : {}),
    } as Omit<Agent, 'id'>);
    app.audit('Created AI agent', `${n} (${ag.id})`, 'Agent');
    app.toast('Agent created', `${n} is a draft — configure and test before publishing.`);
    onClose(); onCreated(ag.id);
  };
  return (
    <Modal open onClose={onClose} title="Create agent" desc="Start from an existing agent's configuration or a blank template. New agents start as drafts."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={create} icon={<Plus />}>Create and configure</Button></>}>
      <div className="col gap-16">
        <Field label="Agent name" required error={tried && nameErr}>
          <input className={`input ${tried && nameErr ? 'invalid' : ''}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grace" autoFocus onKeyDown={(e) => e.key === 'Enter' && create()} />
        </Field>
        <div className="form-grid">
          <Field label="Voice"><select className="select" value={voice} onChange={(e) => setVoice(e.target.value)}>{VOICES.map((v) => <option key={v}>{v}</option>)}</select></Field>
          <Field label="Language"><select className="select" value={language} onChange={(e) => setLanguage(e.target.value)}>{LANGUAGES.map((v) => <option key={v}>{v}</option>)}</select></Field>
          <Field label="Accent"><select className="select" value={accent} onChange={(e) => setAccent(e.target.value)}>{ACCENTS.map((v) => <option key={v}>{v}</option>)}</select></Field>
          <Field label="Template to clone" hint="Copies instructions, objections and escalation rules">
            <select className="select" value={template} onChange={(e) => setTemplate(e.target.value)}>
              <option value="">Blank template</option>
              {app.agents.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.personality.split(',')[0]} ({a.version})</option>)}
            </select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}
