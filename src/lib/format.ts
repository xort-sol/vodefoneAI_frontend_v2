import { DAY, NOW, startOfDay } from '../data/seed';

export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-GB');
export const fmtCompact = (n: number) =>
  Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
    : Math.abs(n) >= 1e4 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k'
      : fmtInt(n);
export const fmtGBP = (n: number, dp = 0) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
export const fmtPct = (n: number, dp = 1) => `${n.toFixed(dp)}%`;
export const fmtDur = (s: number) => { const m = Math.floor(s / 60); const r = Math.round(s % 60); return `${m}:${String(r).padStart(2, '0')}`; };
export const fmtDurLong = (s: number) => { const m = Math.floor(s / 60); const r = Math.round(s % 60); return m ? `${m}m ${r}s` : `${r}s`; };
export const fmtMinutes = (m: number) => m >= 600 ? `${fmtCompact(m)} min` : `${fmtInt(m)} min`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const fmtDate = (iso: string | Date) => { const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
export const fmtDateShort = (iso: string | Date) => { const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
export const fmtTime = (iso: string | Date) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
export const fmtDateTime = (iso: string | Date) => `${fmtDateShort(iso)}, ${fmtTime(iso)}`;
export const fmtWeekday = (iso: string | Date) => WD[new Date(iso).getDay()];
export { MONTHS, WD };

export function fmtRelative(iso: string | Date | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso); const diff = NOW.getTime() - d.getTime();
  const abs = Math.abs(diff); const future = diff < 0;
  const m = Math.round(abs / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return future ? `in ${m}m` : `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return future ? `in ${h}h` : `${h}h ago`;
  const dd = Math.round((startOfDay(NOW).getTime() - startOfDay(d).getTime()) / DAY);
  if (dd === 1) return 'yesterday';
  if (dd === -1) return 'tomorrow';
  if (Math.abs(dd) < 7) return future ? `in ${-dd}d` : `${dd}d ago`;
  return fmtDate(d);
}

export const pctChange = (cur: number, prev: number) => (prev === 0 ? (cur === 0 ? 0 : 100) : ((cur - prev) / prev) * 100);

export function downloadFile(filename: string, content: string, mime = 'text/csv') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function toCSV(rows: Record<string, unknown>[]) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
}
