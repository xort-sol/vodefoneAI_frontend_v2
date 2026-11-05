import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  FlaskConical, Inbox, Pause, Play, Search, X, Volume2, Rewind, FastForward, Download,
} from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, AreaChart, Area } from 'recharts';
import { fmtDur } from '../lib/format';
import type { TranscriptLine } from '../data/types';

/* ---------------- Primitives ---------------- */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid' | 'link';
  size?: 'md' | 'sm' | 'xs'; icon?: React.ReactNode; iconRight?: React.ReactNode; iconOnly?: boolean;
};
export function Button({ variant = 'secondary', size = 'md', icon, iconRight, iconOnly, className = '', children, ...rest }: BtnProps) {
  const cls = ['btn', variant !== 'secondary' && variant, size !== 'md' && size, iconOnly && 'icon', className].filter(Boolean).join(' ');
  return <button type="button" className={cls} {...rest}>{icon}{children}{iconRight}</button>;
}

export type Tone = 'green' | 'blue' | 'orange' | 'amber' | 'red' | 'purple' | 'neutral' | 'outline';
export function Badge({ tone = 'neutral', dot, live, children, className = '' }: { tone?: Tone; dot?: boolean; live?: boolean; children: React.ReactNode; className?: string }) {
  return <span className={`badge ${tone} ${live ? 'live' : ''} ${className}`}>{dot && <span className="dot" />}{children}</span>;
}

const STATUS_TONE: Record<string, Tone> = {
  // generic
  Active: 'blue', Live: 'green', Completed: 'green', Converted: 'green', Available: 'green', Published: 'green', Granted: 'green', Confirmed: 'green',
  Paused: 'amber', Pending: 'amber', Scheduled: 'blue', Draft: 'neutral', Stopped: 'red', Testing: 'purple', Archived: 'neutral',
  Failed: 'red', 'Do not call': 'red', Withdrawn: 'red', Cancelled: 'red', 'No-show': 'red', Rejected: 'red', Expired: 'neutral', Retired: 'neutral',
  Hot: 'orange', Warm: 'amber', Cold: 'blue', New: 'neutral', Queued: 'neutral', Contacted: 'blue',
  'Not interested': 'neutral', Unreachable: 'neutral', 'Callback requested': 'purple', Rescheduled: 'purple',
  Qualified: 'green', Interested: 'blue', 'No answer': 'neutral', Voicemail: 'neutral', Busy: 'neutral', 'Opted out': 'red', 'Transferred to human': 'purple',
  Positive: 'green', Neutral: 'neutral', Negative: 'red', High: 'orange', Medium: 'amber', Low: 'neutral',
  Processing: 'amber', 'Not recorded': 'neutral', Limited: 'amber', Received: 'neutral', 'In review': 'amber', Approved: 'blue',
  Busy_: 'amber', Away: 'amber', Offline: 'neutral',
};
export function StatusBadge({ status, dot = true }: { status: string; dot?: boolean }) {
  const tone = STATUS_TONE[status] ?? 'neutral';
  return <Badge tone={tone} dot={dot} live={status === 'Live'}>{status}</Badge>;
}
export function SimBadge({ label = 'Simulated' }: { label?: string }) {
  return <span className="sim-badge" title="Demonstration data — no real calls are placed"><FlaskConical size={11} />{label}</span>;
}

