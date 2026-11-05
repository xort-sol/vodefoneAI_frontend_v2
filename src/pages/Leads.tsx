import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Archive, ChevronDown, Cloud, Edit3, ExternalLink, FileUp, Filter, MoreHorizontal, Plus, RotateCcw, ShieldOff, Tag, Trash2, Upload, UserPlus, Megaphone, Download,
} from 'lucide-react';
import { useApp } from '../store/store';
import {
  Badge, Button, Card, DataTable, ExportMenu, FilterSelect, Menu, MenuItem, PageHeader, ScoreBar, SearchInput, StatusBadge, Switch, Tabs, useConfirm, type Column,
} from '../components/ui';
import type { Lead } from '../data/types';
import { fmtDate, fmtInt, fmtRelative, toCSV, downloadFile } from '../lib/format';
import { NOW } from '../data/seed';
import { CUSTOMER_TYPES, LEAD_STATUSES, LeadFormModal, PageFix, RepCell, SOURCES, TAGS, useReps } from './leads/shared';
import { CrmImportModal, CsvImportModal } from './leads/Importers';

type View = 'all' | 'queued' | 'engaged' | 'hotwarm' | 'unreachable' | 'suppressed';
interface Filters { status: string; type: string; product: string; campaign: string; source: string; rep: string; tag: string; scoreMin: string; scoreMax: string; archived: boolean }
const EMPTY: Filters = { status: '', type: '', product: '', campaign: '', source: '', rep: '', tag: '', scoreMin: '', scoreMax: '', archived: false };

