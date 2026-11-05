import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Check, ExternalLink, Info, Pencil, Plus, RotateCcw, ShieldCheck, Trash2, Volume2, X, CheckCircle2, XCircle, Clock,
} from 'lucide-react';
import { Badge, Button, Card, Field, Modal, Segmented, StatusBadge, Switch, useConfirm, EmptyState, Avatar } from '../../components/ui';
import { useApp } from '../../store/store';
import { fmtDate, fmtDateTime, fmtRelative } from '../../lib/format';
import {
  ACCENTS, AGENT_COLORS, KB_CATEGORIES, LANGUAGES, ROLES, VARIABLES, VOICES, derivedKb, diffSummary, isStale, uid, versionsOf,
  type AgentX, type Builder, type Draft, type KbEntry, type KbCategory,
} from './model';

export interface SectionProps {
  draft: Draft; set: (p: Partial<Draft>) => void; setB: (p: Partial<Draft['builder']>) => void; ro: boolean;
}

/* ---------------- small helpers ---------------- */
function Slider({ label, value, min, max, step = 1, onChange, fmt, left, right, disabled }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; fmt?: (v: number) => string; left?: string; right?: string; disabled?: boolean }) {
  return (
    <div className="field">
      <div className="row between"><span className="field-label">{label}</span><span className="mono small">{fmt ? fmt(value) : value}</span></div>
      <input type="range" className="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(+e.target.value)} aria-label={label} />
      {(left || right) && <div className="row between xs muted"><span>{left}</span><span>{right}</span></div>}
    </div>
  );
}
function Chips({ items, onRemove, onAdd, placeholder, disabled }: { items: string[]; onRemove: (i: number) => void; onAdd: (v: string) => void; placeholder: string; disabled?: boolean }) {
  const [v, setV] = useState('');
  const add = () => { const t = v.trim(); if (t && !items.some((x) => x.toLowerCase() === t.toLowerCase())) onAdd(t); setV(''); };
  return (
    <div>
      <div className="row-wrap">
        {items.map((it, i) => <span key={it} className="tag">{it}{!disabled && <button className="btn ghost xs icon" style={{ height: 16, width: 16 }} onClick={() => onRemove(i)} aria-label={`Remove ${it}`}><X size={11} /></button>}</span>)}
        {!items.length && <span className="small muted">None</span>}
      </div>
      {!disabled && (
        <div className="row mt-8">
          <input className="input sm soft" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
          <Button size="sm" icon={<Plus />} onClick={add} disabled={!v.trim()}>Add</Button>
        </div>
      )}
    </div>
  );
}
function SettingRow({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return <div className="setting-row"><div className="grow"><div className="title">{title}</div>{desc && <div className="desc">{desc}</div>}</div>{children}</div>;
}

/* ---------------- 1 Identity ---------------- */
export function Identity({ draft, set, setB, ro }: SectionProps) {
  return (
    <Card title="Agent identity" sub="How this agent appears to your team in the platform">
      <div className="row" style={{ marginBottom: 16 }}>
        <Avatar initials={draft.name.slice(0, 2).toUpperCase() || '?'} color={draft.color} agent size="xl" />
        <div><div className="strong">{draft.name || 'Unnamed agent'}</div><div className="small muted">{draft.builder.role} · {draft.voice}</div></div>
      </div>
      <div className="form-grid">
        <Field label="Name" required error={!draft.name.trim() && 'Name is required'}><input className={`input ${!draft.name.trim() ? 'invalid' : ''}`} value={draft.name} disabled={ro} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Role"><select className="select" value={draft.builder.role} disabled={ro} onChange={(e) => setB({ role: e.target.value })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Avatar colour" className="span-all">
          <div className="row-wrap">
            {AGENT_COLORS.map((c) => (
              <button key={c} type="button" disabled={ro} onClick={() => set({ color: c })} aria-label={`Colour ${c}`} aria-pressed={draft.color === c}
                style={{ width: 28, height: 28, borderRadius: 8, background: c, border: draft.color === c ? '2px solid #fff' : '1px solid transparent', boxShadow: draft.color === c ? `0 0 0 2px ${c}` : undefined, cursor: ro ? 'not-allowed' : 'pointer', display: 'grid', placeItems: 'center', color: '#fff' }}>
                {draft.color === c && <Check size={14} />}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Description" className="span-all" hint={`${draft.builder.description.length}/280`}>
          <textarea className="textarea" maxLength={280} value={draft.builder.description} disabled={ro} onChange={(e) => setB({ description: e.target.value })} />
        </Field>
      </div>
    </Card>
  );
}

/* ---------------- 2 Voice ---------------- */
export function Voice({ draft, set, setB, ro }: SectionProps) {
  const { toast } = useApp();
  const [speaking, setSpeaking] = useState(false);
  const preview = () => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') { toast('Voice preview unavailable', 'This browser does not support speech synthesis. Production uses the ElevenLabs voice library.', 'info'); return; }
    if (speaking) { synth.cancel(); setSpeaking(false); return; }
    const u = new SpeechSynthesisUtterance(draft.greeting.replace(/\{first_name\}/g, 'Alex').replace(/\{agent_name\}/g, draft.name));
    u.lang = draft.language.includes('US') ? 'en-US' : draft.language.includes('Ireland') ? 'en-IE' : 'en-GB';
    u.rate = draft.speakingRate; u.pitch = draft.builder.pitch;
    const v = synth.getVoices().find((x) => x.lang === u.lang); if (v) u.voice = v;
    u.onend = () => setSpeaking(false); u.onerror = () => setSpeaking(false);
    synth.cancel(); synth.speak(u); setSpeaking(true);
  };
  return (
    <Card title="Voice & language" sub="Synthetic voice settings used for every call" actions={<Button size="sm" icon={<Volume2 />} onClick={preview}>{speaking ? 'Stop preview' : 'Preview voice'}</Button>}>
      <div className="banner info" style={{ marginBottom: 16 }}><Info />Preview uses your browser's built-in speech engine as an approximation of the selected neural voice.</div>
      <div className="form-grid">
        <Field label="Voice"><select className="select" value={draft.voice} disabled={ro} onChange={(e) => set({ voice: e.target.value })}>{[...new Set([draft.voice, ...VOICES])].map((v) => <option key={v}>{v}</option>)}</select></Field>
        <Field label="Language"><select className="select" value={draft.language} disabled={ro} onChange={(e) => set({ language: e.target.value })}>{[...new Set([draft.language, ...LANGUAGES])].map((v) => <option key={v}>{v}</option>)}</select></Field>
        <Field label="Accent"><select className="select" value={draft.accent} disabled={ro} onChange={(e) => set({ accent: e.target.value })}>{[...new Set([draft.accent, ...ACCENTS])].map((v) => <option key={v}>{v}</option>)}</select></Field>
        <div />
        <Slider label="Speaking rate" value={draft.speakingRate} min={0.7} max={1.3} step={0.01} onChange={(v) => set({ speakingRate: v })} fmt={(v) => `${v.toFixed(2)}×`} left="Slower" right="Faster" disabled={ro} />
        <Slider label="Pitch" value={draft.builder.pitch} min={0.6} max={1.4} step={0.05} onChange={(v) => setB({ pitch: v })} fmt={(v) => v.toFixed(2)} left="Lower" right="Higher" disabled={ro} />
        <Slider label="Pause length between turns" value={draft.builder.pauseMs} min={100} max={1200} step={50} onChange={(v) => setB({ pauseMs: v })} fmt={(v) => `${v} ms`} disabled={ro} />
        <Slider label="Response creativity (temperature)" value={draft.temperature} min={0} max={1} step={0.05} onChange={(v) => set({ temperature: v })} fmt={(v) => v.toFixed(2)} left="Predictable" right="Varied" disabled={ro} />
      </div>
      <div className="divider" />
      <SettingRow title="Background noise suppression" desc="Filter road, wind and household noise from the customer's audio before transcription.">
        <Switch on={draft.builder.noiseSuppression} onChange={(v) => setB({ noiseSuppression: v })} disabled={ro} label="Background noise suppression" />
      </SettingRow>
    </Card>
  );
}

/* ---------------- 3 Personality ---------------- */
export function Personality({ draft, set, setB, ro }: SectionProps) {
  const t = draft.builder.tone;
  const setT = (p: Partial<Builder['tone']>) => setB({ tone: { ...t, ...p } });
  return (
    <Card title="Personality & speaking style" sub="Shapes word choice and pacing — guardrails still apply">
      <Field label="Personality summary"><input className="input" value={draft.personality} disabled={ro} onChange={(e) => set({ personality: e.target.value })} /></Field>
      <div className="grid g-3 mt-16">
        <Slider label="Formality" value={t.formality} min={0} max={100} onChange={(v) => setT({ formality: v })} left="Casual" right="Formal" disabled={ro} />
        <Slider label="Detail" value={t.detail} min={0} max={100} onChange={(v) => setT({ detail: v })} left="Concise" right="Detailed" disabled={ro} />
        <Slider label="Empathy" value={t.empathy} min={0} max={100} onChange={(v) => setT({ empathy: v })} left="Neutral" right="Highly empathetic" disabled={ro} />
      </div>
      <div className="inset-box mt-16 small subtle">
        <span className="label">Example phrasing</span>
        <div className="mt-4">“{t.formality > 60 ? 'Good afternoon, thank you for taking my call.' : 'Hi there, thanks for picking up!'} {t.empathy > 60 ? "I know your time's valuable, so I'll be quick." : ''} {t.detail > 60 ? 'I wanted to walk you through a plan that includes unlimited 5G data, EU roaming and a capped annual price rise.' : 'You may be able to save on your plan.'}”</div>
      </div>
      <div className="divider" />
      <div className="field-label" style={{ marginBottom: 8 }}>Banned phrases</div>
      <div className="small muted" style={{ marginBottom: 8 }}>The agent will never use these phrases. Tests fail if they appear in a response.</div>
      <Chips items={draft.builder.bannedPhrases} disabled={ro} placeholder="Add a phrase, e.g. “Final offer”" onAdd={(v) => setB({ bannedPhrases: [...draft.builder.bannedPhrases, v] })} onRemove={(i) => setB({ bannedPhrases: draft.builder.bannedPhrases.filter((_, j) => j !== i) })} />
    </Card>
  );
}

/* ---------------- 4 Instructions ---------------- */
export function Instructions({ draft, set, setB, ro }: SectionProps) {
  const disc = draft.builder.disclosure.trim();
  const greetHasDisc = /ai assistant/i.test(draft.greeting) && /record/i.test(draft.greeting);
  const insert = (v: string) => set({ instructions: `${draft.instructions}${draft.instructions.endsWith(' ') ? '' : ' '}${v}` });
  return (
    <Card title="Agent instructions" sub="System prompt and mandatory call-opening text">
      {!disc && <div className="banner warn" style={{ marginBottom: 16 }}><AlertTriangle /><div><b>Mandatory disclosure missing.</b> UK guidance requires the agent to state it is an AI and that the call is recorded. Publishing is blocked until this is filled in.</div></div>}
      {disc && !greetHasDisc && <div className="banner info" style={{ marginBottom: 16 }}><Info />The greeting does not mention the AI/recording notice, so the disclosure text will be appended automatically after the greeting.</div>}
      <Field label="System prompt" hint={`${draft.instructions.length.toLocaleString('en-GB')} / 4,000 characters`} error={draft.instructions.length > 4000 && 'System prompt is too long'}>
        <textarea className="textarea mono" style={{ minHeight: 180, fontSize: 12.5 }} value={draft.instructions} disabled={ro} onChange={(e) => set({ instructions: e.target.value })} />
      </Field>
      <div className="row-wrap mt-8"><span className="small muted">Insert variable:</span>{VARIABLES.map((v) => <button key={v} className="tag mono" style={{ cursor: ro ? 'not-allowed' : 'pointer', fontSize: 11.5 }} disabled={ro} onClick={() => insert(v)}>{v}</button>)}</div>
      <div className="form-grid mt-16">
        <Field label="Greeting" hint="First thing the agent says when the call connects" className="span-all">
          <textarea className="textarea" value={draft.greeting} disabled={ro} onChange={(e) => set({ greeting: e.target.value })} />
        </Field>
        <Field label="Mandatory disclosure" required error={!disc && 'Disclosure text is required'} className="span-all">
          <textarea className={`textarea ${!disc ? 'invalid' : ''}`} style={{ minHeight: 60 }} value={draft.builder.disclosure} disabled={ro} onChange={(e) => setB({ disclosure: e.target.value })} />
        </Field>
      </div>
    </Card>
  );
}

/* ---------------- 5 Scripts ---------------- */
export function Scripts({ draft, setB, ro }: SectionProps) {
  const { products } = useApp(); const confirm = useConfirm();
  const sc = draft.builder.scripts;
  const upd = (id: string, p: Partial<Builder['scripts'][number]>) => setB({ scripts: sc.map((s) => (s.id === id ? { ...s, ...p } : s)) });
  const add = () => {
    const unused = products.find((p) => p.availability !== 'Retired' && !sc.some((s) => s.productId === p.id)) ?? products[0];
    setB({ scripts: [...sc, { id: uid('s'), productId: unused.id, opening: '', pitch: '', closing: '' }] });
  };
  return (
    <Card title="Conversation scripts" sub="Opening, pitch and closing lines per product. Variables like {first_name} are filled at call time." actions={<Button size="sm" icon={<Plus />} onClick={add} disabled={ro}>Add script</Button>}>
      {!sc.length && <EmptyState title="No scripts" desc="Add a script for each product this agent pitches." />}
      <div className="col gap-16">
        {sc.map((s) => {
          const p = products.find((x) => x.id === s.productId);
          return (
            <div key={s.id} className="inset-box" style={{ background: 'var(--canvas)', border: '1px solid var(--ash)' }}>
              <div className="row between" style={{ marginBottom: 10 }}>
                <select className="select sm" style={{ maxWidth: 300 }} value={s.productId} disabled={ro} onChange={(e) => upd(s.id, { productId: e.target.value })} aria-label="Product">
                  {products.map((x) => <option key={x.id} value={x.id}>{x.name}{x.availability === 'Retired' ? ' (retired)' : ''}</option>)}
                </select>
                <div className="row">
                  {p && (p.approved ? <Badge tone="green" dot>Approved pricing</Badge> : <Badge tone="amber" dot>Pending approval</Badge>)}
                  <Button size="xs" variant="ghost" iconOnly icon={<Trash2 />} disabled={ro} aria-label="Remove script" onClick={async () => { if (await confirm({ title: 'Remove script?', desc: `The ${p?.name ?? ''} script will be removed from this draft.`, danger: true, confirmLabel: 'Remove' })) setB({ scripts: sc.filter((x) => x.id !== s.id) }); }} />
                </div>
              </div>
              <div className="grid g-3">
                <Field label="Opening"><textarea className="textarea" value={s.opening} disabled={ro} onChange={(e) => upd(s.id, { opening: e.target.value })} /></Field>
                <Field label="Pitch"><textarea className="textarea" value={s.pitch} disabled={ro} onChange={(e) => upd(s.id, { pitch: e.target.value })} /></Field>
                <Field label="Closing"><textarea className="textarea" value={s.closing} disabled={ro} onChange={(e) => upd(s.id, { closing: e.target.value })} /></Field>
              </div>
              {p && /£\d+/.test(s.pitch) && !s.pitch.includes(`£${p.monthlyPrice}`) && <div className="banner warn mt-8"><AlertTriangle />Pitch quotes a price that does not match the approved price of £{p.monthlyPrice}/month.</div>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ---------------- 7 Knowledge base ---------------- */
export function Knowledge({ draft, setB, ro }: SectionProps) {
  const { products, offers } = useApp(); const nav = useNavigate(); const confirm = useConfirm();
  const [cat, setCat] = useState<KbCategory | ''>('');
  const [edit, setEdit] = useState<KbEntry | null>(null);
  const derived = useMemo(() => derivedKb(products, offers), [products, offers]);
  const excluded = new Set(draft.builder.kbExcluded);
  const all = [...derived.filter((d) => !excluded.has(d.id)).map((d) => ({ ...d, custom: false })), ...draft.builder.kbCustom.map((c) => ({ ...c, custom: true, source: 'custom' as const, refId: '' }))];
  const view = all.filter((e) => !cat || e.category === cat);
  const pending = all.filter((e) => !e.approved).length; const stale = all.filter((e) => isStale(e.updatedAt)).length;
  const save = (e: KbEntry) => {
    const exists = draft.builder.kbCustom.some((x) => x.id === e.id);
    setB({ kbCustom: exists ? draft.builder.kbCustom.map((x) => (x.id === e.id ? e : x)) : [...draft.builder.kbCustom, e] });
    setEdit(null);
  };
  return (
    <Card title="Product knowledge base" sub={`${all.length} entries · ${pending} pending review · ${stale} older than 30 days`}
      actions={<Button size="sm" icon={<Plus />} disabled={ro} onClick={() => setEdit({ id: uid('kb'), category: 'FAQs', title: '', content: '', approved: false, updatedAt: new Date().toISOString() })}>Add entry</Button>}>
      <div className="banner info" style={{ marginBottom: 12 }}><ShieldCheck />The AI only uses approved, up-to-date information. Pending entries and entries older than 30 days are excluded from live calls until reviewed.</div>
      <div className="row-wrap" style={{ marginBottom: 12 }}>
        <button className={`tag ${!cat ? 'strong' : ''}`} style={{ cursor: 'pointer', borderColor: !cat ? 'var(--ink)' : undefined }} onClick={() => setCat('')}>All <span className="mono muted">{all.length}</span></button>
        {KB_CATEGORIES.map((c) => { const n = all.filter((e) => e.category === c).length; return <button key={c} className="tag" style={{ cursor: 'pointer', borderColor: cat === c ? 'var(--ink)' : undefined, color: cat === c ? 'var(--ink)' : undefined }} onClick={() => setCat(c)}>{c} <span className="mono muted">{n}</span></button>; })}
      </div>
      {(cat ? [cat] : KB_CATEGORIES).map((c) => {
        const items = view.filter((e) => e.category === c);
        if (!items.length) return null;
        return (
          <div key={c} style={{ marginBottom: 12 }}>
            <div className="label" style={{ margin: '8px 0 4px' }}>{c}</div>
            <div className="list">
              {items.map((e) => {
                const old = isStale(e.updatedAt);
                return (
                  <div key={e.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                    <div className="grow">
                      <div className="row-wrap"><span className="cell-primary">{e.title}</span>
                        {e.approved ? <Badge tone="green" dot>Approved</Badge> : <Badge tone="amber" dot>Pending review</Badge>}
                        {old && <Badge tone="orange"><Clock size={11} />Older than 30 days</Badge>}
                        <Badge tone="outline">{e.custom ? 'Custom' : e.source === 'offer' ? 'From offers' : 'From catalogue'}</Badge>
                      </div>
                      <div className="small subtle mt-4">{e.content}</div>
                      <div className="xs muted mt-4">Last updated {fmtDate(e.updatedAt)}{fmtRelative(e.updatedAt) !== fmtDate(e.updatedAt) ? ` · ${fmtRelative(e.updatedAt)}` : ''}</div>
                    </div>
                    <div className="row gap-4">
                      {e.custom ? (<>
                        <Button size="xs" variant="ghost" iconOnly icon={<Pencil />} disabled={ro} aria-label="Edit entry" onClick={() => setEdit(draft.builder.kbCustom.find((x) => x.id === e.id) ?? null)} />
                        <Button size="xs" variant="ghost" iconOnly icon={<Trash2 />} disabled={ro} aria-label="Delete entry" onClick={async () => { if (await confirm({ title: 'Delete knowledge entry?', desc: `“${e.title}” will be removed from this agent's knowledge base.`, danger: true, confirmLabel: 'Delete' })) setB({ kbCustom: draft.builder.kbCustom.filter((x) => x.id !== e.id) }); }} />
                      </>) : (<>
                        <Button size="xs" variant="ghost" iconOnly icon={<ExternalLink />} aria-label="Edit in Products" title="Edit in Products" onClick={() => nav(e.source === 'offer' ? '/products?tab=offers' : `/products?product=${e.refId}`)} />
                        <Button size="xs" variant="ghost" iconOnly icon={<Trash2 />} disabled={ro} aria-label="Exclude entry" title="Exclude from this agent" onClick={() => setB({ kbExcluded: [...draft.builder.kbExcluded, e.id] })} />
                      </>)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {!view.length && <EmptyState title="No entries in this category" />}
      {excluded.size > 0 && <div className="row small muted mt-8">{excluded.size} catalogue entr{excluded.size === 1 ? 'y' : 'ies'} excluded from this agent.<Button size="xs" variant="link" icon={<RotateCcw size={12} />} disabled={ro} onClick={() => setB({ kbExcluded: [] })}>Restore all</Button></div>}
      {edit && <KbModal entry={edit} onClose={() => setEdit(null)} onSave={save} />}
    </Card>
  );
}
function KbModal({ entry, onClose, onSave }: { entry: KbEntry; onClose: () => void; onSave: (e: KbEntry) => void }) {
  const [e, setE] = useState(entry); const [tried, setTried] = useState(false);
  const err = { title: !e.title.trim() && 'Title is required', content: e.content.trim().length < 10 && 'Add at least 10 characters' };
  const submit = () => { setTried(true); if (err.title || err.content) return; onSave({ ...e, updatedAt: new Date().toISOString() }); };
  return (
    <Modal open onClose={onClose} title={entry.title ? 'Edit knowledge entry' : 'Add knowledge entry'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Save entry</Button></>}>
      <div className="col gap-12">
        <Field label="Category"><select className="select" value={e.category} onChange={(x) => setE({ ...e, category: x.target.value as KbCategory })}>{KB_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Title" required error={tried && err.title}><input className="input" value={e.title} onChange={(x) => setE({ ...e, title: x.target.value })} /></Field>
        <Field label="Content" required error={tried && err.content}><textarea className="textarea" value={e.content} onChange={(x) => setE({ ...e, content: x.target.value })} /></Field>
        <SettingRow title="Approved for use on calls" desc="Only approved entries are used by the agent."><Switch on={e.approved} onChange={(v) => setE({ ...e, approved: v })} label="Approved" /></SettingRow>
      </div>
    </Modal>
  );
}

/* ---------------- 8 Objections ---------------- */
export function Objections({ draft, set, ro }: SectionProps) {
  const o = draft.objections;
  const upd = (i: number, p: Partial<Draft['objections'][number]>) => set({ objections: o.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  return (
    <Card title="Objection handling" sub="When the customer raises a trigger, the agent follows the matching response guidance" actions={<Button size="sm" icon={<Plus />} disabled={ro} onClick={() => set({ objections: [...o, { trigger: '', response: '' }] })}>Add objection</Button>}>
      <div className="col gap-12">
        {o.map((x, i) => (
          <div key={i} className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,2fr) auto', alignItems: 'start', gap: 8 }}>
            <Field label={i === 0 ? 'Trigger' : undefined} error={!x.trigger.trim() && 'Required'}><input className="input sm" value={x.trigger} disabled={ro} placeholder="e.g. Too expensive" onChange={(e) => upd(i, { trigger: e.target.value })} /></Field>
            <Field label={i === 0 ? 'Response guidance' : undefined}><textarea className="textarea" style={{ minHeight: 56 }} value={x.response} disabled={ro} onChange={(e) => upd(i, { response: e.target.value })} /></Field>
            <Button size="sm" variant="ghost" iconOnly icon={<Trash2 />} disabled={ro} style={{ marginTop: i === 0 ? 26 : 0 }} aria-label="Remove objection" onClick={() => set({ objections: o.filter((_, j) => j !== i) })} />
          </div>
        ))}
        {!o.length && <EmptyState title="No objection responses" desc="Add common objections so the agent can respond consistently." />}
      </div>
    </Card>
  );
}

/* ---------------- 9 Qualification ---------------- */
export function Qualification({ draft, setB, ro }: SectionProps) {
  const c = draft.builder.criteria;
  const enabled = c.filter((x) => x.enabled);
  const total = enabled.reduce((s, x) => s + x.weight, 0);
  const setWeight = (key: string, w: number) => {
    // keep the enabled weights summing to 100 by rebalancing the others proportionally
    const others = enabled.filter((x) => x.key !== key);
    const rest = 100 - w; const oSum = others.reduce((s, x) => s + x.weight, 0);
    let acc = 0;
    const next = c.map((x) => {
      if (x.key === key) return { ...x, weight: w };
      if (!x.enabled) return x;
      const i = others.findIndex((o) => o.key === x.key);
      const nw = i === others.length - 1 ? rest - acc : Math.round(oSum ? (x.weight / oSum) * rest : rest / others.length);
      acc += nw; return { ...x, weight: Math.max(0, nw) };
    });
    setB({ criteria: next });
  };
  const toggle = (key: string, on: boolean) => {
    const next = c.map((x) => (x.key === key ? { ...x, enabled: on, weight: on ? 0 : x.weight } : x));
    const en = next.filter((x) => x.enabled); const n = en.length;
    setB({ criteria: next.map((x) => (x.enabled ? { ...x, weight: n ? Math.floor(100 / n) + (en[0].key === x.key ? 100 % n : 0) : 0 } : x)) });
  };
  return (
    <Card title="Qualification criteria" sub="BANT-style scoring. Enabled weights always total 100.">
      <div className="col">
        {c.map((x) => (
          <div key={x.key} className="setting-row" style={{ alignItems: 'center' }}>
            <Switch on={x.enabled} onChange={(v) => toggle(x.key, v)} disabled={ro || (x.enabled && enabled.length === 1)} label={x.label} />
            <div className="grow"><div className="title">{x.label}</div><div className="desc">{x.desc}</div></div>
            <div style={{ width: 220 }} className="row">
              <input type="range" className="range" min={0} max={100} value={x.enabled ? x.weight : 0} disabled={ro || !x.enabled || enabled.length === 1} onChange={(e) => setWeight(x.key, +e.target.value)} aria-label={`${x.label} weight`} />
              <span className="mono small" style={{ width: 36, textAlign: 'right' }}>{x.enabled ? x.weight : '—'}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="row between small mt-8"><span className="muted">Total weight</span><Badge tone={total === 100 ? 'green' : 'red'}>{total} / 100</Badge></div>
      <div className="divider" />
      <div className="grid g-3">
        <Field label="Minimum score to qualify" hint="Below this, the lead is not handed over"><input type="number" className="input" min={0} max={100} value={draft.builder.minScore} disabled={ro} onChange={(e) => setB({ minScore: Math.max(0, Math.min(100, +e.target.value)) })} /></Field>
        <Field label="Warm threshold" error={draft.builder.warmThreshold >= draft.builder.hotThreshold && 'Must be below hot threshold'}><input type="number" className="input" min={0} max={100} value={draft.builder.warmThreshold} disabled={ro} onChange={(e) => setB({ warmThreshold: Math.max(0, Math.min(100, +e.target.value)) })} /></Field>
        <Field label="Hot threshold"><input type="number" className="input" min={0} max={100} value={draft.builder.hotThreshold} disabled={ro} onChange={(e) => setB({ hotThreshold: Math.max(0, Math.min(100, +e.target.value)) })} /></Field>
      </div>
      <div className="mt-16">
        <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ width: `${draft.builder.warmThreshold}%`, background: 'var(--ash)' }} title="Cold" />
          <div style={{ width: `${Math.max(0, draft.builder.hotThreshold - draft.builder.warmThreshold)}%`, background: '#F59E0B' }} title="Warm" />
          <div style={{ flex: 1, background: 'var(--tangerine)' }} title="Hot" />
        </div>
        <div className="row between xs muted mt-4"><span>Cold 0–{draft.builder.warmThreshold - 1}</span><span>Warm {draft.builder.warmThreshold}–{draft.builder.hotThreshold - 1}</span><span>Hot {draft.builder.hotThreshold}–100</span></div>
      </div>
    </Card>
  );
}

/* ---------------- 10 Escalation ---------------- */
export function Escalation({ draft, set, ro }: SectionProps) {
  const [v, setV] = useState('');
  const e = draft.escalation;
  return (
    <Card title="Escalation rules" sub="When any enabled rule fires, the agent offers a warm transfer to a human specialist">
      <div>
        {e.map((r, i) => (
          <div key={i} className="setting-row">
            <div className="grow"><input className="input sm soft" value={r.rule} disabled={ro} onChange={(x) => set({ escalation: e.map((y, j) => (j === i ? { ...y, rule: x.target.value } : y)) })} aria-label="Rule" /></div>
            <Switch on={r.enabled} disabled={ro} onChange={(on) => set({ escalation: e.map((y, j) => (j === i ? { ...y, enabled: on } : y)) })} label={r.rule} />
            <Button size="xs" variant="ghost" iconOnly icon={<Trash2 />} disabled={ro} aria-label="Remove rule" onClick={() => set({ escalation: e.filter((_, j) => j !== i) })} />
          </div>
        ))}
      </div>
      {!e.some((r) => /person|human/i.test(r.rule) && r.enabled) && <div className="banner warn mt-8"><AlertTriangle />No enabled rule handles “customer asks for a person”. This is required before publishing.</div>}
      <form className="row mt-12" onSubmit={(x) => { x.preventDefault(); if (v.trim()) { set({ escalation: [...e, { rule: v.trim(), enabled: true }] }); setV(''); } }}>
        <input className="input sm soft" value={v} disabled={ro} onChange={(x) => setV(x.target.value)} placeholder="Add a rule, e.g. Customer mentions cancelling their contract" />
        <Button size="sm" icon={<Plus />} disabled={ro || !v.trim()} onClick={() => { if (v.trim()) { set({ escalation: [...e, { rule: v.trim(), enabled: true }] }); setV(''); } }}>Add rule</Button>
      </form>
    </Card>
  );
}

/* ---------------- 11 Ending ---------------- */
export function Ending({ draft, setB, ro }: SectionProps) {
  const en = draft.builder.ending;
  const s = (p: Partial<Builder['ending']>) => setB({ ending: { ...en, ...p } });
  return (
    <Card title="Call ending behaviour" sub="How calls close, and what happens afterwards">
      <SettingRow title="Opt-out handling" desc="When a customer asks not to be called again.">
        <Segmented value={en.optOut} onChange={(v) => !ro && s({ optOut: v })} options={['End call immediately', 'Confirm then end']} />
      </SettingRow>
      <SettingRow title="Add opt-outs to suppression list" desc="Writes the number to the do-not-call list used by every campaign.">
        <Switch on={en.suppress} onChange={(v) => s({ suppress: v })} disabled={ro} label="Add to suppression list" />
      </SettingRow>
      <SettingRow title="Voicemail policy" desc="What to do when the call reaches voicemail.">
        <select className="select sm" style={{ width: 180 }} value={en.voicemail} disabled={ro} onChange={(e) => s({ voicemail: e.target.value as Builder['ending']['voicemail'] })}>{['Hang up', 'Leave message', 'Send SMS instead'].map((v) => <option key={v}>{v}</option>)}</select>
      </SettingRow>
      {en.voicemail !== 'Hang up' && (
        <div style={{ padding: '12px 0', borderBottom: '1px solid var(--ash)' }}>
          <Field label={en.voicemail === 'Leave message' ? 'Voicemail message' : 'SMS text'} hint="Never include prices or personal account details"><textarea className="textarea" value={en.voicemailMessage} disabled={ro} onChange={(e) => s({ voicemailMessage: e.target.value })} /></Field>
        </div>
      )}
      <SettingRow title="Maximum call duration" desc="The agent wraps up politely and offers a callback at the limit.">
        <div className="row"><input type="number" className="input sm" style={{ width: 80 }} min={2} max={30} value={en.maxDurationMin} disabled={ro} onChange={(e) => s({ maxDurationMin: Math.max(2, Math.min(30, +e.target.value)) })} /><span className="small muted">min</span></div>
      </SettingRow>
      <SettingRow title="Generate AI summary" desc="Summary, outcome, objections and next steps after every connected call.">
        <Switch on={en.summary} onChange={(v) => s({ summary: v })} disabled={ro} label="Generate summary" />
      </SettingRow>
      <SettingRow title="CRM write-back" desc="Push outcome, summary and qualification score to the lead record.">
        <div className="row">
          <select className="select sm" style={{ width: 170 }} value={en.crmTarget} disabled={ro || !en.crmWriteBack} onChange={(e) => s({ crmTarget: e.target.value })}>{['Salesforce', 'Microsoft Dynamics 365', 'HubSpot'].map((v) => <option key={v}>{v}</option>)}</select>
          <Switch on={en.crmWriteBack} onChange={(v) => s({ crmWriteBack: v })} disabled={ro} label="CRM write-back" />
        </div>
      </SettingRow>
    </Card>
  );
}

/* ---------------- 13 Versions ---------------- */
export function Versions({ agent, draft, canPublish, onRestore }: { agent: AgentX; draft: Draft; canPublish: boolean; onRestore: (version: string) => void }) {
  const confirm = useConfirm();
  const snaps = agent.builder?.snapshots ?? {};
  const vs = [...versionsOf(agent)].sort((a, b) => +new Date(b.at) - +new Date(a.at));
  const SEED_DIFF: Record<string, string[]> = { 'Updated Winter Switch pricing and objection responses': ['Scripts', 'Objections', 'Knowledge base'], 'Improved callback scheduling flow': ['Flow', 'Call ending'], 'Added business qualification criteria': ['Qualification'], 'Draft: shorter introduction, new opt-out phrasing': ['Instructions', 'Call ending'] };
  return (
    <Card flush title="Version history" sub={`Current published version ${agent.version}`}>
      <div className="table-wrap">
        <table className="table table-responsive">
          <thead><tr><th>Version</th><th>Status</th><th>Saved</th><th>Author</th><th>Change note</th><th>Diff summary</th><th /></tr></thead>
          <tbody>
            {vs.map((v, i) => {
              const prev = vs.slice(i + 1).find((x) => snaps[x.version]);
              const diff = snaps[v.version] && prev ? diffSummary(snaps[prev.version], snaps[v.version]) : SEED_DIFF[v.note] ?? (snaps[v.version] ? ['Initial snapshot'] : ['Draft changes']);
              const vsCurrent = snaps[v.version] ? diffSummary(snaps[v.version], draft) : [];
              const isCurrent = v.status === 'Published';
              return (
                <tr key={v.version + v.at}>
                  <td data-label="Version"><span className="mono strong">{v.version}</span></td>
                  <td data-label="Status"><StatusBadge status={v.status} /></td>
                  <td data-label="Saved"><span className="mono small">{fmtDateTime(v.at)}</span></td>
                  <td data-label="Author" className="small">{v.author}</td>
                  <td data-label="Change note" style={{ whiteSpace: 'normal', minWidth: 200 }} className="small">{v.note}</td>
                  <td data-label="Diff summary" style={{ whiteSpace: 'normal' }}><div className="row-wrap gap-4">{diff.length ? diff.map((d) => <Badge key={d} tone="outline">{d}</Badge>) : <span className="xs muted">No config changes</span>}</div></td>
                  <td data-label="">
                    {!isCurrent && v.status !== 'Draft' && (
                      <Button size="xs" icon={<RotateCcw />} disabled={!canPublish} title={canPublish ? undefined : 'Requires agents.publish permission'}
                        onClick={async () => {
                          const ok = await confirm({ title: `Roll back to ${v.version}?`, confirmLabel: 'Restore and publish', desc: <>{v.version} becomes the live version and {agent.version} is archived. {snaps[v.version] ? `The draft will be replaced with this version's configuration${vsCurrent.length ? ` (changes: ${vsCurrent.join(', ')})` : ''}.` : 'No configuration snapshot is stored for this seeded version, so only the version pointer changes.'}</> });
                          if (ok) onRestore(v.version);
                        }}>Restore</Button>
                    )}
                    {isCurrent && <Badge tone="green">Current</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ---------------- 14 Publishing ---------------- */
export interface CheckItem { label: string; ok: boolean; detail: string; blocking: boolean }
export function Publishing({ draft, setB, ro, checklist, agentId }: SectionProps & { checklist: CheckItem[]; agentId: string }) {
  const { campaigns } = useApp(); const nav = useNavigate();
  const camps = campaigns.filter((c) => c.agentId === agentId);
  const split = draft.builder.trafficSplit;
  return (
    <div className="col gap-16">
      <Card title="Publishing controls" sub="Choose where the next published version runs">
        <SettingRow title="Environment" desc="Draft is private, Testing runs only simulated calls, Live is used by active campaigns.">
          <Segmented value={draft.builder.environment} onChange={(v) => !ro && setB({ environment: v })} options={['Draft', 'Testing', 'Live']} />
        </SettingRow>
        <div style={{ padding: '14px 0' }}>
          <Slider label="A/B traffic split — this version" value={split} min={0} max={100} step={5} onChange={(v) => setB({ trafficSplit: v })} fmt={(v) => `${v}%`} disabled={ro || draft.builder.environment !== 'Live'} />
          <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', marginTop: 8 }}>
            <div style={{ width: `${split}%`, background: draft.color }} /><div style={{ flex: 1, background: 'var(--ash)' }} />
          </div>
          <div className="row between xs muted mt-4"><span>New version · {split}%</span><span>Current published version · {100 - split}%</span></div>
          {draft.builder.environment !== 'Live' && <div className="xs muted mt-4">Traffic split applies to the Live environment only.</div>}
        </div>
      </Card>
      <div className="grid g-2">
        <Card title="Pre-publish checklist" sub={`${checklist.filter((c) => c.ok).length} of ${checklist.length} checks passed`}>
          <div className="col gap-12">
            {checklist.map((c) => (
              <div key={c.label} className="row" style={{ alignItems: 'flex-start' }}>
                {c.ok ? <CheckCircle2 size={16} className="green" style={{ marginTop: 2, flexShrink: 0 }} /> : c.blocking ? <XCircle size={16} className="red" style={{ marginTop: 2, flexShrink: 0 }} /> : <AlertTriangle size={16} className="orange" style={{ marginTop: 2, flexShrink: 0 }} />}
                <div className="grow"><div className="small medium" style={{ color: 'var(--ink)' }}>{c.label}{!c.ok && c.blocking && <span className="xs red"> · blocks publishing</span>}</div><div className="xs muted">{c.detail}</div></div>
              </div>
            ))}
          </div>
        </Card>
        <Card flush title="Campaigns using this agent" sub={`${camps.length} campaign${camps.length === 1 ? '' : 's'} will pick up the published version`}>
          <div style={{ padding: '0 16px 8px' }} className="list">
            {camps.map((c) => (
              <div key={c.id} className="list-item clickable" onClick={() => nav(`/campaigns/${c.id}`)}>
                <div className="grow"><div className="cell-primary truncate">{c.name}</div><div className="cell-sub mono">{c.id} · {c.segment}</div></div>
                <StatusBadge status={c.status} />
              </div>
            ))}
            {!camps.length && <EmptyState title="Not assigned to any campaign" desc="Assign this agent in the campaign wizard." />}
          </div>
        </Card>
      </div>
    </div>
  );
}
