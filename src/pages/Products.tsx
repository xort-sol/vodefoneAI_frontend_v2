import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Archive, BadgeCheck, CalendarClock, CheckCircle2, Clock, Copy, LayoutGrid, Link2, List, MoreHorizontal, Package, Pencil, Plus, ShieldCheck, Tag, TimerOff,
} from 'lucide-react';
import { useApp } from '../store/store';
import {
  Badge, Button, Card, DataTable, EmptyState, ExportMenu, FilterSelect, Menu, MenuItem, PageHeader, SearchInput, Segmented, StatusBadge, Tabs, useConfirm, type Column,
} from '../components/ui';
import { fmtDate, fmtGBP, fmtRelative, toCSV, downloadFile } from '../lib/format';
import { NOW, DAY } from '../data/seed';
import type { Offer, Product } from '../data/types';
import { CATEGORIES, OfferModal, ProductDrawer, blankProduct, deriveStatus } from './products/forms';

type TabKey = 'products' | 'offers' | 'approval';
const stale = (iso: string) => NOW.getTime() - new Date(iso).getTime() > 30 * DAY;
const contract = (m: number) => (m === 1 ? '30-day rolling' : `${m} months`);

export default function Products() {
  const app = useApp(); const nav = useNavigate(); const confirm = useConfirm();
  const [sp, setSp] = useSearchParams();
  const canManage = app.can('products.manage');
  const noPerm = 'Requires the products.manage permission';
  const tab = (['products', 'offers', 'approval'].includes(sp.get('tab') ?? '') ? sp.get('tab') : 'products') as TabKey;
  const setParam = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };

  // product drawer driven by ?product=<id> (or "new")
  const drawerId = sp.get('product');
  const drawerProduct = drawerId === 'new' ? blankProduct() : drawerId ? app.productById.get(drawerId) : undefined;
  const [offerEdit, setOfferEdit] = useState<{ offer: Offer; focus?: boolean } | null>(null);

  const [cat, setCat] = useState<string>('');
  const [q, setQ] = useState('');
  const [avail, setAvail] = useState('');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [offerStatus, setOfferStatus] = useState('');

  const offersFor = (pid: string) => app.offers.filter((o) => o.productIds.includes(pid));

  /* ---------- risk analysis: which campaigns / agents are affected ---------- */
  const risk = useMemo(() => {
    const badProducts = app.products.filter((p) => !p.approved || p.availability === 'Retired');
    const badOffers = app.offers.filter((o) => o.status === 'Expired' || o.status === 'Draft');
    const live = app.campaigns.filter((c) => ['Active', 'Scheduled', 'Paused'].includes(c.status));
    const camps = live.filter((c) => badProducts.some((p) => p.id === c.productId) || (c.offerId && badOffers.some((o) => o.id === c.offerId)));
    const agents = [...new Set(camps.map((c) => c.agentId))].map((id) => app.agentById.get(id)).filter(Boolean);
    return { badProducts, badOffers, camps, agents };
  }, [app.products, app.offers, app.campaigns, app.agentById]);

  const queue = useMemo(() => {
    const items: { key: string; kind: 'Product' | 'Offer'; title: string; reason: string; id: string; at: string }[] = [];
    app.products.filter((p) => p.availability !== 'Retired').forEach((p) => {
      if (!p.approved) items.push({ key: `pa-${p.id}`, kind: 'Product', id: p.id, title: p.name, reason: 'New or changed pricing awaiting approval', at: p.lastReviewed });
      else if (stale(p.lastReviewed)) items.push({ key: `ps-${p.id}`, kind: 'Product', id: p.id, title: p.name, reason: `Last reviewed ${fmtRelative(p.lastReviewed)} — over 30 days`, at: p.lastReviewed });
    });
    app.offers.forEach((o) => {
      if (o.status === 'Draft') items.push({ key: `od-${o.id}`, kind: 'Offer', id: o.id, title: o.name, reason: 'Draft promotion awaiting approval', at: o.startDate });
      const unapproved = o.productIds.filter((id) => !app.productById.get(id)?.approved);
      if (o.status === 'Active' && unapproved.length) items.push({ key: `ou-${o.id}`, kind: 'Offer', id: o.id, title: o.name, reason: `Active offer linked to unapproved product (${unapproved.map((i) => app.productById.get(i)?.name).join(', ')})`, at: o.startDate });
    });
    return items;
  }, [app.products, app.offers, app.productById]);

  /* ---------- actions ---------- */
  const saveProduct = (p: Product, linkOffers: string[]) => {
    const isNew = !p.id;
    const prev = isNew ? undefined : app.productById.get(p.id);
    const termsChanged = prev && (prev.monthlyPrice !== p.monthlyPrice || prev.contractMonths !== p.contractMonths || prev.upfront !== p.upfront || prev.eligibility !== p.eligibility);
    const id = isNew ? `p-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 18)}-${Math.floor(Math.random() * 900 + 100)}` : p.id;
    const next: Product = { ...p, id, approved: isNew || termsChanged ? false : p.approved, lastReviewed: new Date().toISOString() };
    app.upsertProduct(next);
    app.offers.forEach((o) => {
      const has = o.productIds.includes(id); const want = linkOffers.includes(o.id);
      if (has !== want) app.upsertOffer({ ...o, productIds: want ? [...o.productIds, id] : o.productIds.filter((x) => x !== id) });
    });
    app.audit(isNew ? 'Created product' : 'Updated product', `${next.name} (${id})`, 'Data');
    app.toast(isNew ? 'Product created' : 'Product saved', next.approved ? undefined : 'Pending approval — AI agents will not pitch it until approved.');
    setParam('product', null);
  };
  const approve = (p: Product) => {
    app.upsertProduct({ ...p, approved: true, lastReviewed: new Date().toISOString() });
    app.audit('Approved product pricing and terms', p.name, 'Compliance');
    app.toast(`${p.name} approved`, 'AI agents can now pitch this product.');
  };
  const retire = async (p: Product) => {
    const camps = app.campaigns.filter((c) => c.productId === p.id && ['Active', 'Scheduled'].includes(c.status));
    const ok = await confirm({ title: `Retire ${p.name}?`, danger: true, confirmLabel: 'Retire product', desc: <>Retired products are removed from AI knowledge bases and can no longer be pitched.{camps.length ? <> <b>{camps.length} active campaign{camps.length > 1 ? 's' : ''}</b> ({camps.map((c) => c.name).join(', ')}) use it.</> : ''}</> });
    if (!ok) return;
    app.upsertProduct({ ...p, availability: 'Retired' });
    app.audit('Retired product', p.name, 'Data');
    app.toast(`${p.name} retired`);
  };
  const duplicate = (p: Product) => {
    const id = `${p.id}-copy-${Math.floor(Math.random() * 900 + 100)}`;
    app.upsertProduct({ ...p, id, name: `${p.name} (copy)`, approved: false, lastReviewed: new Date().toISOString() });
    app.toast('Product duplicated', 'The copy is pending approval.');
    setParam('product', id);
  };
  const saveOffer = (o: Offer) => {
    const isNew = !o.id;
    const next = { ...o, id: isNew ? `o-${Date.now() % 100000}` : o.id };
    app.upsertOffer(next);
    app.audit(isNew ? 'Created offer' : 'Updated offer', `${next.name} (${next.code})`, 'Data');
    app.toast(isNew ? 'Offer created' : 'Offer saved', `Status: ${next.status}`);
    setOfferEdit(null);
  };
  const expireOffer = async (o: Offer) => {
    const camps = app.campaigns.filter((c) => c.offerId === o.id && ['Active', 'Scheduled'].includes(c.status));
    const ok = await confirm({ title: `Expire “${o.name}”?`, danger: true, confirmLabel: 'Expire now', desc: <>The offer ends immediately and AI agents stop mentioning it.{camps.length ? <> Affects <b>{camps.map((c) => c.name).join(', ')}</b>.</> : ''}</> });
    if (!ok) return;
    app.upsertOffer({ ...o, status: 'Expired', endDate: new Date().toISOString() });
    app.audit('Expired offer', `${o.name} (${o.code})`, 'Data');
    app.toast('Offer expired', o.name);
  };
  const approveOffer = (o: Offer) => {
    const status = deriveStatus(o);
    app.upsertOffer({ ...o, status });
    app.audit('Approved offer', o.name, 'Compliance');
    app.toast(`${o.name} approved`, `Status: ${status}`);
  };

  const exportProducts = (fmt: string) => {
    if (fmt !== 'CSV') { app.toast(`${fmt} export queued`, 'You will be notified when the file is ready.', 'info'); return; }
    downloadFile('products.csv', toCSV(app.products.map((p) => ({ id: p.id, name: p.name, category: p.category, monthly_price: p.monthlyPrice, upfront: p.upfront, contract_months: p.contractMonths, data: p.data, speed: p.speed ?? '', availability: p.availability, approved: p.approved, last_reviewed: p.lastReviewed }))));
    app.toast('Products exported', `${app.products.length} rows · CSV`);
  };

  /* ---------- views ---------- */
  const filtered = app.products.filter((p) => (!cat || p.category === cat) && (!avail || (avail === 'Pending approval' ? !p.approved : avail === 'Approved' ? p.approved : p.availability === avail))
    && (!q || `${p.name} ${p.description} ${p.category} ${p.benefits.join(' ')}`.toLowerCase().includes(q.toLowerCase())));
  const approvalBadge = (p: Product) => p.approved ? (stale(p.lastReviewed) ? <Badge tone="orange"><Clock size={11} />Review due</Badge> : <Badge tone="green" dot>Approved</Badge>) : <Badge tone="amber" dot>Pending approval</Badge>;

  const productMenu = (p: Product) => (
    <Menu width={200} trigger={(t) => <Button size="xs" variant="ghost" iconOnly icon={<MoreHorizontal />} onClick={t} aria-label={`Actions for ${p.name}`} />}>
      {(close) => (<>
        <MenuItem icon={<Pencil />} onClick={() => { close(); setParam('product', p.id); }}>{canManage ? 'Edit' : 'View details'}</MenuItem>
        <MenuItem icon={<BadgeCheck />} disabled={!canManage || (p.approved && !stale(p.lastReviewed)) || p.availability === 'Retired'} onClick={() => { close(); approve(p); }}>{p.approved ? 'Mark reviewed' : 'Approve'}</MenuItem>
        <MenuItem icon={<Copy />} disabled={!canManage} onClick={() => { close(); duplicate(p); }}>Duplicate</MenuItem>
        <div className="menu-sep" />
        <MenuItem icon={<Archive />} danger disabled={!canManage || p.availability === 'Retired'} onClick={() => { close(); retire(p); }}>Retire</MenuItem>
        {!canManage && <div className="menu-label xs muted">{noPerm}</div>}
      </>)}
    </Menu>
  );

  const pColumns: Column<Product>[] = [
    { key: 'name', header: 'Product', sort: (p) => p.name, render: (p) => <div style={{ minWidth: 180 }}><div className="cell-primary">{p.name}</div><div className="cell-sub mono">{p.id}</div></div> },
    { key: 'cat', header: 'Category', sort: (p) => p.category, render: (p) => <Badge tone="outline">{p.category}</Badge> },
    { key: 'price', header: 'Monthly', align: 'right', sort: (p) => p.monthlyPrice, render: (p) => <span className="mono strong">{fmtGBP(p.monthlyPrice, p.monthlyPrice % 1 ? 2 : 0)}</span> },
    { key: 'contract', header: 'Contract', sort: (p) => p.contractMonths, render: (p) => <span className="small">{contract(p.contractMonths)}</span> },
    { key: 'data', header: 'Data / speed', render: (p) => <span className="small">{p.data}{p.speed ? ` · ${p.speed}` : ''}</span> },
    { key: 'promos', header: 'Promotions', sort: (p) => offersFor(p.id).length, render: (p) => { const os = offersFor(p.id).filter((o) => o.status !== 'Expired'); return os.length ? <span className="small">{os.length} linked</span> : <span className="small muted">—</span>; } },
    { key: 'avail', header: 'Availability', sort: (p) => p.availability, render: (p) => <StatusBadge status={p.availability} /> },
    { key: 'appr', header: 'Approval', sort: (p) => (p.approved ? 1 : 0), render: approvalBadge },
    { key: 'rev', header: 'Reviewed', sort: (p) => p.lastReviewed, render: (p) => <span className="mono small">{fmtDate(p.lastReviewed)}</span> },
    { key: 'menu', header: '', render: (p) => <span onClick={(e) => e.stopPropagation()}>{productMenu(p)}</span> },
  ];

  const offerRows = app.offers.filter((o) => !offerStatus || o.status === offerStatus);
  const oColumns: Column<Offer>[] = [
    { key: 'name', header: 'Offer', sort: (o) => o.name, render: (o) => <div style={{ minWidth: 200, whiteSpace: 'normal' }}><div className="cell-primary">{o.name}</div><div className="cell-sub">{o.discount}</div></div> },
    { key: 'status', header: 'Status', sort: (o) => o.status, render: (o) => <StatusBadge status={o.status} /> },
    { key: 'start', header: 'Starts', sort: (o) => o.startDate, render: (o) => <span className="mono small">{fmtDate(o.startDate)}</span> },
    { key: 'end', header: 'Ends', sort: (o) => o.endDate, render: (o) => <span className="mono small">{fmtDate(o.endDate)}</span> },
    { key: 'products', header: 'Products', render: (o) => <div className="row-wrap gap-4" style={{ maxWidth: 280 }}>{o.productIds.slice(0, 2).map((id) => <button key={id} className="tag" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setParam('product', id); }}>{app.productById.get(id)?.name ?? id}</button>)}{o.productIds.length > 2 && <span className="xs muted">+{o.productIds.length - 2}</span>}</div> },
    { key: 'code', header: 'Code', sort: (o) => o.code, render: (o) => <span className="mono">{o.code}</span> },
    { key: 'camps', header: 'Campaigns', render: (o) => { const n = app.campaigns.filter((c) => c.offerId === o.id).length; return <span className="small">{n || '—'}</span>; } },
    { key: 'menu', header: '', render: (o) => (
      <span onClick={(e) => e.stopPropagation()}>
        <Menu width={200} trigger={(t) => <Button size="xs" variant="ghost" iconOnly icon={<MoreHorizontal />} onClick={t} aria-label={`Actions for ${o.name}`} />}>
          {(close) => (<>
            <MenuItem icon={<Pencil />} disabled={!canManage} onClick={() => { close(); setOfferEdit({ offer: o }); }}>Edit</MenuItem>
            <MenuItem icon={<Link2 />} disabled={!canManage} onClick={() => { close(); setOfferEdit({ offer: o, focus: true }); }}>Assign to products</MenuItem>
            {o.status === 'Draft' && <MenuItem icon={<BadgeCheck />} disabled={!canManage} onClick={() => { close(); approveOffer(o); }}>Approve</MenuItem>}
            <div className="menu-sep" />
            <MenuItem icon={<TimerOff />} danger disabled={!canManage || o.status === 'Expired'} onClick={() => { close(); expireOffer(o); }}>Expire offer</MenuItem>
            {!canManage && <div className="menu-label xs muted">{noPerm}</div>}
          </>)}
        </Menu>
      </span>
    ) },
  ];

  const newOffer = (): Offer => ({ id: '', name: '', productIds: [], discount: '', description: '', startDate: NOW.toISOString(), endDate: new Date(NOW.getTime() + 30 * DAY).toISOString(), status: 'Draft', code: '' });

  return (
    <>
      <PageHeader
        title="Products & offers"
        desc="The approved catalogue AI agents pitch from. Prices, terms and promotions must be approved before agents can use them."
        actions={<>
          <ExportMenu onExport={exportProducts} />
          {tab === 'offers'
            ? <Button size="sm" variant="primary" icon={<Plus />} disabled={!canManage} title={canManage ? undefined : noPerm} onClick={() => setOfferEdit({ offer: newOffer() })}>New offer</Button>
            : <Button size="sm" variant="primary" icon={<Plus />} disabled={!canManage} title={canManage ? undefined : noPerm} onClick={() => setParam('product', 'new')}>New product</Button>}
        </>}
      />

      <div className={`banner ${risk.camps.length ? 'warn' : risk.badProducts.length || risk.badOffers.length ? 'info' : 'ok'}`} style={{ marginBottom: 16 }}>
        {risk.camps.length ? <AlertTriangle /> : <ShieldCheck />}
        <div className="grow">
          <b>All AI pitches must use approved product prices and terms.</b>{' '}
          {risk.camps.length ? (<>
            {risk.badProducts.length} product{risk.badProducts.length === 1 ? ' is' : 's are'} unapproved or retired and {risk.badOffers.length} offer{risk.badOffers.length === 1 ? ' is' : 's are'} expired or in draft. Affected campaigns:{' '}
            {risk.camps.map((c, i) => <span key={c.id}><button className="btn link" onClick={() => nav(`/campaigns/${c.id}`)}>{c.name}</button>{i < risk.camps.length - 1 ? ', ' : ''}</span>)}
            {risk.agents.length > 0 && <> · Agents: {risk.agents.map((a, i) => <span key={a!.id}><button className="btn link" onClick={() => nav(`/agents/${a!.id}?section=knowledge`)}>{a!.name}</button>{i < risk.agents.length - 1 ? ', ' : ''}</span>)}</>}
          </>) : (risk.badProducts.length || risk.badOffers.length)
            ? <>{[risk.badProducts.length && `${risk.badProducts.length} unapproved or retired product${risk.badProducts.length > 1 ? 's' : ''} (${risk.badProducts.map((p) => p.name).join(', ')})`, risk.badOffers.length && `${risk.badOffers.length} expired or draft offer${risk.badOffers.length > 1 ? 's' : ''}`].filter(Boolean).join(' and ')} — not used by any active, scheduled or paused campaign, so no AI agent is affected.</>
            : 'Every product and offer referenced by campaigns is approved and current.'}
        </div>
      </div>

      <div className="stat-strip" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))', marginBottom: 16 }}>
        <div><div className="kpi-label"><Package size={13} />Products</div><div className="kpi-value mt-4">{app.products.filter((p) => p.availability !== 'Retired').length}</div><div className="kpi-foot mt-4">{app.products.filter((p) => p.availability === 'Retired').length} retired</div></div>
        <div><div className="kpi-label"><BadgeCheck size={13} />Approved</div><div className="kpi-value mt-4">{app.products.filter((p) => p.approved && p.availability !== 'Retired').length}</div><div className="kpi-foot mt-4">{app.products.filter((p) => !p.approved).length} pending approval</div></div>
        <div><div className="kpi-label"><Tag size={13} />Active offers</div><div className="kpi-value mt-4">{app.offers.filter((o) => o.status === 'Active').length}</div><div className="kpi-foot mt-4">{app.offers.filter((o) => o.status === 'Scheduled').length} scheduled</div></div>
        <div className="card-link" onClick={() => setParam('tab', 'approval')}><div className="kpi-label"><CalendarClock size={13} />Approval queue</div><div className="kpi-value mt-4">{queue.length}</div><div className="kpi-foot mt-4">{queue.filter((x) => x.reason.includes('30 days')).length} overdue reviews</div></div>
      </div>

      <Tabs value={tab} onChange={(v) => setParam('tab', v === 'products' ? null : v)} tabs={[
        { value: 'products', label: 'Products', count: app.products.length },
        { value: 'offers', label: 'Offers & promotions', count: app.offers.length },
        { value: 'approval', label: 'Approval queue', count: queue.length },
      ]} />

      {tab === 'products' && (<>
        <div className="row-wrap" style={{ marginBottom: 12 }}>
          {['', ...CATEGORIES].map((c) => {
            const n = c ? app.products.filter((p) => p.category === c).length : app.products.length;
            const on = cat === c;
            return <button key={c || 'all'} className="tag" onClick={() => setCat(c)} aria-pressed={on} style={{ cursor: 'pointer', height: 28, padding: '0 12px', borderColor: on ? 'var(--ink)' : undefined, background: on ? 'var(--ink)' : undefined, color: on ? '#fff' : undefined }}>{c || 'All'} <span className="mono" style={{ opacity: 0.6 }}>{n}</span></button>;
          })}
        </div>
        <Card flush>
          <div className="table-toolbar">
            <SearchInput value={q} onChange={setQ} placeholder="Search products, benefits…" />
            <FilterSelect label="Status" value={avail} onChange={setAvail} options={['Available', 'Limited', 'Retired', 'Approved', 'Pending approval']} />
            <span className="small muted">{filtered.length} of {app.products.length}</span>
            <div style={{ marginLeft: 'auto' }}><Segmented value={view} onChange={setView} options={[{ value: 'cards', label: <span className="row gap-4"><LayoutGrid size={13} />Cards</span> }, { value: 'table', label: <span className="row gap-4"><List size={13} />Table</span> }]} /></div>
          </div>
          {view === 'table' ? (
            <DataTable rows={filtered} columns={pColumns} rowKey={(p) => p.id} onRowClick={(p) => setParam('product', p.id)} initialSort={{ key: 'cat', dir: 'asc' }}
              empty={<EmptyState icon={<Package size={18} />} title="No products match" desc="Try a different category or search." />} />
          ) : (
            <div style={{ padding: 16 }}>
              {!filtered.length && <EmptyState icon={<Package size={18} />} title="No products match" desc="Try a different category or search." />}
              <div className="grid g-3">
                {filtered.map((p) => {
                  const promos = offersFor(p.id).filter((o) => o.status !== 'Expired');
                  return (
                    <Card key={p.id} onClick={() => setParam('product', p.id)} style={p.availability === 'Retired' ? { opacity: 0.6 } : undefined}>
                      <div className="row between" style={{ alignItems: 'flex-start' }}>
                        <div style={{ minWidth: 0 }}><div className="xs muted">{p.category}</div><div className="cell-primary" style={{ fontSize: 14.5 }}>{p.name}</div></div>
                        <span className="row gap-4">{approvalBadge(p)}{productMenu(p)}</span>
                      </div>
                      <div className="row mt-8" style={{ alignItems: 'baseline', gap: 4 }}><span className="strong" style={{ fontSize: 22, letterSpacing: '-0.02em' }}>{fmtGBP(p.monthlyPrice, p.monthlyPrice % 1 ? 2 : 0)}</span><span className="small muted">/month · {contract(p.contractMonths)}{p.upfront ? ` · £${p.upfront} upfront` : ''}</span></div>
                      <div className="small subtle mt-8" style={{ minHeight: 40 }}>{p.description}</div>
                      <div className="row-wrap mt-8"><span className="tag">{p.data} data</span>{p.speed && <span className="tag">{p.speed}</span>}<StatusBadge status={p.availability} /></div>
                      <ul className="small subtle" style={{ margin: '10px 0 0', paddingLeft: 16 }}>{p.benefits.slice(0, 3).map((b) => <li key={b}>{b}</li>)}{p.benefits.length > 3 && <li className="muted">+{p.benefits.length - 3} more</li>}</ul>
                      <div className="divider" style={{ margin: '12px 0' }} />
                      <div className="xs muted" title={p.eligibility}><b className="subtle">Eligibility:</b> {p.eligibility}</div>
                      <div className="row-wrap mt-8">{promos.length ? promos.map((o) => <Badge key={o.id} tone={o.status === 'Active' ? 'blue' : 'neutral'}><Tag size={10} />{o.name}</Badge>) : <span className="xs muted">No linked promotions</span>}</div>
                      <div className="xs muted mt-8 mono">Reviewed {fmtDate(p.lastReviewed)}</div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </>)}

      {tab === 'offers' && (
        <Card flush>
          <DataTable rows={offerRows} columns={oColumns} rowKey={(o) => o.id} onRowClick={(o) => canManage ? setOfferEdit({ offer: o }) : undefined} initialSort={{ key: 'start', dir: 'desc' }}
            toolbar={<><FilterSelect label="Status" value={offerStatus} onChange={setOfferStatus} options={['Active', 'Scheduled', 'Expired', 'Draft']} /><span className="small muted">Expired and draft offers are never pitched by AI agents.</span></>}
            empty={<EmptyState icon={<Tag size={18} />} title="No offers" desc="Create a promotion and link it to approved products." />} />
        </Card>
      )}

      {tab === 'approval' && (
        <Card flush title="Approval queue" sub="Items that must be approved or re-reviewed before AI agents may use them">
          {!queue.length && <EmptyState icon={<CheckCircle2 size={18} />} title="Nothing awaiting approval" desc="All products and offers are approved and reviewed within 30 days." />}
          <div style={{ padding: '0 16px 8px' }} className="list">
            {queue.map((it) => {
              const p = it.kind === 'Product' ? app.productById.get(it.id) : undefined;
              const o = it.kind === 'Offer' ? app.offers.find((x) => x.id === it.id) : undefined;
              const camps = app.campaigns.filter((c) => (p && c.productId === p.id) || (o && c.offerId === o.id));
              return (
                <div key={it.key} className="list-item" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div className="empty-icon" style={{ margin: 0, width: 32, height: 32 }}>{it.kind === 'Product' ? <Package size={15} /> : <Tag size={15} />}</div>
                  <div className="grow" style={{ minWidth: 200 }}>
                    <div className="row-wrap"><span className="cell-primary">{it.title}</span><Badge tone="outline">{it.kind}</Badge>{p && <span className="mono small">{fmtGBP(p.monthlyPrice)}/mo · {contract(p.contractMonths)}</span>}</div>
                    <div className="small subtle mt-4">{it.reason}</div>
                    <div className="xs muted mt-4">{camps.length ? `Used by ${camps.map((c) => c.name).join(', ')}` : 'Not used by any campaign'}</div>
                  </div>
                  <div className="row">
                    <Button size="sm" onClick={() => p ? setParam('product', p.id) : o && setOfferEdit({ offer: o })} disabled={!p && !canManage}>Review</Button>
                    <Button size="sm" icon={<BadgeCheck />} disabled={!canManage} title={canManage ? undefined : noPerm}
                      onClick={() => { if (p) approve(p); else if (o) { if (o.status === 'Draft') approveOffer(o); else setOfferEdit({ offer: o, focus: true }); } }}>
                      {p ? (p.approved ? 'Mark reviewed' : 'Approve') : o?.status === 'Draft' ? 'Approve' : 'Fix products'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {drawerId && drawerProduct && <ProductDrawer key={drawerId} product={drawerProduct} offers={app.offers} canManage={canManage} onClose={() => setParam('product', null)} onSave={saveProduct} />}
      {drawerId && !drawerProduct && drawerId !== 'new' && (
        <div className="banner warn mt-16"><AlertTriangle />Product “{drawerId}” was not found.<Button size="xs" variant="link" onClick={() => setParam('product', null)}>Dismiss</Button></div>
      )}
      <style>{'@media(max-width:720px){.page-head > .grow{flex-basis:100%}}'}</style>
      {offerEdit && <OfferModal offer={offerEdit.offer} focusProducts={offerEdit.focus} products={app.products} onClose={() => setOfferEdit(null)} onSave={saveOffer} />}
    </>
  );
}
