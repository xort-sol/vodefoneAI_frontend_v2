import { useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, Bot, CalendarClock, PoundSterling, SlidersHorizontal, Users, RotateCcw } from 'lucide-react';
import { useApp } from '../store/store';
import { Button, ExportMenu, FilterSelect, PageHeader, SimBadge, Tabs } from '../components/ui';
import { DateRangePicker, useRangeState } from '../components/DateRange';
import { inRange } from '../lib/metrics';
import { downloadFile, toCSV } from '../lib/format';
import { usePersisted, type AnalyticsCtx, type ExportRows, type SavedReport, type Schedule } from './analytics/common';
import CallsTab from './analytics/CallsTab';
import LeadsTab from './analytics/LeadsTab';
import AiTab from './analytics/AiTab';
import CostTab from './analytics/CostTab';
import BuilderTab from './analytics/BuilderTab';
import ScheduledTab, { SEED_SCHEDULES } from './analytics/ScheduledTab';

type TabKey = 'calls' | 'leads' | 'ai' | 'cost' | 'builder' | 'scheduled';
const TABS: { value: TabKey; label: string; icon: JSX.Element }[] = [
  { value: 'calls', label: 'Call analytics', icon: <BarChart3 size={14} /> },
  { value: 'leads', label: 'Lead analytics', icon: <Users size={14} /> },
  { value: 'ai', label: 'AI performance', icon: <Bot size={14} /> },
  { value: 'cost', label: 'Cost analytics', icon: <PoundSterling size={14} /> },
  { value: 'builder', label: 'Report builder', icon: <SlidersHorizontal size={14} /> },
  { value: 'scheduled', label: 'Scheduled reports', icon: <CalendarClock size={14} /> },
];

export default function Analytics() {
  const app = useApp();
  const [sp, setSp] = useSearchParams();
  const tabParam = sp.get('tab') as TabKey | null;
  const tab: TabKey = TABS.some((t) => t.value === tabParam) ? tabParam! : 'calls';
  const campaignId = sp.get('campaign') ?? '';
  const agentId = sp.get('agent') ?? '';
  const setParam = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: k !== 'tab' }); };

  const rs = useRangeState('30d');
  const exportRef = useRef<(() => ExportRows) | null>(null);
  const [saved, setSaved] = usePersisted<SavedReport[]>('vf-saved-reports', []);
  const [schedules, setSchedules] = usePersisted<Schedule[]>('vf-report-schedules', SEED_SCHEDULES);

  const scopeCalls = useMemo(() => app.calls.filter((c) => (!campaignId || c.campaignId === campaignId) && (!agentId || c.agentId === agentId)), [app.calls, campaignId, agentId]);
  const calls = useMemo(() => scopeCalls.filter((c) => inRange(c.startedAt, rs.range)), [scopeCalls, rs.range]);
  const ctx: AnalyticsCtx = { range: rs.range, calls, scopeCalls, campaignId, agentId, filtered: !!(campaignId || agentId), exportRef };

  const doExport = (fmt: 'CSV' | 'Excel' | 'PDF') => {
    const label = TABS.find((t) => t.value === tab)!.label;
    if (!app.can('reports.export')) { app.toast('Export not permitted', 'Your role does not include report exports.', 'error'); return; }
    if (fmt !== 'CSV') { app.audit(`Queued ${fmt} export`, label, 'Export'); app.toast(`${fmt} export queued`, `${label} · ${rs.range.label} — you’ll get a notification when it’s ready.`, 'info'); return; }
    const data = exportRef.current?.();
    if (!data || !data.rows.length) { app.toast('Nothing to export', 'No rows for the current filters.', 'error'); return; }
    downloadFile(`${data.name}-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(data.rows));
    app.audit('Exported analytics (CSV)', label, 'Export');
    app.toast('CSV downloaded', `${label} · ${data.rows.length} rows`);
  };

  const showGlobal = tab !== 'scheduled';
  return (
    <>
      <PageHeader
        title="Analytics & reports"
        desc="Calling, lead, AI agent and cost performance — build custom reports and schedule them to stakeholders."
        eyebrow={<SimBadge />}
        actions={<>
          {showGlobal && tab !== 'builder' && <DateRangePicker state={rs} />}
          <ExportMenu onExport={doExport} />
        </>}
      />

      <Tabs value={tab} onChange={(v) => setParam('tab', v)} tabs={TABS} />

      {showGlobal && (
        <div className="row-wrap" style={{ margin: '16px 0' }}>
          <FilterSelect label="Campaign" value={campaignId} onChange={(v) => setParam('campaign', v)} options={app.campaigns.map((c) => ({ value: c.id, label: c.name }))} />
          <FilterSelect label="Agent" value={agentId} onChange={(v) => setParam('agent', v)} options={app.agents.map((a) => ({ value: a.id, label: a.name }))} />
          {(campaignId || agentId) && <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={() => { const n = new URLSearchParams(sp); n.delete('campaign'); n.delete('agent'); setSp(n, { replace: true }); }}>Clear filters</Button>}
          <span className="xs muted desktop-only" style={{ marginLeft: 'auto' }}>{tab === 'builder' ? 'Filters apply to the report preview' : `${rs.range.label} · filters apply to every tab`}</span>
        </div>
      )}
      {!showGlobal && <div style={{ height: 16 }} />}

      {tab === 'calls' && <CallsTab ctx={ctx} />}
      {tab === 'leads' && <LeadsTab ctx={ctx} />}
      {tab === 'ai' && <AiTab ctx={ctx} />}
      {tab === 'cost' && <CostTab ctx={ctx} />}
      {tab === 'builder' && <BuilderTab ctx={ctx} saved={saved} setSaved={setSaved} />}
      {tab === 'scheduled' && <ScheduledTab ctx={ctx} saved={saved} schedules={schedules} setSchedules={setSchedules} />}
    </>
  );
}