export function Card({ title, sub, actions, children, className = '', flush, onClick, style }: {
  title?: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode; className?: string; flush?: boolean; onClick?: () => void; style?: React.CSSProperties;
}) {
  return (
    <div className={`card ${flush ? 'flush' : ''} ${onClick ? 'card-link' : ''} ${className}`} onClick={onClick} style={style}>
      {(title || actions) && (
        <div className="card-head">
          <div className="grow">
            {title && <div className="card-title">{title}</div>}
            {sub && <div className="card-sub">{sub}</div>}
          </div>
          {actions && <div className="row" onClick={(e) => e.stopPropagation()}>{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function PageHeader({ title, desc, actions, eyebrow }: { title: React.ReactNode; desc?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div className="grow">
        {eyebrow && <div className="row-wrap mt-4" style={{ marginBottom: 8 }}>{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {desc && <p className="page-desc">{desc}</p>}
      </div>
      {actions && <div className="row-wrap">{actions}</div>}
    </div>
  );
}

export function Avatar({ name, initials, size, color, agent }: { name?: string; initials?: string; size?: 'sm' | 'lg' | 'xl'; color?: string; agent?: boolean }) {
  const ini = initials ?? (name ?? '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const style = color ? { background: color, color: '#fff', borderColor: color } : undefined;
  return <span className={`avatar ${size ?? ''} ${agent ? 'agent' : ''}`} style={style} title={name}>{ini}</span>;
}

export function ScoreBar({ value, showValue = true }: { value: number; showValue?: boolean }) {
  const color = value >= 85 ? 'var(--tangerine)' : value >= 60 ? 'var(--green)' : value >= 35 ? 'var(--blue)' : 'var(--silver)';
  return (
    <span className="score">
      <span className="score-track"><span className="score-fill" style={{ width: `${value}%`, background: color, display: 'block' }} /></span>
      {showValue && <span className="mono tnum" style={{ color: 'var(--graphite)' }}>{value}</span>}
    </span>
  );
}

export function Progress({ value, color }: { value: number; color?: string }) {
  return <div className="progress"><div style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} /></div>;
}

export function EmptyState({ icon, title, desc, action }: { icon?: React.ReactNode; title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon ?? <Inbox size={18} />}</div>
      <div className="strong" style={{ fontSize: 14 }}>{title}</div>
      {desc && <div className="small mt-4">{desc}</div>}
      {action && <div className="mt-16">{action}</div>}
    </div>
  );
}

export function Delta({ value, invert, suffix = '%' }: { value: number; invert?: boolean; suffix?: string }) {
  const good = invert ? value < 0 : value > 0;
  const cls = Math.abs(value) < 0.05 ? 'flat' : good ? 'up' : 'down';
  return (
    <span className={`delta ${cls}`}>
      {value > 0 ? <ArrowUp size={12} /> : value < 0 ? <ArrowDown size={12} /> : null}
      {Math.abs(value).toFixed(1)}{suffix}
    </span>
  );
}

/* ---------------- KPI ---------------- */
export function Sparkline({ data, color = '#0A0A0A', area, height = 32 }: { data: number[]; color?: string; area?: boolean; height?: number }) {
  const d = data.map((v, i) => ({ i, v }));
  return (
    <div style={{ height, width: '100%' }}>
      <ResponsiveContainer>
        {area ? (
          <AreaChart data={d} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
            <defs><linearGradient id={`sg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity={0.14} /><stop offset="1" stopColor={color} stopOpacity={0} /></linearGradient></defs>
            <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#sg-${color.replace('#', '')})`} isAnimationActive={false} />
          </AreaChart>
        ) : (
          <LineChart data={d} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
            <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export function KpiCard({ label, value, delta, prevLabel, spark, sparkColor, onClick, icon, invert, hint }: {
  label: string; value: React.ReactNode; delta?: number; prevLabel?: React.ReactNode; spark?: number[]; sparkColor?: string; onClick?: () => void; icon?: React.ReactNode; invert?: boolean; hint?: React.ReactNode;
}) {
  return (
    <div className={`card kpi ${onClick ? 'card-link' : ''}`} onClick={onClick} role={onClick ? 'link' : undefined}>
      <div className="kpi-label">{icon}{label}{onClick && <ChevronRight size={13} style={{ marginLeft: 'auto', color: 'var(--silver)' }} />}</div>
      <div className="row between" style={{ alignItems: 'flex-end' }}>
        <div className="kpi-value">{value}</div>
        {spark && <div style={{ width: 84 }}><Sparkline data={spark} color={sparkColor} area /></div>}
      </div>
      <div className="kpi-foot">
        {delta !== undefined && <Delta value={delta} invert={invert} />}
        {prevLabel && <span className="truncate">{prevLabel}</span>}
        {hint}
      </div>
    </div>
  );
}

/* ---------------- Form controls ---------------- */
export function Field({ label, hint, error, children, required, className = '' }: { label?: React.ReactNode; hint?: React.ReactNode; error?: string | false; children: React.ReactNode; required?: boolean; className?: string }) {
  return (
    <label className={`field ${className}`} onClick={(e) => { if ((e.target as HTMLElement).tagName === 'LABEL') e.preventDefault(); }}>
      {label && <span className="field-label">{label}{required && <span className="red"> *</span>}</span>}
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}
export function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} style={disabled ? { opacity: 0.5 } : undefined} />;
}
export function SearchInput({ value, onChange, placeholder = 'Search…', width = 260 }: { value: string; onChange: (v: string) => void; placeholder?: string; width?: number | string }) {
  return (
    <div className="input-wrap" style={{ width, maxWidth: '100%' }}>
      <Search />
      <input className="input sm soft" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {value && <button className="btn ghost xs icon" style={{ position: 'absolute', right: 4 }} onClick={() => onChange('')} aria-label="Clear"><X size={12} /></button>}
    </div>
  );
}
export function FilterSelect({ value, onChange, options, label, width }: { value: string; onChange: (v: string) => void; options: (string | { value: string; label: string })[]; label: string; width?: number }) {
  return (
    <select className="select sm soft" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: width ?? 'auto', minWidth: 120 }} aria-label={label}>
      <option value="">{label}: All</option>
      {options.map((o) => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: (T | { value: T; label: React.ReactNode })[] }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value; const l = typeof o === 'string' ? o : o.label;
        return <button key={v} className={v === value ? 'on' : ''} onClick={() => onChange(v)} role="tab" aria-selected={v === value}>{l}</button>;
      })}
    </div>
  );
}
export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: React.ReactNode; count?: number; icon?: React.ReactNode }[] }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} className={`tab ${t.value === value ? 'on' : ''}`} onClick={() => onChange(t.value)} role="tab" aria-selected={t.value === value}>
          {t.icon}{t.label}{t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Overlays ---------------- */
export function Modal({ open, onClose, title, desc, children, footer, size }: { open: boolean; onClose: () => void; title: React.ReactNode; desc?: React.ReactNode; children?: React.ReactNode; footer?: React.ReactNode; size?: 'lg' | 'xl' }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size ?? ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div><div className="modal-title">{title}</div>{desc && <div className="small muted mt-4">{desc}</div>}</div>
          <Button variant="ghost" size="sm" iconOnly icon={<X />} onClick={onClose} aria-label="Close" />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
export function Drawer({ open, onClose, title, children, footer, width }: { open: boolean; onClose: () => void; title: React.ReactNode; children?: React.ReactNode; footer?: React.ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer" style={width ? { width } : undefined} role="dialog" aria-modal="true">
        <div className="drawer-head"><div className="strong grow" style={{ fontSize: 15 }}>{title}</div><Button variant="ghost" size="sm" iconOnly icon={<X />} onClick={onClose} aria-label="Close" /></div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </>
  );
}

interface ConfirmOpts { title: string; desc?: React.ReactNode; confirmLabel?: string; danger?: boolean; }
const ConfirmCtx = React.createContext<(o: ConfirmOpts) => Promise<boolean>>(() => Promise.resolve(false));
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [st, setSt] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = (o: ConfirmOpts) => new Promise<boolean>((resolve) => setSt({ ...o, resolve }));
  const close = (v: boolean) => { st?.resolve(v); setSt(null); };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={!!st} onClose={() => close(false)} title={st?.title} footer={<>
        <Button onClick={() => close(false)}>Cancel</Button>
        <Button variant={st?.danger ? 'danger-solid' : 'primary'} onClick={() => close(true)}>{st?.confirmLabel ?? 'Confirm'}</Button>
      </>}>
        <div className="subtle">{st?.desc}</div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => React.useContext(ConfirmCtx);

export function Menu({ trigger, children, align = 'right', width }: { trigger: (toggle: () => void, open: boolean) => React.ReactNode; children: (close: () => void) => React.ReactNode; align?: 'left' | 'right'; width?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }} onClick={(e) => e.stopPropagation()}>
      {trigger(() => setOpen((o) => !o), open)}
      {open && <div className="menu" style={{ top: 'calc(100% + 4px)', [align]: 0, width }}>{children(() => setOpen(false))}</div>}
    </div>
  );
}
export function MenuItem({ icon, children, onClick, danger, disabled }: { icon?: React.ReactNode; children: React.ReactNode; onClick?: () => void; danger?: boolean; disabled?: boolean }) {
  return <button className={`menu-item ${danger ? 'danger' : ''}`} onClick={onClick} disabled={disabled} style={disabled ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}>{icon}{children}</button>;
}

/* ---------------- Data table ---------------- */
export interface Column<T> {
  key: string; header: React.ReactNode; render: (row: T) => React.ReactNode;
  sort?: (row: T) => string | number; align?: 'right' | 'left'; width?: number | string; hideBelow?: number;
}
export function DataTable<T>({
  rows, columns, rowKey, onRowClick, selectable, selected, onSelectedChange, pageSize = 12, toolbar, bulkActions, empty, initialSort, dense, footerExtra,
}: {
  rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void;
  selectable?: boolean; selected?: Set<string>; onSelectedChange?: (s: Set<string>) => void; pageSize?: number;
  toolbar?: React.ReactNode; bulkActions?: (ids: string[], clear: () => void) => React.ReactNode; empty?: React.ReactNode;
  initialSort?: { key: string; dir: 'asc' | 'desc' }; dense?: boolean; footerExtra?: React.ReactNode;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);
  const [ps, setPs] = useState(pageSize);
  const [innerSel, setInnerSel] = useState<Set<string>>(new Set());
  const sel = selected ?? innerSel; const setSel = onSelectedChange ?? setInnerSel;

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const f = col.sort;
    return [...rows].sort((a, b) => { const x = f(a), y = f(b); const r = x < y ? -1 : x > y ? 1 : 0; return sort.dir === 'asc' ? r : -r; });
  }, [rows, sort, columns]);
  const pages = Math.max(1, Math.ceil(sorted.length / ps));
  useEffect(() => { if (page >= pages) setPage(0); }, [pages, page]);
  const view = sorted.slice(page * ps, page * ps + ps);
  const allOnPage = view.length > 0 && view.every((r) => sel.has(rowKey(r)));
  const toggleAll = () => { const n = new Set(sel); if (allOnPage) view.forEach((r) => n.delete(rowKey(r))); else view.forEach((r) => n.add(rowKey(r))); setSel(n); };
  const toggle = (id: string) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };
  const clickSort = (c: Column<T>) => { if (!c.sort) return; setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'desc' })); };

  return (
    <div>
      {toolbar && <div className="table-toolbar">{toolbar}</div>}
      {selectable && sel.size > 0 && bulkActions && (
        <div className="bulk-bar">
          <span className="medium" style={{ fontSize: 13 }}>{sel.size} selected</span>
          <button className="btn xs" onClick={() => setSel(new Set(sorted.map(rowKey)))}>Select all {sorted.length}</button>
          <div className="row-wrap" style={{ marginLeft: 8 }}>{bulkActions([...sel], () => setSel(new Set()))}</div>
          <button className="btn xs" style={{ marginLeft: 'auto' }} onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}
      <div className="table-wrap">
        <table className="table table-responsive" style={dense ? { fontSize: 12.5 } : undefined}>
          <thead>
            <tr>
              {selectable && <th style={{ width: 36 }}><input type="checkbox" className="checkbox" checked={allOnPage} onChange={toggleAll} aria-label="Select page" /></th>}
              {columns.map((c) => (
                <th key={c.key} className={`${c.sort ? 'sortable' : ''} ${c.align === 'right' ? 'num' : ''}`} style={{ width: c.width }} onClick={() => clickSort(c)}>
                  <span className="row gap-4" style={{ display: 'inline-flex', justifyContent: c.align === 'right' ? 'flex-end' : undefined }}>
                    {c.header}
                    {c.sort && (sort?.key === c.key ? (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={11} style={{ opacity: 0.35 }} />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r) => {
              const id = rowKey(r);
              return (
                <tr key={id} className={`${onRowClick ? 'clickable' : ''} ${sel.has(id) ? 'selected' : ''}`} onClick={() => onRowClick?.(r)}>
                  {selectable && <td data-label="" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="checkbox" checked={sel.has(id)} onChange={() => toggle(id)} aria-label={`Select ${id}`} /></td>}
                  {columns.map((c) => <td key={c.key} data-label={typeof c.header === 'string' ? c.header : ''} className={c.align === 'right' ? 'num' : ''}>{c.render(r)}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
        {view.length === 0 && (empty ?? <EmptyState title="No results" desc="Try adjusting your search or filters." />)}
      </div>
      <div className="table-foot">
        <span className="tnum">{sorted.length === 0 ? '0 results' : `${page * ps + 1}–${Math.min(sorted.length, page * ps + ps)} of ${sorted.length.toLocaleString('en-GB')}`}</span>
        {footerExtra}
        <div className="row">
          <select className="select sm soft" style={{ width: 112, height: 28 }} value={ps} onChange={(e) => { setPs(+e.target.value); setPage(0); }} aria-label="Rows per page">
            {[10, 12, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
          <Button size="xs" iconOnly icon={<ChevronsLeft />} disabled={page === 0} onClick={() => setPage(0)} aria-label="First page" />
          <Button size="xs" iconOnly icon={<ChevronLeft />} disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page" />
          <span className="mono tnum">{page + 1} / {pages}</span>
          <Button size="xs" iconOnly icon={<ChevronRight />} disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page" />
          <Button size="xs" iconOnly icon={<ChevronsRight />} disabled={page >= pages - 1} onClick={() => setPage(pages - 1)} aria-label="Last page" />
        </div>
      </div>
    </div>
  );
}

/* ---------------- Audio player (simulated playback of a recording reference) ---------------- */
export function AudioPlayer({ duration, time, onTime, recordingId, available = true }: { duration: number; time: number; onTime: (t: number) => void; recordingId: string; available?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const bars = useMemo(() => {
    let s = 0; for (const ch of recordingId) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
    return Array.from({ length: 96 }, (_, i) => { s = (s * 1103515245 + 12345) >>> 0; return 18 + ((s >>> 8) % 70) * (0.6 + 0.4 * Math.sin(i / 5)); });
  }, [recordingId]);
  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => onTime(Math.min(duration, time + 0.25 * speed)), 250);
    if (time >= duration) setPlaying(false);
    return () => clearInterval(iv);
  }, [playing, time, duration, speed, onTime]);
  const frac = duration ? time / duration : 0;
  if (!available) return <div className="player"><Volume2 size={16} className="muted" /><span className="muted small">Recording not available for this call.</span></div>;
  return (
    <div className="player">
      <Button size="sm" iconOnly variant="ghost" icon={<Rewind />} onClick={() => onTime(Math.max(0, time - 10))} aria-label="Back 10 seconds" />
      <Button size="sm" iconOnly variant="primary" icon={playing ? <Pause /> : <Play />} onClick={() => { if (time >= duration) onTime(0); setPlaying(!playing); }} aria-label={playing ? 'Pause' : 'Play'} style={{ borderRadius: '50%', width: 34, height: 34 }} />
      <Button size="sm" iconOnly variant="ghost" icon={<FastForward />} onClick={() => onTime(Math.min(duration, time + 10))} aria-label="Forward 10 seconds" />
      <span className="mono tnum muted" style={{ width: 40 }}>{fmtDur(time)}</span>
      <div className="wave" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onTime(((e.clientX - r.left) / r.width) * duration); }} role="slider" aria-valuenow={Math.round(time)} aria-valuemax={duration} aria-label="Seek">
        {bars.map((h, i) => <span key={i} className={i / bars.length <= frac ? 'played' : ''} style={{ height: `${h}%` }} />)}
      </div>
      <span className="mono tnum muted" style={{ width: 40, textAlign: 'right' }}>{fmtDur(duration)}</span>
      <button className="btn xs desktop-only" onClick={() => setSpeed(speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1)} aria-label="Playback speed">{speed}×</button>
      <span className="desktop-only"><SimBadge label="Demo audio" /></span>
    </div>
  );
}

/* ---------------- Transcript ---------------- */
function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{highlight(text.slice(i + q.length), q)}</>;
}
const FLAG_LABEL: Record<string, [string, Tone]> = { objection: ['Objection', 'orange'], question: ['Question', 'blue'], intent: ['Buying intent', 'green'], pricing: ['Pricing', 'purple'], unanswered: ['Unanswered', 'red'] };
export function Transcript({ lines, agentName, customerName, query = '', activeTime, onSeek, agentColor }: { lines: TranscriptLine[]; agentName: string; customerName: string; query?: string; activeTime?: number; onSeek?: (t: number) => void; agentColor?: string }) {
  const activeIdx = activeTime === undefined ? -1 : lines.reduce((acc, l, i) => (l.t <= activeTime ? i : acc), -1);
  const filtered = query ? lines.filter((l) => l.text.toLowerCase().includes(query.toLowerCase())) : lines;
  if (!filtered.length) return <EmptyState title="No matching lines" desc={`Nothing in this transcript matches “${query}”.`} />;
  return (
    <div className="transcript">
      {filtered.map((l, i) => {
        const idx = lines.indexOf(l);
        if (l.speaker === 'System') return (
          <div key={i} className="row small muted" style={{ gap: 8 }}><span className="mono" style={{ width: 40 }}>{fmtDur(l.t)}</span><span className="badge outline">System</span><span>{highlight(l.text, query)}</span></div>
        );
        const isAI = l.speaker === 'AI';
        return (
          <div key={i} className={`msg ${isAI ? 'ai' : 'customer'} ${idx === activeIdx ? 'active' : ''}`}>
            <Avatar name={isAI ? agentName : customerName} size="sm" color={isAI ? agentColor ?? '#0A0A0A' : undefined} agent={isAI} />
            <div className="msg-body">
              <div className="msg-meta">
                <span className="msg-speaker">{isAI ? `${agentName} (AI)` : customerName}</span>
                <button className="mono btn link" style={{ color: 'var(--fog)', fontSize: 11.5 }} onClick={() => onSeek?.(l.t)}>{fmtDur(l.t)}</button>
                {l.flag && <Badge tone={FLAG_LABEL[l.flag][1]}>{FLAG_LABEL[l.flag][0]}</Badge>}
                {l.sentiment && !isAI && l.sentiment !== 'Neutral' && <Badge tone={l.sentiment === 'Positive' ? 'green' : 'red'}>{l.sentiment}</Badge>}
              </div>
              <div className="msg-text">{highlight(l.text, query)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Charts helpers ---------------- */
export const CHART = { ink: '#0A0A0A', blue: '#2563EB', green: '#16A34A', orange: '#EA580C', purple: '#7C3AED', grey: '#A3A3A3', light: '#D4D4D4', sapphire: '#1E40AF', grid: '#EFEFEF' };
export const SERIES = [CHART.ink, CHART.blue, CHART.green, CHART.orange, CHART.purple, CHART.grey];
export function ChartTip({ active, payload, label, fmt, labelFmt }: { active?: boolean; payload?: { name: string; value: number; color?: string; stroke?: string; fill?: string; payload?: Record<string, unknown> }[]; label?: string | number; fmt?: (v: number, name: string) => string; labelFmt?: (l: string | number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      {label !== undefined && <div className="strong" style={{ fontSize: 12 }}>{labelFmt ? labelFmt(label) : label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="tip-row"><span className="row gap-4"><span className="sw" style={{ background: p.color ?? p.stroke ?? p.fill }} /><span className="subtle">{p.name}</span></span><span className="mono tnum strong">{fmt ? fmt(p.value, p.name) : p.value.toLocaleString('en-GB')}</span></div>
      ))}
    </div>
  );
}
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return <div className="legend">{items.map((i) => <span key={i.label}><i style={{ background: i.color }} />{i.label}</span>)}</div>;
}

/* ---------------- Misc ---------------- */
export function KV({ items }: { items: [React.ReactNode, React.ReactNode][] }) {
  return <dl className="kv" style={{ margin: 0 }}>{items.map(([k, v], i) => <React.Fragment key={i}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>;
}
export function CheckList({ items }: { items: string[] }) {
  return <ul style={{ margin: 0, padding: 0, listStyle: 'none' }} className="col gap-4">{items.map((i) => <li key={i} className="row small" style={{ alignItems: 'flex-start' }}><Check size={14} className="green" style={{ marginTop: 2, flexShrink: 0 }} />{i}</li>)}</ul>;
}
export function ExportMenu({ onExport }: { onExport: (fmt: 'CSV' | 'Excel' | 'PDF') => void }) {
  return (
    <Menu trigger={(t) => <Button size="sm" icon={<Download />} onClick={t}>Export</Button>}>
      {(close) => (<>
        <MenuItem onClick={() => { onExport('CSV'); close(); }}>Export as CSV</MenuItem>
        <MenuItem onClick={() => { onExport('Excel'); close(); }}>Export as Excel (.xlsx)</MenuItem>
        <MenuItem onClick={() => { onExport('PDF'); close(); }}>Export as PDF</MenuItem>
      </>)}
    </Menu>
  );
}
