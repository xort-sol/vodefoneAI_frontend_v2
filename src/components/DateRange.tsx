import { useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { Button, Menu, MenuItem } from './ui';
import { makeRange, RANGE_LABELS, type Range, type RangeKey } from '../lib/metrics';

export function useRangeState(initial: RangeKey = '30d') {
  const [key, setKey] = useState<RangeKey>(initial);
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const range = makeRange(key, custom);
  return { range, key, setKey, custom, setCustom };
}

export function DateRangePicker({ state, exclude = [] }: { state: ReturnType<typeof useRangeState>; exclude?: RangeKey[] }) {
  const { range, setKey, custom, setCustom } = state;
  const [draft, setDraft] = useState(custom);
  const keys = (Object.keys(RANGE_LABELS) as RangeKey[]).filter((k) => k !== 'custom' && !exclude.includes(k));
  return (
    <Menu width={260} trigger={(t) => <Button size="sm" icon={<Calendar />} iconRight={<ChevronDown size={13} />} onClick={t}>{range.label}</Button>}>
      {(close) => (
        <>
          <div className="menu-label label">Quick ranges</div>
          {keys.map((k) => <MenuItem key={k} onClick={() => { setKey(k); close(); }}>{RANGE_LABELS[k]}{range.key === k && <span className="blue" style={{ marginLeft: 'auto' }}>●</span>}</MenuItem>)}
          <div className="menu-sep" />
          <div className="menu-label label">Custom range</div>
          <div className="col" style={{ padding: '4px 10px 10px' }}>
            <input type="date" className="input sm soft" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} aria-label="From date" />
            <input type="date" className="input sm soft" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} aria-label="To date" />
            <Button size="sm" variant="primary" disabled={!draft.from || !draft.to || draft.from > draft.to} onClick={() => { setCustom(draft); setKey('custom'); close(); }}>Apply range</Button>
          </div>
        </>
      )}
    </Menu>
  );
}
export type { Range };
