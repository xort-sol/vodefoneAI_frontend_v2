import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Copy, Download, LayoutGrid, List, MoreHorizontal, Pause, Pencil, Play, Plus, Square, Megaphone } from 'lucide-react';
import { useApp } from '../store/store';
import {
  Avatar, Badge, Button, Card, DataTable, EmptyState, ExportMenu, FilterSelect, Menu, MenuItem, PageHeader, Progress, SearchInput, Segmented, SimBadge, StatusBadge, Tabs, type Column,
} from '../components/ui';
import { downloadFile, fmtCompact, fmtDate, fmtDateShort, fmtGBP, fmtInt, fmtPct, toCSV } from '../lib/format';
import type { Campaign } from '../data/types';
import { CHART } from '../components/ui';
import { EditCampaignModal, pctOf, spendOf, useCampaignActions, ModulePage } from './campaigns/shared';

const STATUSES = ['Active', 'Scheduled', 'Paused', 'Draft', 'Completed', 'Stopped'] as const;
type Tab = 'all' | (typeof STATUSES)[number];

export default function Campaigns() {
  const app = useApp(); const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('status') as Tab) || 'all';
  const setTab = (t: Tab) => { const n = new URLSearchParams(sp); if (t === 'all') n.delete('status'); else n.set('status', t); setSp(n, { replace: true }); };
  const [q, setQ] = useState('');
  const [product, setProduct] = useState('');
  const [view, setView] = useState<'table' | 'cards'>(() => { try { return (localStorage.getItem('vf-camp-view') as 'table' | 'cards') || 'table'; } catch { return 'table'; } });
  const changeView = (v: 'table' | 'cards') => { setView(v); try { localStorage.setItem('vf-camp-view', v); } catch { /* ignore */ } };
  const [editing, setEditing] = useState<Campaign | null>(null);
  const acts = useCampaignActions();

  const liveBy = useMemo(() => { const m = new Map<string, number>(); app.live.forEach((l) => m.set(l.campaignId, (m.get(l.campaignId) ?? 0) + 1)); return m; }, [app.live]);
  const counts = useMemo(() => { const m: Record<string, number> = {}; app.campaigns.forEach((c) => { m[c.status] = (m[c.status] ?? 0) + 1; }); return m; }, [app.campaigns]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return app.campaigns.filter((c) =>
      (tab === 'all' || c.status === tab) && (!product || c.productId === product) &&
      (!s || c.name.toLowerCase().includes(s) || c.id.toLowerCase().includes(s) || c.segment.toLowerCase().includes(s)));
  }, [app.campaigns, tab, product, q]);

  const live = app.campaigns.filter((c) => c.status !== 'Draft');
  const summary = {
    active: counts.Active ?? 0, scheduled: counts.Scheduled ?? 0,
    leads: live.reduce((s, c) => s + c.totalLeads, 0), qualified: live.reduce((s, c) => s + c.qualified, 0),
    spend: app.campaigns.reduce((s, c) => s + spendOf(c), 0), minutes: app.campaigns.reduce((s, c) => s + c.minutes, 0),
    attempted: live.reduce((s, c) => s + c.attempted, 0),
  };

  const exportList = (fmt: string) => {
    if (fmt !== 'CSV') { app.toast(`${fmt} export queued`, 'You will be notified when the file is ready.', 'info'); return; }
    downloadFile('campaigns.csv', toCSV(rows.map((c) => ({
      id: c.id, name: c.name, status: c.status, product: app.productById.get(c.productId)?.name ?? '', agent: app.agentById.get(c.agentId)?.name ?? '',
      total_leads: c.totalLeads, attempted: c.attempted, connected: c.connected, warm: c.warm, qualified: c.qualified, minutes: c.minutes,
      est_spend_gbp: spendOf(c).toFixed(2), start: c.startDate.slice(0, 10), end: c.endDate.slice(0, 10),
    }))));
    app.audit('Exported campaign list', `${rows.length} campaigns`, 'Export');
    app.toast('Export ready', `${rows.length} campaigns exported as CSV.`);
  };

  const actionMenu = (c: Campaign) => (
    <Menu width={190} trigger={(t) => <Button size="xs" variant="ghost" iconOnly icon={<MoreHorizontal />} onClick={t} aria-label={`Actions for ${c.name}`} />}>
      {(close) => {
        const run = (f: () => void) => () => { close(); f(); };
        const dis = !acts.canManage;
        return (<>
          {c.status === 'Active' && <MenuItem icon={<Pause />} disabled={dis} onClick={run(() => acts.pause(c))}>Pause</MenuItem>}
          {c.status === 'Paused' && <MenuItem icon={<Play />} disabled={dis} onClick={run(() => acts.resume(c))}>Resume</MenuItem>}
          {['Scheduled', 'Draft'].includes(c.status) && <MenuItem icon={<Play />} disabled={dis} onClick={run(() => acts.resume(c))}>Launch now</MenuItem>}
          {!['Completed', 'Stopped'].includes(c.status) && <MenuItem icon={<Pencil />} disabled={dis} onClick={run(() => setEditing(c))}>Edit settings</MenuItem>}
          <MenuItem icon={<Copy />} disabled={dis} onClick={run(() => acts.duplicate(c))}>Duplicate</MenuItem>
          <MenuItem icon={<Download />} onClick={run(() => acts.exportCalls(c))}>Export calls (CSV)</MenuItem>
          {['Active', 'Paused', 'Scheduled'].includes(c.status) && <><div className="menu-sep" /><MenuItem icon={<Square />} danger disabled={dis} onClick={run(() => acts.stop(c))}>Stop campaign</MenuItem></>}
          {dis && <div className="menu-label xs muted">{acts.denied}</div>}
        </>);
      }}
    </Menu>
  );

  const columns: Column<Campaign>[] = [
    { key: 'name', header: 'Campaign', sort: (c) => c.name, render: (c) => (
      <div style={{ minWidth: 170, maxWidth: 220, whiteSpace: 'normal' }}>
        <div className="row gap-4"><span className="cell-primary">{c.name}</span>{(liveBy.get(c.id) ?? 0) > 0 && <span className="live-dot" title={`${liveBy.get(c.id)} live simulated calls`} style={{ width: 6, height: 6, marginLeft: 4 }} />}</div>
        <div className="mono muted">{c.id}</div>
      </div>
    ) },
    { key: 'product', header: 'Product', sort: (c) => app.productById.get(c.productId)?.name ?? '', render: (c) => <span className="small" style={{ whiteSpace: 'normal', display: 'inline-block', maxWidth: 110 }}>{app.productById.get(c.productId)?.name}</span> },
    { key: 'total', header: 'Leads', align: 'right', sort: (c) => c.totalLeads, render: (c) => fmtInt(c.totalLeads) },
    { key: 'attempted', header: 'Attempted', sort: (c) => pctOf(c.attempted, c.totalLeads), render: (c) => (
      <div title={`${fmtPct(pctOf(c.attempted, c.totalLeads), 0)} of leads attempted`} style={{ minWidth: 72 }}><div className="row between"><span className="mono small tnum">{fmtInt(c.attempted)}</span><span className="xs muted">{fmtPct(pctOf(c.attempted, c.totalLeads), 0)}</span></div><div className="mt-4"><Progress value={pctOf(c.attempted, c.totalLeads)} /></div></div>
    ) },
    { key: 'connected', header: 'Conn.', align: 'right', sort: (c) => c.connected, render: (c) => fmtInt(c.connected) },
    { key: 'warm', header: 'Warm', align: 'right', sort: (c) => c.warm, render: (c) => fmtInt(c.warm) },
    { key: 'qualified', header: 'Qual.', align: 'right', sort: (c) => c.qualified, render: (c) => <span className="strong">{fmtInt(c.qualified)}</span> },
    { key: 'minutes', header: 'Min.', align: 'right', sort: (c) => c.minutes, render: (c) => <span className="mono">{fmtInt(c.minutes)}</span> },
    { key: 'spend', header: 'Spend', align: 'right', sort: (c) => spendOf(c), render: (c) => <span className="mono" title={`${fmtInt(c.minutes)} min × ${fmtGBP(c.costPerMinute, 3)}/min`}>{fmtGBP(spendOf(c), 2)}</span> },
    { key: 'status', header: 'Status', sort: (c) => c.status, render: (c) => <StatusBadge status={c.status} /> },
    { key: 'dates', header: 'Dates', sort: (c) => c.startDate, render: (c) => <div className="mono xs" style={{ lineHeight: 1.5 }}><div>{fmtDateShort(c.startDate)}</div><div className="muted">→ {fmtDateShort(c.endDate)}</div></div> },
    { key: 'act', header: '', width: 44, render: (c) => <div onClick={(e) => e.stopPropagation()}>{actionMenu(c)}</div> },
  ];

  const tabs = [{ value: 'all' as Tab, label: 'All', count: app.campaigns.length }, ...STATUSES.map((s) => ({ value: s as Tab, label: s, count: counts[s] ?? 0 }))];

  return (
    <ModulePage>
      <PageHeader
        title="Campaigns"
        desc="Plan, launch and monitor outbound AI calling campaigns — lead targeting, agent, offer, schedule and spend."
        eyebrow={<><Badge tone="green" dot live>{app.live.length} live calls</Badge><SimBadge /></>}
        actions={<>
          <ExportMenu onExport={exportList} />
          <Button size="sm" variant="primary" icon={<Plus />} disabled={!acts.canManage} title={acts.canManage ? undefined : acts.denied} onClick={() => nav('/campaigns/new')}>New campaign</Button>
        </>}
      />

      <div className="stat-strip" style={{ gridTemplateColumns: 'repeat(5, minmax(0,1fr))', marginBottom: 20 }}>
        <Stat label="Active campaigns" value={fmtInt(summary.active)} foot={`${app.live.length} simulated calls in progress`} onClick={() => setTab('Active')} />
        <Stat label="Scheduled" value={fmtInt(summary.scheduled)} foot={`${counts.Draft ?? 0} drafts awaiting launch`} onClick={() => setTab('Scheduled')} />
        <Stat label="Leads in campaigns" value={fmtCompact(summary.leads)} foot={`${fmtPct(pctOf(summary.attempted, summary.leads), 0)} attempted`} />
        <Stat label="Qualified leads" value={fmtInt(summary.qualified)} foot={<span className="green">{fmtPct(pctOf(summary.qualified, summary.attempted))} of attempted</span>} onClick={() => nav('/qualified')} />
        <Stat label="Calling spend" value={fmtGBP(summary.spend)} foot={`${fmtCompact(summary.minutes)} minutes · est.`} onClick={() => nav('/analytics?tab=cost')} />
      </div>

      <Tabs value={tab} onChange={setTab} tabs={tabs} />

      <Card flush>
        <div className="table-toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search name, ID or segment…" />
          <FilterSelect label="Product" value={product} onChange={setProduct} options={app.products.map((p) => ({ value: p.id, label: p.name }))} />
          <span className="small muted" style={{ marginLeft: 'auto' }}>{rows.length} of {app.campaigns.length}</span>
          <Segmented value={view} onChange={changeView} options={[{ value: 'table', label: <span className="row gap-4"><List size={13} />Table</span> }, { value: 'cards', label: <span className="row gap-4"><LayoutGrid size={13} />Cards</span> }]} />
        </div>
        {view === 'table' ? (
          <DataTable rows={rows} columns={columns} rowKey={(c) => c.id} onRowClick={(c) => nav(`/campaigns/${c.id}`)} initialSort={{ key: 'dates', dir: 'desc' }} pageSize={10} dense
            empty={<EmptyState icon={<Megaphone size={18} />} title="No campaigns match" desc="Try another status tab, product or search term." action={acts.canManage ? <Button size="sm" icon={<Plus />} onClick={() => nav('/campaigns/new')}>New campaign</Button> : undefined} />} />
        ) : (
          <div style={{ padding: 16 }}>
            {!rows.length && <EmptyState icon={<Megaphone size={18} />} title="No campaigns match" desc="Try another status tab, product or search term." />}
            <div className="grid g-3">
              {rows.map((c) => {
                const agent = app.agentById.get(c.agentId); const lv = liveBy.get(c.id) ?? 0;
                return (
                  <Card key={c.id} onClick={() => nav(`/campaigns/${c.id}`)}>
                    <div className="row between" style={{ alignItems: 'flex-start' }}>
                      <div className="grow"><div className="cell-primary truncate">{c.name}</div><div className="mono muted">{c.id} · {app.productById.get(c.productId)?.name}</div></div>
                      {actionMenu(c)}
                    </div>
                    <div className="row mt-12"><StatusBadge status={c.status} />{lv > 0 && <Badge tone="green" dot live>{lv} live</Badge>}<span className="xs muted" style={{ marginLeft: 'auto' }}>{fmtDate(c.startDate)} – {fmtDateShort(c.endDate)}</span></div>
                    <div className="mt-16">
                      <div className="row between small"><span className="muted">Attempted</span><span className="mono tnum">{fmtInt(c.attempted)} / {fmtInt(c.totalLeads)}</span></div>
                      <div className="mt-4"><Progress value={pctOf(c.attempted, c.totalLeads)} /></div>
                    </div>
                    <div className="grid g-4 keep-2 mt-16" style={{ gap: 8 }}>
                      <Mini label="Connected" v={fmtInt(c.connected)} />
                      <Mini label="Warm" v={fmtInt(c.warm)} />
                      <Mini label="Qualified" v={fmtInt(c.qualified)} color={CHART.green} />
                      <Mini label="Spend" v={fmtGBP(spendOf(c))} />
                    </div>
                    <div className="divider" style={{ margin: '14px 0 10px' }} />
                    <div className="row small"><Avatar initials={agent?.initials} color={agent?.color} size="sm" agent /><span className="subtle truncate grow">{agent?.name} · {c.segment}</span><span className="mono xs muted">{fmtInt(c.minutes)} min</span></div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      <EditCampaignModal campaign={editing} open={!!editing} onClose={() => setEditing(null)} />
    </ModulePage>
  );
}

function Stat({ label, value, foot, onClick }: { label: string; value: ReactNode; foot?: ReactNode; onClick?: () => void }) {
  return (
    <div className={onClick ? 'card-link' : ''} onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value mt-4">{value}</div>
      <div className="kpi-foot mt-4 truncate">{foot}</div>
    </div>
  );
}
function Mini({ label, v, color }: { label: string; v: string; color?: string }) {
  return <div><div className="xs muted">{label}</div><div className="mono strong tnum" style={{ fontSize: 13, color }}>{v}</div></div>;
}
