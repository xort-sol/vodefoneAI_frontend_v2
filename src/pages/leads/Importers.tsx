// Bulk CSV import and CRM import modals for the Leads module.
import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cloud, FileSpreadsheet, FileUp, ShieldAlert, Sparkles } from 'lucide-react';
import { useApp } from '../../store/store';
import { Badge, Button, Field, Modal, Progress, SimBadge } from '../../components/ui';
import type { CustomerType, Lead } from '../../data/types';
import { fmtInt } from '../../lib/format';
import { CUSTOMER_TYPES, EMAIL_RE, TAGS, normaliseUKPhone } from './shared';

/* ---------------- CSV parsing ---------------- */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',' || ch === ';' || ch === '\t') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()));
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()));
  return rows;
}

type Target = 'name' | 'phone' | 'email' | 'customerType' | 'product' | 'city' | 'currentPlan' | 'tags' | 'consent' | '';
const TARGETS: { value: Exclude<Target, ''>; label: string; required?: boolean }[] = [
  { value: 'name', label: 'Full name', required: true }, { value: 'phone', label: 'Phone', required: true }, { value: 'email', label: 'Email' },
  { value: 'customerType', label: 'Customer type' }, { value: 'product', label: 'Interested product' }, { value: 'city', label: 'City' },
  { value: 'currentPlan', label: 'Current plan' }, { value: 'tags', label: 'Tags' }, { value: 'consent', label: 'Consent (Y/N)' },
];
const GUESS: [RegExp, Target][] = [
  [/^(full.?name|name|customer.?name|contact)$/i, 'name'], [/(phone|mobile|msisdn|tel)/i, 'phone'], [/e-?mail/i, 'email'], [/(type|segment)/i, 'customerType'],
  [/(product|interest)/i, 'product'], [/(city|town)/i, 'city'], [/(plan|tariff)/i, 'currentPlan'], [/tag/i, 'tags'], [/(consent|opt.?in)/i, 'consent'],
];

type RowState = 'valid' | 'invalid' | 'duplicate' | 'suppressed';
interface Checked { idx: number; cells: Record<string, string>; state: RowState; issue?: string; lead?: Omit<Lead, 'id'> }

