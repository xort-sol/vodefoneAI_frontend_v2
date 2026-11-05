import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { BookPlus, Star } from 'lucide-react';
import { useApp } from '../../store/store';
import { Avatar, Button, Card, ChartTip, CHART, Legend, StatusBadge } from '../../components/ui';
import { fmtDur, fmtInt, fmtPct } from '../../lib/format';
import { AX, StatStrip, useExport, type AnalyticsCtx } from './common';
import { allAnnotations, hashFrac } from '../conversations/state';

export default function AiTab({ ctx }: { ctx: AnalyticsCtx }) {
  const app = useApp(); const nav = useNavigate();

  const rows = useMemo(() => app.agents.map((a) => {
    const cs = ctx.calls.filter((c) => c.agentId === a.id);
    const conn = cs.filter((c) => c.connected);
    const n = conn.length || 1;
    const qualified = conn.filter((c) => c.outcome === 'Qualified' || c.outcome === 'Transferred to human').length;
    const success = conn.filter((c) => ['Qualified', 'Transferred to human', 'Interested', 'Callback requested'].includes(c.outcome)).length;
    const withObj = conn.filter((c) => c.objections.length);
    const handled = withObj.filter((c) => !['Not interested', 'Opted out'].includes(c.outcome)).length;
    const escalated = conn.filter((c) => c.outcome === 'Transferred to human').length;
    const unanswered = conn.reduce((s, c) => s + c.unanswered.length, 0);
    // QA: human scores from conversation annotations when present, otherwise the sampled QA baseline
    const human = conn.map((c) => allAnnotations().get(c.id)?.qa ?? 0).filter((x) => x > 0);
    const baseline = 3.4 + (a.sentimentScore / 100) * 1.2 + (hashFrac(a.id) - 0.5) * 0.3;
    const qa = human.length ? (human.reduce((s, x) => s + x, 0) + baseline * 20) / (human.length + 20) : baseline;
    return {
      agent: a, calls: cs.length, connected: conn.length,
      qualRate: (qualified / n) * 100, successRate: (success / n) * 100,
      avgDur: conn.length ? conn.reduce((s, c) => s + c.duration, 0) / conn.length : 0,
      pos: (conn.filter((c) => c.sentiment === 'Positive').length / n) * 100,
      neu: (conn.filter((c) => c.sentiment === 'Neutral').length / n) * 100,
      neg: (conn.filter((c) => c.sentiment === 'Negative').length / n) * 100,
      objHandling: withObj.length ? (handled / withObj.length) * 100 : 0,
      escalation: (escalated / n) * 100, unanswered, qa: Math.min(5, qa), qaSamples: 18 + Math.round(hashFrac(a.id + 'qa') * 30) + human.length, humanScored: human.length,
    };
  }).filter((r) => r.calls > 0).sort((a, b) => b.qualRate - a.qualRate), [app.agents, ctx.calls]);

  const unansweredTop = useMemo(() => {
    const m = new Map<string, { n: number; agents: Set<string>; last: string }>();
    ctx.calls.forEach((c) => c.unanswered.forEach((u) => { const r = m.get(u) ?? { n: 0, agents: new Set(), last: c.id }; r.n++; r.agents.add(app.agentById.get(c.agentId)?.name ?? ''); m.set(u, r); }));
    return [...m.entries()].map(([q, r]) => ({ q, ...r })).sort((a, b) => b.n - a.n);
  }, [ctx.calls, app.agentById]);

  const all = rows.reduce((s, r) => ({ c: s.c + r.connected, q: s.q + (r.qualRate * r.connected) / 100, e: s.e + (r.escalation * r.connected) / 100, o: s.o + r.objHandling * r.connected }), { c: 0, q: 0, e: 0, o: 0 });
  const chart = rows.filter((r) => r.connected > 0).map((r) => ({ name: r.agent.name, qual: +r.qualRate.toFixed(1), success: +r.successRate.toFixed(1), obj: +r.objHandling.toFixed(1), pos: +r.pos.toFixed(1), neu: +r.neu.toFixed(1), neg: +r.neg.toFixed(1) }));

  useExport(ctx, () => ({ name: 'ai-performance', rows: rows.map((r) => ({ agent: r.agent.name, calls: r.calls, connected: r.connected, qualification_pct: r.qualRate.toFixed(1), success_pct: r.successRate.toFixed(1), avg_duration_s: Math.round(r.avgDur), positive_pct: r.pos.toFixed(1), negative_pct: r.neg.toFixed(1), objection_handling_pct: r.objHandling.toFixed(1), escalation_pct: r.escalation.toFixed(1), unanswered: r.unanswered, qa_score: r.qa.toFixed(2) })) }));

  return (
    <>
      <StatStrip items={[
        { label: 'Conversations', value: fmtInt(all.c), foot: `${rows.length} agents active` },
        { label: 'Qualification rate', value: fmtPct(all.c ? (all.q / all.c) * 100 : 0), foot: 'of connected' },
        { label: 'Objection handling', value: fmtPct(all.c ? all.o / all.c : 0), foot: 'calls with objections not lost' },
        { label: 'Human escalation', value: fmtPct(all.c ? (all.e / all.c) * 100 : 0), foot: 'warm transfers' },
        { label: 'Unanswered questions', value: fmtInt(unansweredTop.reduce((s, u) => s + u.n, 0)), foot: `${unansweredTop.length} distinct gaps` },
      ]} />

      <Card flush title="Agent scorecard" sub="Connected calls in range" style={{ marginBottom: 16 }}>
        <div className="table-wrap">
          <table className="table table-responsive">
            <thead><tr><th>Agent</th><th className="num">Calls</th><th className="num">Qualification</th><th className="num">Success</th><th className="num">Avg dur.</th><th>Sentiment</th><th className="num">Objection handling</th><th className="num">Escalation</th><th className="num">Unanswered</th><th className="num">QA score</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.agent.id} className="clickable" onClick={() => nav(`/agents/${r.agent.id}`)}>
                  <td data-label="Agent"><span className="row"><Avatar initials={r.agent.initials} color={r.agent.color} agent size="sm" /><span className="cell-primary">{r.agent.name}</span><StatusBadge status={r.agent.status} /></span></td>
                  <td data-label="Calls" className="num mono">{fmtInt(r.calls)}</td>
                  <td data-label="Qualification" className="num mono strong">{fmtPct(r.qualRate)}</td>
                  <td data-label="Success" className="num mono">{fmtPct(r.successRate)}</td>
                  <td data-label="Avg dur." className="num mono">{fmtDur(r.avgDur)}</td>
                  <td data-label="Sentiment">
                    <div style={{ display: 'flex', width: 110, height: 6, borderRadius: 999, overflow: 'hidden', gap: 1 }} title={`${r.pos.toFixed(0)}% positive · ${r.neu.toFixed(0)}% neutral · ${r.neg.toFixed(0)}% negative`}>
                      <div style={{ width: `${r.pos}%`, background: CHART.green }} /><div style={{ width: `${r.neu}%`, background: CHART.light }} /><div style={{ width: `${r.neg}%`, background: '#DC2626' }} />
                    </div>
                  </td>
                  <td data-label="Objection handling" className="num mono">{fmtPct(r.objHandling)}</td>
                  <td data-label="Escalation" className="num mono">{fmtPct(r.escalation)}</td>
                  <td data-label="Unanswered" className="num mono">{r.unanswered}</td>
                  <td data-label="QA score" className="num"><span className="row gap-4" style={{ justifyContent: 'flex-end' }}><Star size={12} fill="#F59E0B" color="#F59E0B" /><span className="mono">{r.qa.toFixed(1)}</span><span className="xs muted">n={r.qaSamples}</span></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid g-2" style={{ marginBottom: 16 }}>
        <Card title="Qualification & conversation success" sub="Per agent, % of connected calls">
          <Legend items={[{ label: 'Qualification', color: CHART.green }, { label: 'Conversation success', color: CHART.ink }, { label: 'Objection handling', color: CHART.blue }]} />
          <div style={{ height: 230 }} className="mt-8">
            <ResponsiveContainer>
              <BarChart data={chart} margin={{ left: -12, right: 4, top: 8 }} barGap={2}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="name" {...AX} />
                <YAxis {...AX} width={44} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<ChartTip fmt={(v) => `${v}%`} />} cursor={{ fill: '#F7F7F7' }} />
                <Bar dataKey="qual" name="Qualification" fill={CHART.green} radius={[2, 2, 0, 0]} maxBarSize={14} />
                <Bar dataKey="success" name="Conversation success" fill={CHART.ink} radius={[2, 2, 0, 0]} maxBarSize={14} />
                <Bar dataKey="obj" name="Objection handling" fill={CHART.blue} radius={[2, 2, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Sentiment distribution" sub="Share of connected calls">
          <Legend items={[{ label: 'Positive', color: CHART.green }, { label: 'Neutral', color: CHART.light }, { label: 'Negative', color: '#DC2626' }]} />
          <div style={{ height: 230 }} className="mt-8">
            <ResponsiveContainer>
              <BarChart data={chart} layout="vertical" margin={{ left: 0, right: 12, top: 4 }}>
                <CartesianGrid stroke={CHART.grid} horizontal={false} />
                <XAxis type="number" {...AX} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} allowDataOverflow tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="name" {...AX} width={50} />
                <Tooltip content={<ChartTip fmt={(v) => `${v}%`} />} cursor={{ fill: '#F7F7F7' }} />
                <Bar dataKey="pos" name="Positive" stackId="s" fill={CHART.green} barSize={12} />
                <Bar dataKey="neu" name="Neutral" stackId="s" fill={CHART.light} barSize={12} />
                <Bar dataKey="neg" name="Negative" stackId="s" fill="#DC2626" barSize={12} radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid g-main-side" style={{ marginBottom: 16 }}>
        <Card flush title="Top unanswered questions" sub="Knowledge gaps the agents deferred to a specialist">
          <div className="table-wrap">
            <table className="table table-responsive">
              <thead><tr><th>Question</th><th className="num">Times asked</th><th>Agents</th><th /></tr></thead>
              <tbody>
                {unansweredTop.map((u) => (
                  <tr key={u.q}>
                    <td data-label="Question" className="cell-primary" style={{ whiteSpace: 'normal' }}>{u.q}</td>
                    <td data-label="Times asked" className="num mono">{u.n}</td>
                    <td data-label="Agents" className="small subtle">{[...u.agents].join(', ')}</td>
                    <td data-label="">
                      <Button size="xs" icon={<BookPlus />} disabled={!app.can('agents.edit')} title={!app.can('agents.edit') ? 'Requires agent editing permission' : undefined}
                        onClick={() => { app.audit('Added question to knowledge base', u.q, 'Agent'); app.toast('Added to knowledge base', `“${u.q}” queued for approval by a product owner.`); }}>Add to KB</Button>
                    </td>
                  </tr>
                ))}
                {!unansweredTop.length && <tr><td colSpan={4} className="muted small">No unanswered questions in this range.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="QA scores" sub="Human-reviewed sample, 1–5">
          <div className="col" style={{ gap: 12 }}>
            {[...rows].sort((a, b) => b.qa - a.qa).map((r) => (
              <div key={r.agent.id}>
                <div className="row between small"><span className="row gap-4"><Avatar initials={r.agent.initials} color={r.agent.color} agent size="sm" />{r.agent.name}</span><span className="mono">{r.qa.toFixed(2)}</span></div>
                <div className="progress mt-4" style={{ height: 4 }}><div style={{ width: `${(r.qa / 5) * 100}%`, background: r.qa >= 4.2 ? CHART.green : r.qa >= 3.8 ? CHART.blue : '#F59E0B' }} /></div>
                <div className="xs muted mt-4">{r.qaSamples} reviewed{r.humanScored ? ` · ${r.humanScored} scored this session` : ''}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
