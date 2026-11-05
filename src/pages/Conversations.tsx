import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { HelpCircle, RotateCcw } from 'lucide-react';
import { useApp } from '../store/store';
import {
  Avatar, Badge, Button, DataTable, ExportMenu, FilterSelect, PageHeader, ScoreBar, SearchInput, SimBadge, StatusBadge, Switch, type Column,
} from '../components/ui';
import { DateRangePicker, useRangeState } from '../components/DateRange';
import { inRange } from '../lib/metrics';
import { downloadFile, fmtDateTime, fmtDur, fmtInt, fmtPct, toCSV } from '../lib/format';
import type { Call, CallOutcome, Sentiment } from '../data/types';
import { QUAL_TONE, qualStatus, setNavList } from './conversations/state';

const CONNECTED_OUTCOMES: CallOutcome[] = ['Qualified', 'Interested', 'Callback requested', 'Transferred to human', 'Not interested', 'Opted out'];

export default function Conversations() {
  const app = useApp(); const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const rs = useRangeState('30d');
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [campaign, setCampaign] = useState(sp.get('campaign') ?? '');
  const [agent, setAgent] = useState(sp.get('agent') ?? '');
  const [outcome, setOutcome] = useState(sp.get('outcome') ?? '');
  const [sentiment, setSentiment] = useState(sp.get('sentiment') ?? '');
  const [product, setProduct] = useState(sp.get('product') ?? '');
  const [unanswered, setUnanswered] = useState(sp.get('unanswered') === '1');

  // keep URL in sync so filtered views can be shared
  useEffect(() => {
    const n = new URLSearchParams();
    if (q) n.set('q', q); if (campaign) n.set('campaign', campaign); if (agent) n.set('agent', agent);
    if (outcome) n.set('outcome', outcome); if (sentiment) n.set('sentiment', sentiment); if (product) n.set('product', product);
    if (unanswered) n.set('unanswered', '1');
    if (n.toString() !== sp.toString()) setSp(n, { replace: true });
  }, [q, campaign, agent, outcome, sentiment, product, unanswered]); // eslint-disable-line react-hooks/exhaustive-deps

  const base = useMemo(() => app.calls.filter((c) => c.connected && inRange(c.startedAt, rs.range)), [app.calls, rs.range]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return base.filter((c) => {
      if (campaign && c.campaignId !== campaign) return false;
      if (agent && c.agentId !== agent) return false;
      if (outcome && c.outcome !== outcome) return false;
      if (sentiment && c.sentiment !== sentiment) return false;
      if (product && c.productId !== product) return false;
      if (unanswered && !c.unanswered.length) return false;
      if (s) {
        const l = app.leadById.get(c.leadId);
        const hay = `${c.id} ${l?.name ?? ''} ${l?.phone ?? ''} ${c.summary}`.toLowerCase();
        if (!hay.includes(s) && !hay.replace(/\s/g, '').includes(s.replace(/\s/g, ''))) return false;
      }
      return true;
    });
  }, [base, q, campaign, agent, outcome, sentiment, product, unanswered, app.leadById]);

  useEffect(() => { setNavList(rows.map((r) => r.id)); }, [rows]);

  const stats = useMemo(() => {
    const n = rows.length || 1;
    return {
      count: rows.length,
      avg: rows.length ? rows.reduce((s, c) => s + c.duration, 0) / rows.length : 0,
      positive: (rows.filter((c) => c.sentiment === 'Positive').length / n) * 100,
      objections: (rows.filter((c) => c.objections.length).length / n) * 100,
      unanswered: rows.reduce((s, c) => s + c.unanswered.length, 0),
      unansweredCalls: rows.filter((c) => c.unanswered.length).length,
    };
  }, [rows]);

  const active = [campaign, agent, outcome, sentiment, product].filter(Boolean).length + (unanswered ? 1 : 0) + (q ? 1 : 0);
  const reset = () => { setQ(''); setCampaign(''); setAgent(''); setOutcome(''); setSentiment(''); setProduct(''); setUnanswered(false); };

  const columns: Column<Call>[] = [
    { key: 'id', header: 'Conversation', sort: (c) => c.id, render: (c) => <span className="mono small">{c.id}</span> },
    {
      key: 'customer', header: 'Customer / phone', sort: (c) => app.leadById.get(c.leadId)?.name ?? '', render: (c) => {
        const l = app.leadById.get(c.leadId);
        return <div style={{ minWidth: 0 }}><div className="cell-primary truncate">{l?.name ?? '—'}</div><div className="cell-sub mono nowrap">{l?.phone}</div></div>;
      },
    },
    { key: 'campaign', header: 'Campaign', sort: (c) => app.campaignById.get(c.campaignId)?.name ?? '', render: (c) => <span className="small" style={{ display: 'block', minWidth: 120 }}>{app.campaignById.get(c.campaignId)?.name}</span> },
    {
      key: 'agent', header: 'AI agent', sort: (c) => app.agentById.get(c.agentId)?.name ?? '', render: (c) => {
        const a = app.agentById.get(c.agentId);
        return <span className="row gap-4 small nowrap"><Avatar initials={a?.initials} color={a?.color} size="sm" agent />{a?.name}</span>;
      },
    },
    { key: 'date', header: 'Call date', sort: (c) => c.startedAt, render: (c) => <span className="mono small nowrap">{fmtDateTime(c.startedAt)}</span> },
    { key: 'dur', header: 'Duration', align: 'right', sort: (c) => c.duration, render: (c) => <span className="mono small">{fmtDur(c.duration)}</span> },
    { key: 'product', header: 'Product', sort: (c) => app.productById.get(c.productId)?.name ?? '', render: (c) => <span className="small" style={{ display: 'block', minWidth: 100 }}>{app.productById.get(c.productId)?.name}</span> },
    {
      key: 'outcome', header: 'Outcome', sort: (c) => c.outcome, render: (c) => (
        <span className="row gap-4 nowrap"><StatusBadge status={c.outcome} />{c.unanswered.length > 0 && <span title={`${c.unanswered.length} unanswered question`}><HelpCircle size={13} className="orange" /></span>}</span>
      ),
    },
    {
      key: 'qual', header: 'Qualification', sort: (c) => c.score, render: (c) => {
        const s = qualStatus(c);
        return <div className="col nowrap" style={{ gap: 4, alignItems: 'flex-start' }}><Badge tone={QUAL_TONE[s]}>{s}</Badge><ScoreBar value={c.score} /></div>;
      },
    },
    { key: 'rec', header: 'Recording', sort: (c) => c.recording, render: (c) => <StatusBadge status={c.recording} dot={false} /> },
  ];

  const exportRows = (fmt: 'CSV' | 'Excel' | 'PDF') => {
    if (!app.can('reports.export')) { app.toast('Export not permitted', 'Your role does not include report exports.', 'error'); return; }
    if (fmt !== 'CSV') { app.toast(`${fmt} export queued`, `${fmtInt(rows.length)} conversations · you’ll be notified when it’s ready`, 'info'); return; }
    downloadFile(`conversations-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows.map((c) => {
      const l = app.leadById.get(c.leadId);
      return {
        conversation_id: c.id, customer: l?.name, phone: l?.phone, campaign: app.campaignById.get(c.campaignId)?.name, agent: app.agentById.get(c.agentId)?.name,
        started_at: c.startedAt, duration_s: c.duration, product: app.productById.get(c.productId)?.name, outcome: c.outcome, sentiment: c.sentiment,
        qualification: qualStatus(c), score: c.score, objections: c.objections.join('; '), unanswered: c.unanswered.join('; '), recording: c.recording,
      };
    })));
    app.audit('Exported conversations (CSV)', `${rows.length} rows`, 'Export');
    app.toast('Conversations exported', `${fmtInt(rows.length)} rows downloaded as CSV`);
  };

  return (
    <>
      <PageHeader
        title="Conversations"
        desc="Connected AI calls with transcripts, sentiment, objections and qualification — review, annotate and coach."
        eyebrow={<SimBadge />}
        actions={<>
          <DateRangePicker state={rs} />
          <ExportMenu onExport={exportRows} />
        </>}
      />

      <div className="stat-strip" style={{ gridTemplateColumns: 'repeat(5, minmax(0,1fr))', marginBottom: 16 }}>
        <Stat label="Conversations" value={fmtInt(stats.count)} foot={`of ${fmtInt(base.length)} connected · ${rs.range.label.toLowerCase()}`} />
        <Stat label="Avg. duration" value={fmtDur(stats.avg)} foot="connected talk time" />
        <Stat label="Positive sentiment" value={fmtPct(stats.positive)} foot={`${fmtInt(rows.filter((c) => c.sentiment === 'Negative').length)} negative`} />
        <Stat label="With objections" value={fmtPct(stats.objections)} foot="at least one objection raised" />
        <Stat label="Unanswered questions" value={fmtInt(stats.unanswered)} foot={<button className="btn link small" onClick={() => setUnanswered(!unanswered)}>{unanswered ? 'Show all' : `${stats.unansweredCalls} calls · filter`}</button>} />
      </div>

      <div className="card flush">
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(c) => c.id}
          onRowClick={(c) => nav(`/conversations/${c.id}`)}
          initialSort={{ key: 'date', dir: 'desc' }}
          toolbar={<>
            <SearchInput value={q} onChange={setQ} placeholder="Search ID, customer, phone…" width={240} />
            <FilterSelect label="Campaign" value={campaign} onChange={setCampaign} options={app.campaigns.map((c) => ({ value: c.id, label: c.name }))} />
            <FilterSelect label="Agent" value={agent} onChange={setAgent} options={app.agents.map((a) => ({ value: a.id, label: a.name }))} />
            <FilterSelect label="Outcome" value={outcome} onChange={setOutcome} options={CONNECTED_OUTCOMES} />
            <FilterSelect label="Sentiment" value={sentiment} onChange={setSentiment} options={['Positive', 'Neutral', 'Negative'] as Sentiment[]} />
            <FilterSelect label="Product" value={product} onChange={setProduct} options={app.products.map((p) => ({ value: p.id, label: p.name }))} />
            <label className="row small" style={{ gap: 8, cursor: 'pointer', paddingLeft: 4 }}>
              <Switch on={unanswered} onChange={setUnanswered} label="Has unanswered questions" />
              <span className="subtle nowrap">Unanswered questions</span>
            </label>
            {active > 0 && <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={reset}>Reset ({active})</Button>}
          </>}
        />
      </div>
    </>
  );
}

function Stat({ label, value, foot }: { label: string; value: ReactNode; foot?: ReactNode }) {
  return (
    <div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value mt-4">{value}</div>
      <div className="kpi-foot mt-4"><span className="truncate">{foot}</span></div>
    </div>
  );
}
