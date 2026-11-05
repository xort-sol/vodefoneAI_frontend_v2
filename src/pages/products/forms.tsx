import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button, Drawer, Field, Modal, Switch } from '../../components/ui';
import type { Offer, Product } from '../../data/types';
import { fmtDate } from '../../lib/format';
import { NOW } from '../../data/seed';

export const CATEGORIES: Product['category'][] = ['Mobile', 'SIM Only', 'Broadband', 'Fibre', 'Business Mobile', 'Business Broadband', 'Device'];

export function blankProduct(): Product {
  return { id: '', name: '', category: 'Mobile', description: '', monthlyPrice: 0, upfront: 0, contractMonths: 24, data: '', speed: '', benefits: [], eligibility: '', availability: 'Available', approved: false, lastReviewed: new Date().toISOString() };
}

const toDateInput = (iso: string) => iso ? new Date(iso).toISOString().slice(0, 10) : '';

export function ProductDrawer({ product, offers, onClose, onSave, canManage }: { product: Product; offers: Offer[]; onClose: () => void; onSave: (p: Product, linkOffers: string[]) => void; canManage: boolean }) {
  const isNew = !product.id;
  const [p, setP] = useState<Product>(product);
  const [benefit, setBenefit] = useState('');
  const [linked, setLinked] = useState<string[]>(() => offers.filter((o) => o.productIds.includes(product.id)).map((o) => o.id));
  const [tried, setTried] = useState(false);
  const set = (x: Partial<Product>) => setP((s) => ({ ...s, ...x }));
  const needsSpeed = ['Broadband', 'Fibre', 'Business Broadband'].includes(p.category);
  const err = {
    name: !p.name.trim() ? 'Name is required' : '',
    description: p.description.trim().length < 15 ? 'Add a description (15+ characters)' : '',
    monthlyPrice: !(p.monthlyPrice > 0) ? 'Enter a monthly price above £0' : p.monthlyPrice > 500 ? 'Price looks too high' : '',
    upfront: p.upfront < 0 ? 'Cannot be negative' : '',
    contractMonths: ![1, 12, 18, 24, 36].includes(p.contractMonths) ? 'Choose a valid contract length' : '',
    data: !p.data.trim() ? 'Data allowance is required' : '',
    speed: needsSpeed && !p.speed?.trim() ? 'Speed is required for broadband products' : '',
    eligibility: !p.eligibility.trim() ? 'Eligibility rules are required' : '',
    benefits: p.benefits.length === 0 ? 'Add at least one benefit' : '',
  };
  const invalid = Object.values(err).some(Boolean);
  const termsChanged = !isNew && (p.monthlyPrice !== product.monthlyPrice || p.contractMonths !== product.contractMonths || p.upfront !== product.upfront || p.eligibility !== product.eligibility);
  const submit = () => { setTried(true); if (invalid) return; onSave(p, linked); };
  const e = (k: keyof typeof err) => tried && err[k];
  const addBenefit = () => { const b = benefit.trim(); if (b && !p.benefits.includes(b)) set({ benefits: [...p.benefits, b] }); setBenefit(''); };
  return (
    <Drawer open onClose={onClose} width={560} title={isNew ? 'New product' : canManage ? `Edit ${product.name}` : product.name}
      footer={<><Button onClick={onClose}>{canManage ? 'Cancel' : 'Close'}</Button>{canManage && <Button variant="primary" onClick={submit}>{isNew ? 'Create product' : 'Save changes'}</Button>}</>}>
      <fieldset disabled={!canManage} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {!canManage && <div className="banner info" style={{ marginBottom: 16 }}>View only — managing products requires the products.manage permission.</div>}
        {termsChanged && <div className="banner warn" style={{ marginBottom: 16 }}>Price, contract or eligibility changed — the product returns to <b>&nbsp;Pending approval&nbsp;</b> and AI agents stop pitching it until approved.</div>}
        {tried && invalid && <div className="banner warn" style={{ marginBottom: 16 }}>Please fix the highlighted fields.</div>}
        <div className="form-grid">
          <Field label="Product name" required error={e('name')} className="span-all"><input className={`input ${e('name') ? 'invalid' : ''}`} value={p.name} onChange={(x) => set({ name: x.target.value })} /></Field>
          <Field label="Category" required><select className="select" value={p.category} onChange={(x) => set({ category: x.target.value as Product['category'] })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Availability"><select className="select" value={p.availability} onChange={(x) => set({ availability: x.target.value as Product['availability'] })}>{['Available', 'Limited', 'Retired'].map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Description" required error={e('description')} className="span-all"><textarea className={`textarea ${e('description') ? 'invalid' : ''}`} value={p.description} onChange={(x) => set({ description: x.target.value })} /></Field>
          <Field label="Monthly price (£)" required error={e('monthlyPrice')}><input type="number" min={0} step={0.5} className={`input ${e('monthlyPrice') ? 'invalid' : ''}`} value={p.monthlyPrice || ''} onChange={(x) => set({ monthlyPrice: +x.target.value })} /></Field>
          <Field label="Upfront cost (£)" error={e('upfront')}><input type="number" min={0} className="input" value={p.upfront} onChange={(x) => set({ upfront: +x.target.value })} /></Field>
          <Field label="Contract duration" required error={e('contractMonths')}><select className="select" value={p.contractMonths} onChange={(x) => set({ contractMonths: +x.target.value })}>{[1, 12, 18, 24, 36].map((m) => <option key={m} value={m}>{m === 1 ? '30-day rolling' : `${m} months`}</option>)}</select></Field>
          <Field label="Data allowance" required error={e('data')}><input className={`input ${e('data') ? 'invalid' : ''}`} value={p.data} placeholder="e.g. Unlimited, 100GB" onChange={(x) => set({ data: x.target.value })} /></Field>
          {needsSpeed && <Field label="Average speed" required error={e('speed')}><input className={`input ${e('speed') ? 'invalid' : ''}`} value={p.speed ?? ''} placeholder="e.g. 500Mbps" onChange={(x) => set({ speed: x.target.value })} /></Field>}
          <Field label="Eligibility" required error={e('eligibility')} className="span-all"><textarea className={`textarea ${e('eligibility') ? 'invalid' : ''}`} style={{ minHeight: 60 }} value={p.eligibility} onChange={(x) => set({ eligibility: x.target.value })} /></Field>
          <div className="field span-all">
            <span className="field-label">Benefits <span className="red">*</span></span>
            <div className="row-wrap">{p.benefits.map((b) => <span key={b} className="tag">{b}{canManage && <button type="button" className="btn ghost xs icon" style={{ height: 16, width: 16 }} onClick={() => set({ benefits: p.benefits.filter((x) => x !== b) })} aria-label={`Remove ${b}`}><X size={11} /></button>}</span>)}</div>
            {canManage && <div className="row"><input className="input sm soft" value={benefit} placeholder="Add a benefit" onChange={(x) => setBenefit(x.target.value)} onKeyDown={(x) => { if (x.key === 'Enter') { x.preventDefault(); addBenefit(); } }} /><Button size="sm" icon={<Plus />} onClick={addBenefit} disabled={!benefit.trim()}>Add</Button></div>}
            {e('benefits') && <span className="field-error">{err.benefits}</span>}
          </div>
          <div className="field span-all">
            <span className="field-label">Linked promotions</span>
            <div className="col gap-4">
              {offers.filter((o) => o.status !== 'Expired').map((o) => (
                <label key={o.id} className="row small" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" className="checkbox" checked={linked.includes(o.id)} onChange={(x) => setLinked(x.target.checked ? [...linked, o.id] : linked.filter((i) => i !== o.id))} />
                  <span className="grow">{o.name} <span className="muted">· {o.discount}</span></span><span className="mono xs muted">{o.status}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </fieldset>
    </Drawer>
  );
}

export function deriveStatus(o: Pick<Offer, 'startDate' | 'endDate'>): Offer['status'] {
  const s = new Date(o.startDate).getTime(); const e = new Date(o.endDate).getTime(); const n = NOW.getTime();
  return e < n ? 'Expired' : s > n ? 'Scheduled' : 'Active';
}

export function OfferModal({ offer, products, focusProducts, onClose, onSave }: { offer: Offer; products: Product[]; focusProducts?: boolean; onClose: () => void; onSave: (o: Offer) => void }) {
  const isNew = !offer.id;
  const [o, setO] = useState<Offer>(offer);
  const [isDraft, setIsDraft] = useState(offer.status === 'Draft');
  const [tried, setTried] = useState(false);
  const set = (x: Partial<Offer>) => setO((s) => ({ ...s, ...x }));
  const err = {
    name: !o.name.trim() ? 'Name is required' : '',
    discount: !o.discount.trim() ? 'Describe the discount' : '',
    code: !/^[A-Z0-9]{3,16}$/.test(o.code) ? '3–16 uppercase letters or digits' : '',
    dates: !o.startDate || !o.endDate ? 'Both dates are required' : new Date(o.endDate) <= new Date(o.startDate) ? 'End date must be after start date' : '',
    products: o.productIds.length === 0 ? 'Assign at least one product' : '',
  };
  const invalid = Object.values(err).some(Boolean);
  const status = isDraft ? 'Draft' : o.startDate && o.endDate ? deriveStatus(o) : 'Draft';
  const submit = () => { setTried(true); if (invalid) return; onSave({ ...o, status }); };
  const e = (k: keyof typeof err) => tried && err[k];
  return (
    <Modal open onClose={onClose} size="lg" title={isNew ? 'New offer' : focusProducts ? `Assign products — ${offer.name}` : `Edit ${offer.name}`} desc="Offers are only pitched by AI agents while Active and linked to approved products."
      footer={<><span className="small muted" style={{ marginRight: 'auto' }}>Status on save: <b>{status}</b></span><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>{isNew ? 'Create offer' : 'Save offer'}</Button></>}>
      <div className="form-grid">
        {!focusProducts && (<>
          <Field label="Offer name" required error={e('name')} className="span-all"><input className={`input ${e('name') ? 'invalid' : ''}`} value={o.name} onChange={(x) => set({ name: x.target.value })} /></Field>
          <Field label="Discount" required error={e('discount')}><input className={`input ${e('discount') ? 'invalid' : ''}`} value={o.discount} placeholder="e.g. 50% for 6 months" onChange={(x) => set({ discount: x.target.value })} /></Field>
          <Field label="Promo code" required error={e('code')}><input className={`input mono ${e('code') ? 'invalid' : ''}`} value={o.code} onChange={(x) => set({ code: x.target.value.toUpperCase().replace(/\s/g, '') })} /></Field>
          <Field label="Start date" required error={e('dates')}><input type="date" className={`input ${e('dates') ? 'invalid' : ''}`} value={toDateInput(o.startDate)} onChange={(x) => set({ startDate: x.target.value ? new Date(`${x.target.value}T00:00:00`).toISOString() : '' })} /></Field>
          <Field label="End date" required><input type="date" className={`input ${e('dates') ? 'invalid' : ''}`} value={toDateInput(o.endDate)} onChange={(x) => set({ endDate: x.target.value ? new Date(`${x.target.value}T23:59:00`).toISOString() : '' })} /></Field>
          <Field label="Description" className="span-all"><textarea className="textarea" style={{ minHeight: 60 }} value={o.description} onChange={(x) => set({ description: x.target.value })} /></Field>
          <div className="setting-row span-all" style={{ paddingTop: 0 }}><div className="grow"><div className="title">Keep as draft</div><div className="desc">Drafts are never pitched. Otherwise the status follows the dates{o.startDate && o.endDate ? ` (${fmtDate(o.startDate)} – ${fmtDate(o.endDate)})` : ''}.</div></div><Switch on={isDraft} onChange={setIsDraft} label="Keep as draft" /></div>
        </>)}
        <div className="field span-all">
          <span className="field-label">Products <span className="red">*</span></span>
          <div className="grid g-2" style={{ gap: 6 }}>
            {products.filter((p) => p.availability !== 'Retired' || o.productIds.includes(p.id)).map((p) => (
              <label key={p.id} className="row small inset-box" style={{ cursor: 'pointer', padding: '8px 10px', background: o.productIds.includes(p.id) ? 'var(--blue-tint)' : undefined }}>
                <input type="checkbox" className="checkbox" checked={o.productIds.includes(p.id)} onChange={(x) => set({ productIds: x.target.checked ? [...o.productIds, p.id] : o.productIds.filter((i) => i !== p.id) })} />
                <span className="grow truncate">{p.name}</span>
                <span className="mono xs muted">£{p.monthlyPrice}</span>
                {!p.approved && <span className="xs" style={{ color: 'var(--amber)' }}>pending</span>}
              </label>
            ))}
          </div>
          {e('products') && <span className="field-error">{err.products}</span>}
        </div>
      </div>
    </Modal>
  );
}