export function CsvImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileName, setFileName] = useState(''); const [error, setError] = useState('');
  const [header, setHeader] = useState<string[]>([]); const [data, setData] = useState<string[][]>([]);
  const [map, setMap] = useState<Target[]>([]);
  const [defaultProduct, setDefaultProduct] = useState(app.campaigns[0]?.productId ?? app.products[0].id);
  const [campaignId, setCampaignId] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const reset = () => { setStep(1); setFileName(''); setError(''); setHeader([]); setData([]); setMap([]); setCampaignId(''); setBusy(false); };
  const close = () => { reset(); onClose(); };

  const load = (name: string, text: string) => {
    const rows = parseCSV(text);
    if (rows.length < 2) { setError('The file needs a header row and at least one data row.'); return; }
    const h = rows[0]; setHeader(h); setData(rows.slice(1)); setFileName(name); setError('');
    const used = new Set<Target>();
    setMap(h.map((col) => { const g = GUESS.find(([re, t]) => re.test(col) && !used.has(t)); if (g) { used.add(g[1]); return g[1]; } return ''; }));
    setStep(2);
  };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (/\.(xlsx|xls)$/i.test(f.name)) { setError(`“${f.name}” is an Excel workbook. Excel parsing runs on the import service (backend integration point) — in this demo, save the sheet as CSV or use the sample file.`); return; }
    if (!/\.(csv|txt|tsv)$/i.test(f.name)) { setError('Unsupported file type. Upload a .csv file.'); return; }
    if (f.size > 5 * 1024 * 1024) { setError('File is larger than 5 MB.'); return; }
    const r = new FileReader();
    r.onload = () => load(f.name, String(r.result ?? ''));
    r.onerror = () => setError('Could not read the file.');
    r.readAsText(f);
  };
  const useSample = () => {
    const existing = app.leads[7]; const sup = app.suppressions.find((x) => !app.leads.some((l) => l.phone === x.phone)) ?? app.suppressions[0];
    const lines = [
      'Full name,Mobile,Email,Customer type,Product,City,Current plan,Tags,Consent',
      'Amelia Hughes,07700 900123,amelia.hughes@gmail.com,Consumer,Unlimited Max 5G,Leeds,Red Entertainment 20GB,Renewal due,Y',
      'Rohan Shah,+44 7700 900456,rohan.shah@outlook.com,Consumer,Full Fibre 500,Bristol,Superfast 2 Broadband,Bundle eligible;Family plan,Y',
      'Brightwell Dental (Grace Evans),07700 900789,grace@brightwelldental.co.uk,SME,Business Unlimited,Cardiff,Business 10GB,Multi-line,Y',
      'Kwame Mensah,07700 900321,kwame.mensah@icloud.com,Consumer,SIM Only 100GB,London,SIM Only 12GB,Price sensitive,Y',
      `"${existing.name}",${existing.phone},${existing.email},${existing.customerType},${app.productById.get(existing.productInterest)?.name},${existing.city},${existing.currentPlan},,Y`,
      `"${sup.name}",${sup.phone},${sup.name.toLowerCase().replace(/[^a-z]/g, '.')}@yahoo.co.uk,Consumer,Unlimited Lite,Glasgow,Pay as you go,,Y`,
      'Niamh Kelly,07700 90012,niamh.kelly@gmail.com,Consumer,Unlimited Lite,Belfast,Pay as you go,,Y',
      'Ewan Fraser,07700 900654,ewan.fraser@,Consumer,Full Fibre 900,Edinburgh,Superfast 2 Broadband,Early adopter,Y',
      'Fatima Ali,07700 900987,fatima.ali@btinternet.com,Consumer,Device Upgrade — Flagship,Birmingham,Red Extra 50GB,Loyal 5y+,Y',
      'Amelia Hughes,07700 900123,amelia.h@gmail.com,Consumer,Unlimited Max 5G,Leeds,Red Entertainment 20GB,,Y',
      'Callum Reid,07700 900111,callum@kestrelengineering.co.uk,Business,Business Fibre 900,Newcastle,Business 10GB,High value,Y',
      'Bethan Morgan,07700 900222,bethan.morgan@gmail.com,Consumer,SIM Only 30GB,Cardiff,Pay as you go,,N',
      'Imran Begum,020 7946 0018,imran.begum@outlook.com,Consumer,Superfast Broadband 74,London,Legacy Basics,Retention risk,Y',
      ',07700 900333,unknown@example.com,Consumer,Unlimited Max 5G,Reading,,,Y',
    ];
    load('sample_leads_nov.csv', lines.join('\n'));
  };

  const existingPhones = useMemo(() => new Map(app.leads.map((l) => [l.phone, l.id])), [app.leads]);
  const suppressed = useMemo(() => new Set(app.suppressions.map((s) => s.phone)), [app.suppressions]);
  const findProduct = (v: string) => { const s = v.trim().toLowerCase(); if (!s) return undefined; return app.products.find((p) => p.id === s || p.name.toLowerCase() === s) ?? app.products.find((p) => p.name.toLowerCase().includes(s) || s.includes(p.name.toLowerCase())); };

  const checked: Checked[] = useMemo(() => {
    const seen = new Set<string>();
    return data.map((cells, idx) => {
      const rec: Record<string, string> = {};
      map.forEach((t, i) => { if (t) rec[t] = cells[i] ?? ''; });
      const phone = normaliseUKPhone(rec.phone ?? '');
      const base: Checked = { idx, cells: rec, state: 'valid' };
      if (!rec.name?.trim()) return { ...base, state: 'invalid', issue: 'Missing name' };
      if (!phone) return { ...base, state: 'invalid', issue: `Invalid UK phone “${rec.phone ?? ''}”` };
      if (rec.email && !EMAIL_RE.test(rec.email)) return { ...base, state: 'invalid', issue: `Invalid email “${rec.email}”` };
      if (existingPhones.has(phone)) return { ...base, state: 'duplicate', issue: `Matches existing lead ${existingPhones.get(phone)}` };
      if (seen.has(phone)) return { ...base, state: 'duplicate', issue: 'Duplicate within file' };
      seen.add(phone);
      if (suppressed.has(phone)) return { ...base, state: 'suppressed', issue: 'On do-not-call suppression list' };
      const consent = !/^(n|no|false|0)$/i.test(rec.consent ?? 'y');
      const ct = CUSTOMER_TYPES.find((c) => c.toLowerCase() === (rec.customerType ?? '').toLowerCase()) ?? 'Consumer';
      const product = findProduct(rec.product ?? '')?.id ?? defaultProduct;
      const tags = (rec.tags ?? '').split(/[;|]/).map((t) => t.trim()).filter((t) => t && TAGS.includes(t));
      const lead: Omit<Lead, 'id'> = {
        name: rec.name.trim(), phone, email: (rec.email ?? '').toLowerCase(), city: rec.city || 'London', customerType: ct as CustomerType,
        currentPlan: rec.currentPlan || 'Unknown', tenureMonths: 0, productInterest: product, source: 'CSV import', campaignId: campaignId || null,
        status: consent && campaignId ? 'Queued' : 'New', score: 0, sentiment: 'Neutral', lastCallAt: null, attempts: 0, assignedRepId: null, nextFollowUp: null,
        tags, consent, dnc: false, createdAt: new Date().toISOString(), notes: [], aiSummary: '',
      };
      return { ...base, lead, issue: consent ? undefined : 'No consent — imported but not callable' };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, map, existingPhones, suppressed, defaultProduct, campaignId]);
  const counts = { valid: 0, invalid: 0, duplicate: 0, suppressed: 0 } as Record<RowState, number>;
  checked.forEach((c) => { counts[c.state]++; });
  const missingRequired = TARGETS.filter((t) => t.required && !map.includes(t.value));

  const runImport = () => {
    const rows = checked.filter((c) => c.state === 'valid' && c.lead).map((c) => c.lead!);
    if (!rows.length) return;
    setBusy(true);
    setTimeout(() => {
      app.addLeads(rows);
      app.audit('Imported leads', `${fileName} (${rows.length} rows)`, 'Data');
      app.toast(`${fmtInt(rows.length)} leads imported`, `${counts.duplicate} duplicates, ${counts.suppressed} suppressed and ${counts.invalid} invalid rows skipped`);
      close();
    }, 700);
  };

  const tone: Record<RowState, 'green' | 'red' | 'amber' | 'purple'> = { valid: 'green', invalid: 'red', duplicate: 'amber', suppressed: 'purple' };
  return (
    <Modal open={open} onClose={close} size="xl" title="Bulk import leads" desc="Upload a CSV, map columns, then review validation, de-duplication and suppression checks before importing."
      footer={<>
        {step > 1 && <Button onClick={() => setStep((s) => (s === 3 ? 2 : 1))} disabled={busy}>Back</Button>}
        <Button onClick={close} disabled={busy}>Cancel</Button>
        {step === 2 && <Button variant="primary" onClick={() => setStep(3)} disabled={missingRequired.length > 0}>Review {fmtInt(data.length)} rows</Button>}
        {step === 3 && <Button variant="primary" onClick={runImport} disabled={busy || counts.valid === 0}>{busy ? 'Importing…' : `Import ${fmtInt(counts.valid)} leads`}</Button>}
      </>}>
      <div className="row-wrap" style={{ marginBottom: 16, gap: 16 }}>
        {(['Upload file', 'Map columns', 'Review & import'] as const).map((s, i) => (
          <span key={s} className={`row small ${step === i + 1 ? 'strong' : step > i + 1 ? 'green' : 'muted'}`} style={{ gap: 6 }}>
            <span className="step-num" style={step === i + 1 ? { background: 'var(--ink)', color: '#fff', borderColor: 'var(--ink)' } : undefined}>{step > i + 1 ? '✓' : i + 1}</span>{s}
          </span>
        ))}
      </div>

      {step === 1 && (
        <div className="col gap-12">
          <div className={`inset-box ${drag ? '' : ''}`} style={{ border: `1px dashed ${drag ? 'var(--blue)' : 'var(--smoke)'}`, background: drag ? '#f5f8ff' : 'var(--mist)', padding: 32, textAlign: 'center', cursor: 'pointer' }}
            onClick={() => fileRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }} role="button" aria-label="Choose file">
            <div className="empty-icon" style={{ background: '#fff' }}><FileUp size={18} /></div>
            <div className="strong">Drop a CSV file here, or click to browse</div>
            <div className="small muted mt-4">.csv (comma, semicolon or tab separated) · up to 5 MB · Excel (.xlsx) is parsed by the import service</div>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" style={{ display: 'none' }} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          {error && <div className="banner warn"><AlertTriangle />{error}</div>}
          <div className="row between">
            <div className="small muted">Expected columns: name, phone, email, customer type, product, city, current plan, tags, consent.</div>
            <Button size="sm" icon={<Sparkles />} onClick={useSample}>Use sample file</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="col gap-16">
          <div className="row small"><FileSpreadsheet size={15} className="muted" /><span className="medium">{fileName}</span><span className="muted">· {fmtInt(data.length)} data rows · {header.length} columns</span></div>
          <div className="table-wrap" style={{ border: '1px solid var(--ash)', borderRadius: 10 }}>
            <table className="table">
              <thead><tr><th>File column</th><th>Sample values</th><th style={{ width: 220 }}>Maps to</th></tr></thead>
              <tbody>
                {header.map((h, i) => (
                  <tr key={i}>
                    <td className="medium">{h || <span className="muted">(blank)</span>}</td>
                    <td className="small muted truncate" style={{ maxWidth: 320 }}>{data.slice(0, 3).map((r) => r[i]).filter(Boolean).join(' · ')}</td>
                    <td>
                      <select className="select sm soft" value={map[i] ?? ''} onChange={(e) => { const v = e.target.value as Target; setMap((m) => m.map((x, j) => (j === i ? v : x === v && v ? '' : x))); }}>
                        <option value="">Ignore column</option>
                        {TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}{t.required ? ' *' : ''}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {missingRequired.length > 0 && <div className="banner warn"><AlertTriangle />Map the required field{missingRequired.length > 1 ? 's' : ''}: {missingRequired.map((t) => t.label).join(', ')}.</div>}
          <div className="form-grid">
            <Field label="Default product" hint="Used when the product column is missing or unrecognised"><select className="select" value={defaultProduct} onChange={(e) => setDefaultProduct(e.target.value)}>{app.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Add to campaign" hint="Consented leads are queued for simulated AI calls"><select className="select" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}><option value="">Don’t add to a campaign</option>{app.campaigns.filter((c) => ['Active', 'Paused', 'Scheduled', 'Draft'].includes(c.status)).map((c) => <option key={c.id} value={c.id}>{c.name} · {c.status}</option>)}</select></Field>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="col gap-16">
          <div className="stat-strip" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
            {([['valid', 'Ready to import', CheckCircle2], ['duplicate', 'Duplicates skipped', AlertTriangle], ['suppressed', 'Suppressed (DNC)', ShieldAlert], ['invalid', 'Invalid rows', AlertTriangle]] as const).map(([k, l, Icon]) => (
              <div key={k}><div className="kpi-label"><Icon size={13} />{l}</div><div className="kpi-value mt-4">{counts[k]}</div></div>
            ))}
          </div>
          {counts.suppressed > 0 && <div className="banner info"><ShieldAlert />{counts.suppressed} row{counts.suppressed > 1 ? 's' : ''} matched the do-not-call suppression list and will not be imported.</div>}
          <div className="table-wrap" style={{ border: '1px solid var(--ash)', borderRadius: 10, maxHeight: 340, overflowY: 'auto' }}>
            <table className="table">
              <thead><tr><th>#</th><th>Name</th><th>Phone</th><th>Email</th><th>Product</th><th>Check</th></tr></thead>
              <tbody>
                {checked.map((c) => (
                  <tr key={c.idx}>
                    <td className="mono muted">{c.idx + 2}</td>
                    <td className="medium">{c.cells.name || <span className="muted">—</span>}</td>
                    <td className="mono">{c.lead?.phone ?? c.cells.phone}</td>
                    <td className="small">{c.cells.email}</td>
                    <td className="small">{c.lead ? app.productById.get(c.lead.productInterest)?.name : c.cells.product}</td>
                    <td><div className="row gap-4"><Badge tone={tone[c.state]} dot>{c.state === 'valid' ? 'Valid' : c.state === 'duplicate' ? 'Duplicate' : c.state === 'suppressed' ? 'Suppressed' : 'Invalid'}</Badge>{c.issue && <span className="xs muted">{c.issue}</span>}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ---------------- CRM import ---------------- */
const CRMS = [
  { id: 'Salesforce', label: 'Salesforce', desc: 'Sales Cloud · Leads & Contacts' },
  { id: 'Microsoft Dynamics 365', label: 'Microsoft Dynamics 365', desc: 'Dynamics Sales · Leads' },
  { id: 'HubSpot', label: 'HubSpot', desc: 'CRM · Contacts & lists' },
] as const;
const SEGMENTS = [
  { id: 'renewal-60', label: 'Contract renewal due in 60 days', size: 48, product: 'p-unl-max', type: 'Consumer' as CustomerType, tag: 'Renewal due' },
  { id: 'ooc-sim', label: 'Out-of-contract handset customers', size: 36, product: 'p-sim-100', type: 'Consumer' as CustomerType, tag: 'Price sensitive' },
  { id: 'fibre-ready', label: 'Copper broadband · Full Fibre now available', size: 42, product: 'p-fibre-500', type: 'Consumer' as CustomerType, tag: 'Bundle eligible' },
  { id: 'sme-prospects', label: 'SME prospects · 2–20 employees', size: 24, product: 'p-biz-unl', type: 'SME' as CustomerType, tag: 'Multi-line' },
];
const STAGES = ['Authenticating with CRM', 'Fetching segment records', 'Normalising phone numbers', 'De-duplicating against existing leads', 'Checking suppression & TPS', 'Writing lead records'];
const FN = ['Oliver', 'Isla', 'Harry', 'Mia', 'Leo', 'Grace', 'Arthur', 'Freya', 'Theo', 'Evie', 'Rhys', 'Zara', 'Samuel', 'Chloe', 'Aisha', 'Ewan'];
const LN = ['Turner', 'Ward', 'Hughes', 'Khan', 'Morgan', 'Reid', 'Shah', 'Okafor', 'Nowak', 'Fraser', 'Bennett', 'Chen', 'Price', 'Lewis'];
const CITY = ['London', 'Manchester', 'Leeds', 'Bristol', 'Glasgow', 'Cardiff', 'Belfast', 'Newcastle'];

export function CrmImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp();
  const [crm, setCrm] = useState<string>('Salesforce'); const [seg, setSeg] = useState(SEGMENTS[0].id); const [campaignId, setCampaignId] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const segment = SEGMENTS.find((s) => s.id === seg)!;
  const connected = app.settings.integrations[crm]?.connected;
  const close = () => { if (progress !== null && progress < 100) return; setProgress(null); onClose(); };

  const run = () => {
    setProgress(0);
    let p = 0;
    const iv = setInterval(() => {
      p = Math.min(100, p + 7 + Math.random() * 9);
      setProgress(p);
      if (p >= 100) {
        clearInterval(iv);
        const n = segment.size;
        const phones = new Set(app.leads.map((l) => l.phone)); const sup = new Set(app.suppressions.map((s) => s.phone));
        const rows: Omit<Lead, 'id'>[] = []; let dupes = 0; let suppressed = 0;
        for (let i = 0; i < n; i++) {
          const fn = FN[(i * 7 + seg.length) % FN.length]; const ln = LN[(i * 5 + crm.length) % LN.length];
          const phone = `+44 7${700 + ((i * 37 + crm.length * 11) % 299)} ${100 + ((i * 53) % 899)} ${100 + ((i * 97 + seg.length) % 899)}`;
          if (phones.has(phone) || i % 17 === 5) { dupes++; continue; }
          if (sup.has(phone) || i % 23 === 11) { suppressed++; continue; }
          phones.add(phone);
          rows.push({
            name: `${fn} ${ln}`, phone, email: `${fn}.${ln}${i}@${segment.type === 'SME' ? 'example-business.co.uk' : 'gmail.com'}`.toLowerCase(), city: CITY[i % CITY.length], customerType: segment.type,
            currentPlan: segment.type === 'SME' ? 'Business 10GB' : 'Red Entertainment 20GB', tenureMonths: 12 + ((i * 13) % 90), productInterest: segment.product, source: 'CRM export',
            campaignId: campaignId || null, status: campaignId ? 'Queued' : 'New', score: 0, sentiment: 'Neutral', lastCallAt: null, attempts: 0, assignedRepId: null, nextFollowUp: null,
            tags: [segment.tag], consent: true, dnc: false, createdAt: new Date().toISOString(), notes: [], aiSummary: '',
          });
        }
        app.addLeads(rows);
        app.audit('Imported leads from CRM', `${crm} · ${segment.label} (${rows.length})`, 'Data');
        app.toast(`${rows.length} leads imported from ${crm}`, `${segment.label} · ${dupes} duplicates and ${suppressed} suppressed records skipped${connected ? '' : ' · sandbox data'}`);
      }
    }, 280);
  };
  const stageIdx = progress === null ? -1 : Math.min(STAGES.length - 1, Math.floor((progress / 100) * STAGES.length));
  return (
    <Modal open={open} onClose={close} size="lg" title={<span className="row">Import from CRM <SimBadge /></span>} desc="Pull a segment from a connected CRM. Records are de-duplicated and checked against suppression lists before they are written."
      footer={progress === null ? <><Button onClick={close}>Cancel</Button><Button variant="primary" icon={<Cloud />} onClick={run}>Import ~{segment.size} records</Button></>
        : progress < 100 ? <Button disabled>Importing…</Button> : <Button variant="primary" onClick={close}>Done</Button>}>
      {progress === null ? (
        <div className="col gap-16">
          <div>
            <div className="field-label" style={{ marginBottom: 8 }}>Source system</div>
            <div className="grid g-3" style={{ gap: 10 }}>
              {CRMS.map((c) => {
                const on = crm === c.id; const conn = app.settings.integrations[c.id]?.connected;
                return (
                  <button key={c.id} type="button" className={`option-card ${on ? 'on' : ''}`} onClick={() => setCrm(c.id)}>
                    <div className="row between"><span className="medium" style={{ color: 'var(--ink)' }}>{c.label}</span></div>
                    <div className="xs muted mt-4">{c.desc}</div>
                    <div className="mt-8">{conn ? <Badge tone="green" dot>Connected</Badge> : <Badge tone="neutral">Sandbox</Badge>}</div>
                  </button>
                );
              })}
            </div>
            {!connected && <div className="banner info mt-12"><Cloud />{crm} isn’t connected in Settings → Integrations. The import will use sandbox records for demonstration.</div>}
          </div>
          <div className="form-grid">
            <Field label="Segment / list"><select className="select" value={seg} onChange={(e) => setSeg(e.target.value)}>{SEGMENTS.map((s) => <option key={s.id} value={s.id}>{s.label} (~{s.size})</option>)}</select></Field>
            <Field label="Add to campaign"><select className="select" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}><option value="">Don’t add to a campaign</option>{app.campaigns.filter((c) => ['Active', 'Paused', 'Scheduled', 'Draft'].includes(c.status)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          </div>
          <div className="small muted">Field mapping: FirstName + LastName → name, MobilePhone → phone, Email → email, Account.Type → customer type, Product_Interest__c → product.</div>
        </div>
      ) : (
        <div className="col gap-12">
          <div className="row between small"><span className="medium">{progress < 100 ? STAGES[stageIdx] : 'Import complete'}</span><span className="mono">{Math.round(progress)}%</span></div>
          <Progress value={progress} color={progress >= 100 ? 'var(--green)' : undefined} />
          <div className="col gap-4 mt-8">
            {STAGES.map((s, i) => (
              <div key={s} className={`row small ${i < stageIdx || progress >= 100 ? 'green' : i === stageIdx ? '' : 'muted'}`}>
                {i < stageIdx || progress >= 100 ? <CheckCircle2 size={14} /> : <span style={{ width: 14, height: 14, borderRadius: '50%', border: '1px solid var(--smoke)', display: 'inline-block' }} />}{s}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