export default function Leads() {
  const app = useApp(); const nav = useNavigate(); const confirm = useConfirm(); const reps = useReps();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>('all');
  const [f, setF] = useState<Filters>(() => ({ ...EMPTY, status: params.get('status') ?? '' }));
  const [showFilters, setShowFilters] = useState(!!params.get('status'));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<Lead | null>(null);
  const [adding, setAdding] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [crmOpen, setCrmOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState('');

  useEffect(() => { const s = params.get('status'); if (s !== null) { setF((x) => ({ ...x, status: s })); setView('all'); setShowFilters(true); } }, [params]);
  const setFilter = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    if (k === 'status' && params.get('status')) { params.delete('status'); setParams(params, { replace: true }); }
  };

  const suppressedPhones = useMemo(() => new Set(app.suppressions.map((s) => s.phone)), [app.suppressions]);
  const isSuppressed = (l: Lead) => l.dnc || l.status === 'Do not call' || suppressedPhones.has(l.phone);

  // search + advanced filters (before saved-view)
  const base = useMemo(() => {
    const s = q.trim().toLowerCase(); const digits = s.replace(/\s/g, '');
    const min = f.scoreMin === '' ? 0 : +f.scoreMin; const max = f.scoreMax === '' ? 100 : +f.scoreMax;
    return app.leads.filter((l) => {
      if (l.archived && !f.archived) return false;
      if (s && !(l.name.toLowerCase().includes(s) || l.email.toLowerCase().includes(s) || l.id.toLowerCase().includes(s) || (digits.length > 2 && l.phone.replace(/\s/g, '').includes(digits)))) return false;
      if (f.status && l.status !== f.status) return false;
      if (f.type && l.customerType !== f.type) return false;
      if (f.product && l.productInterest !== f.product) return false;
      if (f.campaign && (f.campaign === 'none' ? l.campaignId : l.campaignId !== f.campaign)) return false;
      if (f.source && l.source !== f.source) return false;
      if (f.rep && (f.rep === 'none' ? l.assignedRepId : l.assignedRepId !== f.rep)) return false;
      if (f.tag && !l.tags.includes(f.tag)) return false;
      if (l.score < min || l.score > max) return false;
      return true;
    });
  }, [app.leads, q, f]);

  const VIEWS: { value: View; label: string; test: (l: Lead) => boolean }[] = [
    { value: 'all', label: 'All', test: () => true },
    { value: 'queued', label: 'Queued', test: (l) => l.status === 'New' || l.status === 'Queued' },
    { value: 'engaged', label: 'Engaged', test: (l) => ['Contacted', 'Callback requested', 'Cold'].includes(l.status) },
    { value: 'hotwarm', label: 'Hot & warm', test: (l) => l.status === 'Hot' || l.status === 'Warm' },
    { value: 'unreachable', label: 'Unreachable', test: (l) => l.status === 'Unreachable' },
    { value: 'suppressed', label: 'Suppressed', test: isSuppressed },
  ];
  const rows = useMemo(() => base.filter(VIEWS.find((v) => v.value === view)!.test), [base, view]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeFilters = (Object.keys(EMPTY) as (keyof Filters)[]).filter((k) => f[k] !== EMPTY[k]).length;

  const canEdit = app.can('leads.edit'); const canDelete = app.can('leads.delete'); const canImport = app.can('leads.import'); const canExport = app.can('leads.export'); const canAssign = app.can('leads.assign');

  /* ----- actions ----- */
  const archive = async (ids: string[], clear?: () => void) => {
    if (!(await confirm({ title: `Archive ${ids.length} lead${ids.length > 1 ? 's' : ''}?`, desc: 'Archived leads are hidden from lists and excluded from all campaigns. You can include them again with the “Include archived” filter.', confirmLabel: 'Archive' }))) return;
    app.archiveLeads(ids); app.audit('Archived leads', `${ids.length} lead(s)`, 'Data'); app.toast(`${ids.length} lead${ids.length > 1 ? 's' : ''} archived`); clear?.();
  };
  const remove = async (ids: string[], clear?: () => void) => {
    if (!canDelete) return;
    if (!(await confirm({ title: `Permanently delete ${ids.length} lead${ids.length > 1 ? 's' : ''}?`, desc: 'This removes the lead record, notes and follow-ups. Call recordings are retained per the retention policy. This cannot be undone.', confirmLabel: 'Delete permanently', danger: true }))) return;
    app.deleteLeads(ids); app.audit('Deleted leads', `${ids.length} lead(s)`, 'Data'); app.toast(`${ids.length} lead${ids.length > 1 ? 's' : ''} deleted`); clear?.(); setSelected(new Set());
  };
  const unarchive = (l: Lead) => { app.updateLead(l.id, { archived: false }); app.toast('Lead restored', l.name); };
  const assignRep = (ids: string[], repId: string | null) => {
    const r = repId ? app.memberById.get(repId) : undefined;
    app.updateLeads(ids, { assignedRepId: repId }); app.audit('Bulk assigned leads', `${ids.length} → ${r?.name ?? 'Unassigned'}`, 'Data');
    app.toast(repId ? `${ids.length} lead${ids.length > 1 ? 's' : ''} assigned to ${r?.name}` : `${ids.length} lead(s) unassigned`);
  };
  const assignCampaign = (ids: string[], campId: string) => {
    const c = app.campaignById.get(campId)!;
    const eligible = ids.filter((id) => { const l = app.leadById.get(id); return l && !isSuppressed(l) && l.consent; });
    eligible.forEach((id) => { const l = app.leadById.get(id)!; app.updateLead(id, { campaignId: campId, productInterest: c.productId, status: ['New', 'Unreachable', 'Contacted'].includes(l.status) ? 'Queued' : l.status }); });
    app.audit('Assigned campaign', `${eligible.length} lead(s) → ${c.name}`, 'Campaign');
    app.toast(`${eligible.length} lead${eligible.length === 1 ? '' : 's'} added to ${c.name}`, ids.length - eligible.length ? `${ids.length - eligible.length} skipped (no consent or suppressed)` : undefined);
  };
  const addTag = (ids: string[], tag: string) => {
    const t = tag.trim(); if (!t) return;
    ids.forEach((id) => { const l = app.leadById.get(id); if (l && !l.tags.includes(t)) app.updateLead(id, { tags: [...l.tags, t] }); });
    app.toast(`Tag “${t}” added`, `${ids.length} lead${ids.length > 1 ? 's' : ''}`); setTagDraft('');
  };
  const retry = (ids: string[]) => {
    const ok: string[] = []; const skipped = new Map<string, number>();
    ids.forEach((id) => {
      const l = app.leadById.get(id); if (!l) return;
      const e = app.eligibility(l);
      if (['Hot', 'Warm'].includes(l.status)) skipped.set('Already qualified — with sales team', (skipped.get('Already qualified — with sales team') ?? 0) + 1);
      else if (e.ok) ok.push(id); else { const key = e.reasons[0].replace(/“.*”/, 'not callable').replace(/\(\d+\)/, '').trim(); skipped.set(key, (skipped.get(key) ?? 0) + 1); }
    });
    if (ok.length) app.updateLeads(ok, { status: 'Queued' });
    const skipText = [...skipped.entries()].map(([r, n]) => `${r} (${n})`).join(' · ');
    app.audit('Re-queued leads for retry', `${ok.length} queued, ${ids.length - ok.length} skipped`, 'Campaign');
    app.toast(ok.length ? `${ok.length} lead${ok.length > 1 ? 's' : ''} re-queued for a simulated retry` : 'No eligible leads to retry', ids.length - ok.length ? `${ids.length - ok.length} skipped — ${skipText}` : 'All selected leads passed compliance checks', ok.length ? 'success' : 'error');
  };
  const suppress = async (ids: string[], clear?: () => void) => {
    if (!(await confirm({ title: `Add ${ids.length} number${ids.length > 1 ? 's' : ''} to suppression?`, desc: 'These customers will be marked do-not-call and blocked from every campaign, including future imports.', confirmLabel: 'Suppress', danger: true }))) return;
    ids.forEach((id) => {
      const l = app.leadById.get(id); if (!l) return;
      if (!suppressedPhones.has(l.phone)) app.addSuppression({ phone: l.phone, name: l.name, reason: 'Customer opt-out', addedAt: new Date().toISOString(), addedBy: app.me.name });
    });
    app.updateLeads(ids, { dnc: true, status: 'Do not call' });
    app.audit('Added suppression', `${ids.length} number(s)`, 'Compliance');
    app.toast(`${ids.length} number${ids.length > 1 ? 's' : ''} suppressed`, 'Marked do-not-call across all campaigns'); clear?.();
  };
  const exportRows = (fmt: 'CSV' | 'Excel' | 'PDF') => {
    if (fmt !== 'CSV') { app.toast(`${fmt} export queued`, `${fmtInt(rows.length)} leads · you’ll be notified when it’s ready`, 'info'); return; }
    const csv = toCSV(rows.map((l) => ({
      lead_id: l.id, name: l.name, email: l.email, phone: l.phone, city: l.city, customer_type: l.customerType, product: app.productById.get(l.productInterest)?.name ?? '',
      source: l.source, campaign: l.campaignId ? app.campaignById.get(l.campaignId)?.name ?? '' : '', status: l.status, score: l.score, last_call: l.lastCallAt ?? '', attempts: l.attempts,
      assigned_rep: l.assignedRepId ? app.memberById.get(l.assignedRepId)?.name ?? '' : '', next_follow_up: l.nextFollowUp ?? '', tags: l.tags.join('; '), consent: l.consent ? 'Y' : 'N', dnc: l.dnc ? 'Y' : 'N',
    })));
    downloadFile(`leads_${new Date().toISOString().slice(0, 10)}.csv`, csv);
    app.audit('Exported leads', `${rows.length} rows (CSV)`, 'Export');
    app.toast('Export downloaded', `${fmtInt(rows.length)} leads · CSV`);
  };

  /* ----- columns ----- */
  const columns: Column<Lead>[] = [
    { key: 'id', header: 'Lead ID', render: (l) => <span className="mono">{l.id}</span>, sort: (l) => l.id },
    { key: 'name', header: 'Customer', render: (l) => <div style={{ maxWidth: 220 }}><div className="cell-primary truncate">{l.name}{l.archived && <Badge tone="outline" className="xs">Archived</Badge>}</div><div className="cell-sub truncate">{l.email}</div></div>, sort: (l) => l.name },
    { key: 'phone', header: 'Phone', render: (l) => <span className="mono">{l.phone}</span> },
    { key: 'type', header: 'Type', render: (l) => <span className="small">{l.customerType}</span>, sort: (l) => l.customerType },
    { key: 'product', header: 'Interested product', render: (l) => <span className="small">{app.productById.get(l.productInterest)?.name}</span>, sort: (l) => app.productById.get(l.productInterest)?.name ?? '' },
    { key: 'source', header: 'Source', render: (l) => <span className="small subtle">{l.source}</span>, sort: (l) => l.source },
    { key: 'campaign', header: 'Campaign', render: (l) => l.campaignId ? <span className="small truncate" style={{ maxWidth: 170, display: 'inline-block' }}>{app.campaignById.get(l.campaignId)?.name}</span> : <span className="muted small">—</span>, sort: (l) => app.campaignById.get(l.campaignId ?? '')?.name ?? '' },
    { key: 'status', header: 'Status', render: (l) => <StatusBadge status={l.status} />, sort: (l) => l.status },
    { key: 'score', header: 'Score', render: (l) => <ScoreBar value={l.score} />, sort: (l) => l.score },
    { key: 'last', header: 'Last call', render: (l) => <span className="small" title={l.lastCallAt ?? ''}>{fmtRelative(l.lastCallAt)}</span>, sort: (l) => (l.lastCallAt ? +new Date(l.lastCallAt) : 0) },
    { key: 'attempts', header: 'Attempts', align: 'right', render: (l) => <span className="mono">{l.attempts}</span>, sort: (l) => l.attempts },
    { key: 'rep', header: 'Assigned rep', render: (l) => <RepCell repId={l.assignedRepId} />, sort: (l) => app.memberById.get(l.assignedRepId ?? '')?.name ?? 'zzz' },
    { key: 'next', header: 'Next follow-up', render: (l) => l.nextFollowUp ? <span className={`small ${new Date(l.nextFollowUp) < NOW && ['Hot', 'Warm', 'Callback requested'].includes(l.status) ? 'red' : ''}`}>{fmtRelative(l.nextFollowUp)}</span> : <span className="muted small">—</span>, sort: (l) => (l.nextFollowUp ? +new Date(l.nextFollowUp) : Number.MAX_SAFE_INTEGER) },
    {
      key: 'actions', header: '', render: (l) => (
        <Menu trigger={(t) => <Button size="xs" variant="ghost" iconOnly icon={<MoreHorizontal />} onClick={t} aria-label={`Actions for ${l.name}`} />}>
          {(close) => (<>
            <MenuItem icon={<ExternalLink />} onClick={() => { close(); nav(`/leads/${l.id}`); }}>Open profile</MenuItem>
            <MenuItem icon={<Edit3 />} disabled={!canEdit} onClick={() => { close(); setEdit(l); }}>Edit lead</MenuItem>
            {l.archived ? <MenuItem icon={<RotateCcw />} disabled={!canEdit} onClick={() => { close(); unarchive(l); }}>Restore from archive</MenuItem>
              : <MenuItem icon={<Archive />} disabled={!canEdit} onClick={() => { close(); archive([l.id]); }}>Archive</MenuItem>}
            <div className="menu-sep" />
            <span title={canDelete ? undefined : 'Only Super Admins can delete leads'} style={{ display: 'block' }}>
              <MenuItem icon={<Trash2 />} danger disabled={!canDelete} onClick={() => { close(); remove([l.id]); }}>Delete…</MenuItem>
            </span>
          </>)}
        </Menu>
      ),
    },
  ];

  const bulkMenu = (label: ReactNode, icon: ReactNode, body: (close: () => void) => ReactNode, disabled?: boolean, title?: string) => (
    <Menu align="left" width={240} trigger={(t) => <button className="btn xs" onClick={t} disabled={disabled} title={title}>{icon}{label}<ChevronDown size={12} /></button>}>{body}</Menu>
  );

  return (
    <>
      <PageFix />
      <PageHeader
        title="Leads & contacts"
        desc="Every customer record available to the AI calling operation — with consent, suppression and assignment status."
        actions={<>
          <Menu trigger={(t) => <Button size="sm" icon={<Upload />} iconRight={<ChevronDown size={13} />} onClick={t} disabled={!canImport} title={canImport ? undefined : 'Your role cannot import leads'}>Import</Button>}>
            {(close) => (<>
              <MenuItem icon={<FileUp />} onClick={() => { close(); setCsvOpen(true); }}>Bulk import CSV / Excel</MenuItem>
              <MenuItem icon={<Cloud />} onClick={() => { close(); setCrmOpen(true); }}>Import from CRM</MenuItem>
            </>)}
          </Menu>
          {canExport ? <ExportMenu onExport={exportRows} /> : <Button size="sm" icon={<Download />} disabled title="Your role cannot export leads">Export</Button>}
          <Button size="sm" variant="primary" icon={<Plus />} onClick={() => setAdding(true)} disabled={!canEdit} title={canEdit ? undefined : 'Your role cannot add leads'}>Add lead</Button>
        </>}
      />

      <Tabs value={view} onChange={(v) => { setView(v); setSelected(new Set()); }} tabs={VIEWS.map((v) => ({ value: v.value, label: v.label, count: base.filter(v.test).length }))} />

      <Card flush>
        <DataTable
          rows={rows} columns={columns} rowKey={(l) => l.id} onRowClick={(l) => nav(`/leads/${l.id}`)}
          selectable selected={selected} onSelectedChange={setSelected} pageSize={12}
          initialSort={{ key: 'last', dir: 'desc' }}
          toolbar={<div className="col" style={{ width: '100%', gap: 12 }}>
            <div className="row-wrap" style={{ width: '100%' }}>
              <SearchInput value={q} onChange={setQ} placeholder="Search name, phone, email or ID…" width={300} />
              <FilterSelect label="Status" value={f.status} onChange={(v) => setFilter('status', v)} options={LEAD_STATUSES} />
              <FilterSelect label="Rep" value={f.rep} onChange={(v) => setFilter('rep', v)} options={[{ value: 'none', label: 'Unassigned' }, ...reps.map((r) => ({ value: r.id, label: r.name }))]} />
              <Button size="sm" variant={showFilters ? 'secondary' : 'ghost'} icon={<Filter />} onClick={() => setShowFilters(!showFilters)}>Filters{activeFilters > 0 && <Badge tone="blue">{activeFilters}</Badge>}</Button>
              {activeFilters > 0 && <Button size="sm" variant="ghost" onClick={() => { setF(EMPTY); if (params.get('status')) { params.delete('status'); setParams(params, { replace: true }); } }}>Clear all</Button>}
              <span className="small muted" style={{ marginLeft: 'auto' }}>{fmtInt(rows.length)} leads</span>
            </div>
            {showFilters && (
              <div className="inset-box" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, alignItems: 'center' }}>
                <FilterSelect label="Type" value={f.type} onChange={(v) => setFilter('type', v)} options={CUSTOMER_TYPES} />
                <FilterSelect label="Product" value={f.product} onChange={(v) => setFilter('product', v)} options={app.products.map((p) => ({ value: p.id, label: p.name }))} />
                <FilterSelect label="Campaign" value={f.campaign} onChange={(v) => setFilter('campaign', v)} options={[{ value: 'none', label: 'No campaign' }, ...app.campaigns.map((c) => ({ value: c.id, label: c.name }))]} />
                <FilterSelect label="Source" value={f.source} onChange={(v) => setFilter('source', v)} options={SOURCES} />
                <FilterSelect label="Tag" value={f.tag} onChange={(v) => setFilter('tag', v)} options={TAGS} />
                <div className="row" style={{ gap: 6 }}>
                  <span className="small muted nowrap">Score</span>
                  <input className="input sm soft" type="number" min={0} max={100} placeholder="0" value={f.scoreMin} onChange={(e) => setFilter('scoreMin', e.target.value)} style={{ width: 64 }} aria-label="Minimum score" />
                  <span className="muted">–</span>
                  <input className="input sm soft" type="number" min={0} max={100} placeholder="100" value={f.scoreMax} onChange={(e) => setFilter('scoreMax', e.target.value)} style={{ width: 64 }} aria-label="Maximum score" />
                </div>
                <label className="row small" style={{ cursor: 'pointer' }}><Switch on={f.archived} onChange={(v) => setFilter('archived', v)} label="Include archived" />Include archived</label>
              </div>
            )}
          </div>}
          bulkActions={(ids, clear) => (<>
            {bulkMenu('Assign rep', <UserPlus size={13} />, (close) => (<>
              <div className="menu-label label">Assign to</div>
              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                {reps.map((r) => <MenuItem key={r.id} onClick={() => { close(); assignRep(ids, r.id); }}>{r.name}<span className="xs muted" style={{ marginLeft: 'auto' }}>{r.team.replace(' Sales', '')}</span></MenuItem>)}
              </div>
              <div className="menu-sep" /><MenuItem onClick={() => { close(); assignRep(ids, null); }}>Unassign</MenuItem>
            </>), !canAssign, canAssign ? undefined : 'Your role cannot assign leads')}
            {bulkMenu('Campaign', <Megaphone size={13} />, (close) => (<>
              <div className="menu-label label">Add to campaign</div>
              {app.campaigns.filter((c) => ['Active', 'Paused', 'Scheduled', 'Draft'].includes(c.status)).map((c) => <MenuItem key={c.id} onClick={() => { close(); assignCampaign(ids, c.id); }}>{c.name}<StatusBadge status={c.status} dot={false} /></MenuItem>)}
            </>), !canEdit)}
            {bulkMenu('Tag', <Tag size={13} />, (close) => (<>
              <div className="menu-label label">Add tag</div>
              {TAGS.map((t) => <MenuItem key={t} onClick={() => { close(); addTag(ids, t); }}>{t}</MenuItem>)}
              <div className="menu-sep" />
              <form className="row" style={{ padding: 6 }} onSubmit={(e) => { e.preventDefault(); close(); addTag(ids, tagDraft); }}>
                <input className="input sm soft" placeholder="Custom tag…" value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} />
                <Button size="xs" type="submit" disabled={!tagDraft.trim()}>Add</Button>
              </form>
            </>), !canEdit)}
            <button className="btn xs" onClick={() => retry(ids)} disabled={!canEdit} title="Re-queue leads that pass consent, suppression and attempt-limit checks"><RotateCcw size={13} />Retry eligible</button>
            <button className="btn xs" onClick={() => suppress(ids, clear)} disabled={!canEdit}><ShieldOff size={13} />Suppress</button>
            <button className="btn xs" onClick={() => archive(ids, clear)} disabled={!canEdit}><Archive size={13} />Archive</button>
            {canDelete && <button className="btn xs" onClick={() => remove(ids, clear)}><Trash2 size={13} />Delete</button>}
          </>)}
        />
      </Card>
      <div className="small muted mt-12">Lead data last synced from Salesforce {fmtDate(NOW)} · {fmtInt(app.leads.filter((l) => !l.archived).length)} active records · {fmtInt(app.suppressions.length)} numbers on suppression list</div>

      <LeadFormModal open={adding} onClose={() => setAdding(false)} onSaved={(l) => nav(`/leads/${l.id}`)} />
      <LeadFormModal open={!!edit} onClose={() => setEdit(null)} lead={edit} />
      <CsvImportModal open={csvOpen} onClose={() => setCsvOpen(false)} />
      <CrmImportModal open={crmOpen} onClose={() => setCrmOpen(false)} />
    </>
  );
}

