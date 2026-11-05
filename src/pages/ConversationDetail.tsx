import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from 'recharts';
import {
  AlertTriangle, ArrowLeft, BookPlus, Check, ChevronLeft, ChevronRight, Download, Flag, Info, Link2, MessageSquarePlus, PhoneOff,
  Plus, Sparkles, Star, Tag, UserRoundCheck, X,
} from 'lucide-react';
import { useApp } from '../store/store';
import {
  AudioPlayer, Avatar, Badge, Button, Card, CHART, EmptyState, Field, KV, Modal, PageHeader, ScoreBar, SearchInput, Segmented, SimBadge, StatusBadge, Transcript,
} from '../components/ui';
import { downloadFile, fmtDate, fmtDateTime, fmtDur, fmtDurLong, fmtGBP, fmtRelative, fmtTime } from '../lib/format';
import { NOW, DAY } from '../data/seed';
import type { Call, TranscriptLine } from '../data/types';
import { getNavList, PRESET_TAGS, QUAL_TONE, qualBreakdown, qualStatus, TAG_TONE, useAnnotation } from './conversations/state';

const LAYOUT_CSS = `
.cd-grid { display: grid; grid-template-columns: 260px minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
.cd-side { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.cd-scroll { max-height: max(360px, calc(100vh - 330px)); overflow-y: auto; padding: 4px 6px 4px 2px; }
.cd-flag { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 9px; border-radius: 9999px; border: 1px solid var(--ash); background: var(--canvas); font-size: 12px; color: var(--slate); cursor: pointer; }
.cd-flag.on { border-color: var(--blue); color: var(--blue); background: #f5f8ff; }
.cd-flag .n { font-family: var(--font-mono); color: var(--fog); font-size: 11px; }
.cd-star { background: none; border: 0; padding: 2px; cursor: pointer; color: var(--smoke); display: inline-flex; }
.cd-star.on { color: #F59E0B; }
.cd-star:disabled { cursor: not-allowed; }
.cd-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.cd-grid .player .sim-badge { display: none; }
.cd-grid .player { gap: 6px; padding: 8px 10px; }
.cd-grid .wave { gap: 1px; }
.cd-grid .cd-side > .card .kv { grid-template-columns: 92px minmax(0, 1fr); }
.cd-sticky { position: sticky; top: 72px; }
@media (max-width: 1300px) {
  .cd-grid { grid-template-columns: 260px minmax(0, 1fr); }
  .cd-grid > .cd-insights { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
}
@media (max-width: 860px) {
  .cd-grid { grid-template-columns: minmax(0, 1fr); }
  .cd-grid > .cd-insights { grid-template-columns: minmax(0, 1fr); }
  .cd-scroll { max-height: none; }
  .cd-sticky { position: static; }
}`;

const FLAGS: { key: NonNullable<TranscriptLine['flag']>; label: string }[] = [
  { key: 'objection', label: 'Objections' }, { key: 'question', label: 'Questions' }, { key: 'pricing', label: 'Pricing' },
  { key: 'intent', label: 'Buying intent' }, { key: 'unanswered', label: 'Unanswered' },
];

export default function ConversationDetail() {
  const { id = '' } = useParams();
  const app = useApp(); const nav = useNavigate();
  const call = app.calls.find((c) => c.id === id);

  if (!call) {
    return (
      <>
        <PageHeader title="Conversation not found" desc={<>No call with ID <span className="mono">{id}</span> exists in the 90-day detailed log.</>} />
        <div className="card"><EmptyState title="This conversation is unavailable" desc="It may be older than the retention period or the ID may be incorrect." action={<Button icon={<ArrowLeft />} onClick={() => nav('/conversations')}>Back to conversations</Button>} /></div>
      </>
    );
  }
  return <Detail key={call.id} call={call} />;
}

function Detail({ call }: { call: Call }) {
  const app = useApp(); const nav = useNavigate();
  const lead = app.leadById.get(call.leadId);
  const agent = app.agentById.get(call.agentId);
  const camp = app.campaignById.get(call.campaignId);
  const product = app.productById.get(call.productId);
  const offer = camp?.offerId ? app.offers.find((o) => o.id === camp.offerId) : undefined;
  const lines = useMemo(() => app.transcriptFor(call), [call, app]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ann, setAnn] = useAnnotation(call.id);

  const [time, setTime] = useState(0);
  const [q, setQ] = useState('');
  const [speaker, setSpeaker] = useState<'All' | 'AI' | 'Customer'>('All');
  const [flag, setFlag] = useState<string>('');
  const [escalateOpen, setEscalateOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // prev / next navigation — list the user came from, falling back to all calls of the same kind
  const list = useMemo(() => {
    const fromList = getNavList();
    if (fromList.includes(call.id)) return fromList;
    return app.calls.filter((c) => c.connected === call.connected).map((c) => c.id);
  }, [app.calls, call.id, call.connected]);
  const idx = list.indexOf(call.id);
  const prevId = idx > 0 ? list[idx - 1] : undefined;
  const nextId = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : undefined;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft' && e.altKey && prevId) nav(`/conversations/${prevId}`);
      if (e.key === 'ArrowRight' && e.altKey && nextId) nav(`/conversations/${nextId}`);
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [prevId, nextId, nav]);

  const visible = useMemo(() => lines.filter((l) => (speaker === 'All' || l.speaker === speaker) && (!flag || l.flag === flag)), [lines, speaker, flag]);
  const matches = useMemo(() => {
    if (!q.trim()) return { hits: 0, lines: 0 };
    const s = q.toLowerCase(); let hits = 0; let n = 0;
    visible.forEach((l) => { const c = l.text.toLowerCase().split(s).length - 1; hits += c; if (c) n++; });
    return { hits, lines: n };
  }, [visible, q]);
  const flagCounts = useMemo(() => Object.fromEntries(FLAGS.map((f) => [f.key, lines.filter((l) => l.flag === f.key).length])), [lines]);

  // keep the active line in view inside the transcript panel (without scrolling the page)
  useEffect(() => {
    const box = scrollRef.current; if (!box) return;
    const el = box.querySelector('.msg.active') as HTMLElement | null; if (!el) return;
    const top = el.offsetTop - box.offsetTop;
    if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 60) box.scrollTo({ top: Math.max(0, top - 80), behavior: 'smooth' });
  }, [time]);

  const canListen = app.can('recordings.listen');
  const transcriptText = () => {
    const head = [
      `Conversation ${call.id} (SIMULATED DEMO DATA)`,
      `Customer: ${lead?.name ?? '—'} (${lead?.id ?? ''})`, `Campaign: ${camp?.name ?? '—'}`, `AI agent: ${agent?.name ?? '—'}`,
      `Started: ${new Date(call.startedAt).toLocaleString('en-GB')}`, `Duration: ${fmtDur(call.duration)}`, `Outcome: ${call.outcome}`, '',
      'AI summary:', call.summary, '', 'Transcript:',
    ];
    const body = lines.map((l) => `[${fmtDur(l.t)}] ${l.speaker === 'AI' ? `${agent?.name ?? 'AI'} (AI)` : l.speaker === 'Customer' ? lead?.name ?? 'Customer' : 'System'}: ${l.text}`);
    return [...head, ...body].join('\n');
  };
  const download = () => {
    downloadFile(`${call.id}-transcript.txt`, transcriptText(), 'text/plain');
    app.audit('Downloaded transcript', call.id, 'Data');
    app.toast('Transcript downloaded', `${call.id}-transcript.txt`);
  };
  const share = async () => {
    const url = window.location.href;
    try { await navigator.clipboard.writeText(url); app.toast('Link copied', 'Anyone with workspace access can open this conversation.'); }
    catch { app.toast('Copy this link', url, 'info'); }
  };
  const toggleFlag = () => {
    setAnn({ flagged: !ann.flagged });
    app.audit(ann.flagged ? 'Removed QA flag' : 'Flagged conversation for QA', call.id, 'Data');
    app.toast(ann.flagged ? 'QA flag removed' : 'Flagged for QA review', ann.flagged ? undefined : 'Added to the supervisor QA queue.');
  };

  const canEscalate = app.can('leads.assign');

  return (
    <>
      <style>{LAYOUT_CSS}</style>
      <PageHeader
        eyebrow={<>
          <span className="mono small subtle">{call.id}</span>
          <StatusBadge status={call.outcome} />
          {ann.flagged && <Badge tone="orange"><Flag size={11} />Flagged for QA</Badge>}
          {ann.escalated && <Badge tone="purple">Escalated to {app.memberById.get(ann.escalated)?.name}</Badge>}
          <SimBadge />
        </>}
        title={lead?.name ?? 'Unknown customer'}
        desc={<>{camp?.name} · {agent?.name} (AI) · {fmtDateTime(call.startedAt)} · {call.connected ? fmtDurLong(call.duration) : 'not connected'}</>}
        actions={<>
          <div className="btn-group">
            <Button size="sm" icon={<ChevronLeft />} disabled={!prevId} onClick={() => prevId && nav(`/conversations/${prevId}`)} title="Previous conversation (Alt+←)">Prev</Button>
            <Button size="sm" iconRight={<ChevronRight />} disabled={!nextId} onClick={() => nextId && nav(`/conversations/${nextId}`)} title="Next conversation (Alt+→)">Next</Button>
          </div>
          {idx >= 0 && <span className="mono xs muted">{idx + 1} / {list.length}</span>}
        </>}
      />

      <div className="cd-actions" style={{ marginBottom: 16 }}>
        <Button size="sm" icon={<Download />} onClick={download} disabled={!lines.length}>Download transcript</Button>
        <Button size="sm" icon={<Link2 />} onClick={share}>Share link</Button>
        <Button size="sm" icon={<Flag />} onClick={toggleFlag} className={ann.flagged ? 'on' : ''}>{ann.flagged ? 'Unflag QA' : 'Flag for QA'}</Button>
        <Button size="sm" variant="primary" icon={<UserRoundCheck />} disabled={!canEscalate || !call.connected} title={!canEscalate ? 'Your role cannot assign leads to reps' : !call.connected ? 'Only connected conversations can be escalated' : undefined} onClick={() => setEscalateOpen(true)}>Escalate to rep</Button>
      </div>

      <div className="cd-grid">
        {/* ---------- Left: customer ---------- */}
        <div className="cd-side">
          <Card title="Customer">
            {lead ? (
              <>
                <div className="row" style={{ gap: 12 }}>
                  <Avatar name={lead.name} size="lg" />
                  <div className="grow">
                    <div className="strong truncate">{lead.name}</div>
                    <div className="small muted">{lead.customerType} · {lead.city}</div>
                  </div>
                  <StatusBadge status={lead.status} />
                </div>
                <div className="mt-12"><KV items={[
                  ['Lead ID', <Link to={`/leads/${lead.id}`} className="mono">{lead.id}</Link>],
                  ['Phone', <span className="mono">{lead.phone}</span>],
                  ['Email', <span className="small">{lead.email}</span>],
                  ['Current plan', lead.currentPlan],
                  ['Tenure', `${lead.tenureMonths} months`],
                  ['Lead score', <ScoreBar value={lead.score} />],
                ]} /></div>
                {lead.tags.length > 0 && <div className="row-wrap mt-12">{lead.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>}
                <Button size="sm" className="mt-12" style={{ width: '100%' }} onClick={() => nav(`/leads/${lead.id}`)}>Open lead profile</Button>
              </>
            ) : <div className="small muted">Lead record unavailable (may have been deleted).</div>}
          </Card>

          <Card title="Campaign">
            <KV items={[
              ['Campaign', camp ? <Link to={`/campaigns/${camp.id}`}>{camp.name}</Link> : '—'],
              ['Status', camp ? <StatusBadge status={camp.status} /> : '—'],
              ['Segment', <span className="small">{camp?.segment}</span>],
              ['Product', product?.name ?? '—'],
              ['Offer', offer ? <span className="small">{offer.name} <span className="mono muted">{offer.code}</span></span> : 'None'],
            ]} />
          </Card>

          <Card title="Call metadata" actions={<SimBadge />}>
            <KV items={[
              ['Call ID', <span className="mono">{call.id}</span>],
              ['Started', <span className="mono small">{fmtDate(call.startedAt)} {fmtTime(call.startedAt)}</span>],
              ['Duration', <span className="mono">{fmtDur(call.duration)}</span>],
              ['AI agent', agent ? <Link to={`/agents/${agent.id}`} className="row gap-4" style={{ display: 'inline-flex' }}><Avatar initials={agent.initials} color={agent.color} size="sm" agent />{agent.name} <span className="mono xs muted">{agent.version}</span></Link> : '—'],
              ['Cost', <span className="mono">{fmtGBP(call.cost, 3)}</span>],
              ['Recording', <StatusBadge status={call.recording} dot={false} />],
              ['Connected', call.connected ? 'Yes' : 'No'],
              ...(call.failureReason ? [['Failure', <span className="red small">{call.failureReason}</span>] as [ReactNode, ReactNode]] : []),
            ]} />
          </Card>

          <OtherAttempts call={call} />
        </div>

        {/* ---------- Centre: transcript ---------- */}
        <div className="cd-side cd-sticky">
          <Card title="Recording & transcript" sub={call.connected ? `${lines.length} lines · ${lines.filter((l) => l.speaker === 'Customer').length} from customer · simulated demo audio` : 'System events only'}
            actions={call.connected ? <Segmented value={speaker} onChange={setSpeaker} options={[{ value: 'All', label: 'All' }, { value: 'AI', label: 'AI' }, { value: 'Customer', label: 'Customer' }]} /> : undefined}>
            {!call.connected && (
              <div className="banner warn" style={{ marginBottom: 14 }}>
                <PhoneOff />
                <div><div className="medium">This attempt did not connect — {call.outcome.toLowerCase()}.</div>
                  <div className="small mt-4">No conversation took place, so there is no recording and no AI insights. Only system events were logged{call.failureReason ? ` (${call.failureReason})` : ''}.</div></div>
              </div>
            )}
            {call.connected && (
              <>
                {call.recording === 'Available' && !canListen && (
                  <div className="banner info" style={{ marginBottom: 12 }}><Info /><span>Your role does not include listening to recordings. The transcript is still available.</span></div>
                )}
                <AudioPlayer duration={call.duration} time={time} onTime={setTime} recordingId={call.id} available={call.recording === 'Available' && canListen} />
                {call.recording !== 'Available' && (
                  <div className="xs muted mt-8">{call.recording === 'Expired' ? 'Recording expired under the retention policy; transcript retained.' : call.recording === 'Processing' ? 'Recording is still processing — check back in a few minutes.' : 'This call was not recorded.'} Timestamps still highlight lines.</div>
                )}
                <div className="row-wrap mt-12" style={{ justifyContent: 'space-between' }}>
                  <div className="row" style={{ minWidth: 0 }}>
                    <SearchInput value={q} onChange={setQ} placeholder="Search transcript…" width={240} />
                    {q.trim() && <span className="small muted nowrap mono">{matches.hits} match{matches.hits === 1 ? '' : 'es'} · {matches.lines} line{matches.lines === 1 ? '' : 's'}</span>}
                  </div>
                </div>
                <div className="row-wrap mt-8" style={{ gap: 6 }}>
                  {FLAGS.map((f) => (
                    <button key={f.key} className={`cd-flag ${flag === f.key ? 'on' : ''}`} disabled={!flagCounts[f.key]} style={!flagCounts[f.key] ? { opacity: 0.45, cursor: 'default' } : undefined} onClick={() => setFlag(flag === f.key ? '' : f.key)}>
                      {f.label}<span className="n">{flagCounts[f.key]}</span>
                    </button>
                  ))}
                  {flag && <button className="btn link xs" onClick={() => setFlag('')}>Clear</button>}
                </div>
                <div className="divider" style={{ margin: '12px 0' }} />
              </>
            )}
            <div className="cd-scroll" ref={scrollRef}>
              <Transcript lines={visible} agentName={agent?.name ?? 'AI'} customerName={lead?.name ?? 'Customer'} query={q.trim()} activeTime={call.connected ? time : undefined} onSeek={setTime} agentColor={agent?.color} />
            </div>
          </Card>
        </div>

        {/* ---------- Right: AI insights ---------- */}
        <div className="cd-side cd-insights">
          {call.connected ? <Insights call={call} lines={lines} onSeek={setTime} /> : (
            <Card title="Attempt details">
              <KV items={[
                ['Outcome', <StatusBadge status={call.outcome} />],
                ['Reason', call.failureReason ?? (call.outcome === 'Voicemail' ? 'Answering machine detected' : call.outcome === 'Busy' ? 'Line engaged' : 'No answer within 28s')],
                ['Retry policy', camp ? `${camp.retry.maxAttempts} attempts · every ${camp.retry.intervalHours}h` : '—'],
                ['Lead attempts', lead ? String(lead.attempts) : '—'],
              ]} />
              <div className="small muted mt-12">AI summary: {call.summary}</div>
            </Card>
          )}
          {call.connected && <Annotations call={call} />}
        </div>
      </div>

      {escalateOpen && lead && <EscalateModal call={call} onClose={() => setEscalateOpen(false)} onDone={(repId) => setAnn({ escalated: repId })} />}
    </>
  );
}

/* ---------- other attempts with this customer ---------- */
function OtherAttempts({ call }: { call: Call }) {
  const app = useApp(); const nav = useNavigate();
  const others = app.calls.filter((c) => c.leadId === call.leadId);
  if (others.length <= 1) return null;
  return (
    <Card title="Contact history" sub={`${others.length} attempts with this customer`}>
      <div className="list">
        {others.slice(0, 6).map((c) => (
          <div key={c.id} className={`list-item ${c.id !== call.id ? 'clickable' : ''}`} style={{ padding: '7px 0' }} onClick={() => c.id !== call.id && nav(`/conversations/${c.id}`)}>
            <div className="grow"><div className="mono small" style={{ color: c.id === call.id ? 'var(--blue)' : 'var(--ink)' }}>{c.id}{c.id === call.id && ' · viewing'}</div><div className="xs muted">{fmtRelative(c.startedAt)} · {fmtDur(c.duration)}</div></div>
            <StatusBadge status={c.outcome} />
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ---------- right panel ---------- */
function Insights({ call, lines, onSeek }: { call: Call; lines: TranscriptLine[]; onSeek: (t: number) => void }) {
  const app = useApp();
  const product = app.productById.get(call.productId);
  const agent = app.agentById.get(call.agentId);
  const [ann, setAnn] = useAnnotation(call.id);
  const canKB = app.can('agents.edit');

  const custLines = lines.filter((l) => l.speaker === 'Customer');
  const sentSeries = custLines.map((l, i) => ({ i: i + 1, t: l.t, v: l.sentiment === 'Positive' ? 1 : l.sentiment === 'Negative' ? -1 : 0, text: l.text }));
  const dist = { Positive: custLines.filter((l) => l.sentiment === 'Positive').length, Neutral: custLines.filter((l) => !l.sentiment || l.sentiment === 'Neutral').length, Negative: custLines.filter((l) => l.sentiment === 'Negative').length };
  const pricing = lines.filter((l) => l.flag === 'pricing');
  const resolved = !['Not interested', 'Opted out'].includes(call.outcome);
  const qs = qualStatus(call);
  const breakdown = qualBreakdown(call);
  const findLine = (needle: string) => lines.find((l) => l.text.toLowerCase().includes(needle.toLowerCase().slice(0, 18)));

  const addKB = (u: string) => {
    setAnn({ kb: [...ann.kb, u] });
    app.audit('Added question to knowledge base', `${agent?.name}: ${u}`, 'Agent');
    app.toast('Added to knowledge base', `“${u}” queued for ${agent?.name ?? 'agent'} — a product owner will draft the approved answer.`);
  };

  return (
    <>
      <Card title={<span className="row gap-4"><Sparkles size={14} className="blue" />AI summary</span>} sub={`Generated by ${agent?.name ?? 'AI'} post-call · simulated`}>
        <p className="small" style={{ color: 'var(--graphite)', lineHeight: 1.6 }}>{call.summary}</p>
        <div className="row-wrap mt-12">
          <StatusBadge status={call.sentiment} />
          <Badge tone={QUAL_TONE[qs]}>{qs}</Badge>
          {call.objections.length > 0 && <Badge tone="orange">{call.objections.length} objection{call.objections.length > 1 ? 's' : ''}</Badge>}
          {call.unanswered.length > 0 && <Badge tone="red">{call.unanswered.length} unanswered</Badge>}
        </div>
      </Card>

      <Card title="Sentiment analysis" sub="Customer lines over the call" actions={<StatusBadge status={call.sentiment} />}>
        <div style={{ height: 110 }}>
          <ResponsiveContainer>
            <LineChart data={sentSeries} margin={{ top: 8, right: 6, left: 0, bottom: 0 }} onClick={(e) => { const p = (e as { activePayload?: { payload: { t: number } }[] } | null)?.activePayload?.[0]?.payload; if (p) onSeek(p.t); }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="t" tickFormatter={(v) => fmtDur(v)} tickLine={false} axisLine={false} minTickGap={30} />
              <YAxis domain={[-1, 1]} ticks={[-1, 0, 1]} tickFormatter={(v) => (v > 0 ? '+' : v < 0 ? '−' : '0')} tickLine={false} axisLine={false} width={18} />
              <ReferenceLine y={0} stroke={CHART.light} />
              <Tooltip cursor={{ stroke: CHART.light }} content={({ active, payload }) => {
                if (!active || !payload?.length) return null; const p = payload[0].payload as { t: number; v: number; text: string };
                return <div className="chart-tip" style={{ maxWidth: 220 }}><div className="mono xs muted">{fmtDur(p.t)}</div><div className="strong small">{p.v > 0 ? 'Positive' : p.v < 0 ? 'Negative' : 'Neutral'}</div><div className="xs subtle mt-4">{p.text}</div></div>;
              }} />
              <Line type="stepAfter" dataKey="v" stroke={CHART.blue} strokeWidth={1.5} dot={{ r: 2.5, fill: CHART.blue, strokeWidth: 0 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: 'flex', height: 6, borderRadius: 999, overflow: 'hidden', gap: 2 }} className="mt-8">
          {([['Positive', CHART.green], ['Neutral', CHART.light], ['Negative', '#DC2626']] as const).map(([k, c]) => dist[k] > 0 && <div key={k} style={{ flex: dist[k], background: c }} title={`${k}: ${dist[k]}`} />)}
        </div>
        <div className="row between xs muted mt-4"><span>{dist.Positive} positive</span><span>{dist.Neutral} neutral</span><span>{dist.Negative} negative</span></div>
      </Card>

      <Card title="Buying intent">
        <div className="row" style={{ gap: 16 }}>
          <IntentGauge value={call.intent} />
          <div className="grow small subtle">
            {call.intent >= 75 ? 'Strong intent — customer asked about next steps and accepted a follow-up.' : call.intent >= 50 ? 'Moderate intent — interested but wants more information.' : call.intent >= 25 ? 'Low intent — some engagement, no commitment.' : 'Very low intent — customer declined.'}
            <div className="xs muted mt-4">{lines.filter((l) => l.flag === 'intent').length} intent signal{lines.filter((l) => l.flag === 'intent').length === 1 ? '' : 's'} detected</div>
          </div>
        </div>
      </Card>

      <Card title="Objections detected" sub={call.objections.length ? undefined : 'None raised'}>
        {call.objections.length ? (
          <div className="list">
            {call.objections.map((o) => { const l = findLine(o === 'Price too high' ? 'pricier' : o === 'Still in contract' ? 'contract' : o === 'Needs to discuss with partner' ? 'partner' : o); return (
              <div key={o} className="list-item" style={{ padding: '8px 0' }}>
                <AlertTriangle size={14} className="orange" />
                <div className="grow"><div className="small medium" style={{ color: 'var(--ink)' }}>{o}</div>{l && <button className="btn link xs mono" onClick={() => onSeek(l.t)}>at {fmtDur(l.t)}</button>}</div>
                <Badge tone={resolved ? 'green' : 'neutral'}>{resolved ? 'Handled' : 'Not overcome'}</Badge>
              </div>
            ); })}
          </div>
        ) : <div className="small muted">The customer did not raise any objections.</div>}
      </Card>

      <Card title="Product & pricing discussed">
        {product && <KV items={[
          ['Product', product.name],
          ['Price quoted', <span className="mono">{fmtGBP(product.monthlyPrice)}/mo{product.category.includes('Business') ? ' ex VAT' : ''}</span>],
          ['Contract', `${product.contractMonths} months`],
          ['Data / speed', product.speed ?? product.data],
          ['Pricing mentions', <span className="row gap-4">{pricing.length}{pricing.map((p) => <button key={p.t} className="btn link xs mono" onClick={() => onSeek(p.t)}>{fmtDur(p.t)}</button>)}</span>],
        ]} />}
        {lines.some((l) => l.text.includes('Together Discount')) && <div className="banner info mt-12"><Info /><span className="small">Together Discount (−£5/mo) offered during objection handling.</span></div>}
      </Card>

      <Card title="Questions asked" sub={`${call.questions.length + call.unanswered.length} from customer`}>
        <div className="col" style={{ gap: 6 }}>
          {call.questions.map((qq) => <div key={qq} className="row small" style={{ alignItems: 'flex-start' }}><Check size={14} className="green" style={{ marginTop: 2, flexShrink: 0 }} /><span>{qq}</span></div>)}
          {call.unanswered.map((u) => <div key={u} className="row small" style={{ alignItems: 'flex-start' }}><X size={14} className="red" style={{ marginTop: 2, flexShrink: 0 }} /><span>{u}</span></div>)}
          {!call.questions.length && !call.unanswered.length && <div className="small muted">No questions asked.</div>}
        </div>
      </Card>

      <Card title="Questions the AI could not answer" sub={call.unanswered.length ? 'Knowledge gaps to close' : 'None — all questions answered'}>
        {call.unanswered.length ? (
          <div className="col gap-12">
            {call.unanswered.map((u) => {
              const added = ann.kb.includes(u);
              return (
                <div key={u} className="inset-box">
                  <div className="small medium" style={{ color: 'var(--ink)' }}>{u}</div>
                  <div className="row between mt-8">
                    <span className="xs muted">AI deferred to a specialist</span>
                    {added ? <Badge tone="green"><Check size={11} />In knowledge base queue</Badge>
                      : <Button size="xs" icon={<BookPlus />} disabled={!canKB} title={!canKB ? 'Requires agent editing permission' : undefined} onClick={() => addKB(u)}>Add to knowledge base</Button>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : <div className="small muted">The agent answered every question within its approved knowledge.</div>}
      </Card>

      <Card title="Qualification score" actions={<Badge tone={QUAL_TONE[qs]}>{qs}</Badge>}>
        <div className="row between" style={{ alignItems: 'baseline' }}>
          <span className="kpi-value">{call.score}<span className="small muted"> / 100</span></span>
          <span className="xs muted">Campaign threshold {app.campaignById.get(call.campaignId)?.qualification.minScore ?? 70}</span>
        </div>
        <div className="col mt-12" style={{ gap: 10 }}>
          {breakdown.map((b) => (
            <div key={b.key}>
              <div className="row between small"><span className="medium" style={{ color: 'var(--ink)' }}>{b.key}</span><span className="mono">{b.value}/25</span></div>
              <div className="progress mt-4" style={{ height: 4 }}><div style={{ width: `${(b.value / 25) * 100}%`, background: b.value >= 18 ? CHART.green : b.value >= 10 ? CHART.blue : CHART.grey }} /></div>
              <div className="xs muted mt-4">{b.hint}</div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function IntentGauge({ value }: { value: number }) {
  const r = 42; const cx = 50; const cy = 50; const len = Math.PI * r;
  const color = value >= 75 ? CHART.green : value >= 50 ? CHART.blue : value >= 25 ? '#F59E0B' : CHART.grey;
  return (
    <svg width={110} height={64} viewBox="0 0 100 58" role="img" aria-label={`Buying intent ${value} of 100`}>
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#EFEFEF" strokeWidth={8} strokeLinecap="round" />
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" strokeDasharray={`${(value / 100) * len} ${len}`} />
      <text x={cx} y={cy - 4} textAnchor="middle" style={{ fontSize: 18, fontWeight: 600, fill: '#0A0A0A', fontFamily: 'var(--font-ui)' }}>{value}</text>
      <text x={cx} y={cy + 8} textAnchor="middle" style={{ fontSize: 8, fill: '#737373' }}>of 100</text>
    </svg>
  );
}

/* ---------- annotations & notes ---------- */
function Annotations({ call }: { call: Call }) {
  const app = useApp();
  const [ann, setAnn] = useAnnotation(call.id);
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState('');
  const canQA = app.can('recordings.listen');
  const canScore = app.can('calling.control');

  const toggleTag = (t: string) => setAnn({ tags: ann.tags.includes(t) ? ann.tags.filter((x) => x !== t) : [...ann.tags, t] });
  const addCustom = () => { const t = custom.trim(); if (!t) return; if (!ann.tags.includes(t)) setAnn({ tags: [...ann.tags, t] }); setCustom(''); app.toast('Label added', t); };
  const score = (n: number) => { setAnn({ qa: n === ann.qa ? 0 : n }); app.audit('Scored conversation (QA)', `${call.id}: ${n}/5`, 'Data'); app.toast(`QA score saved: ${n}/5`); };
  const addNote = () => {
    const t = note.trim(); if (!t) return;
    setAnn({ notes: [{ id: `cn-${Date.now()}`, author: app.me.name, at: new Date().toISOString(), text: t }, ...ann.notes] });
    setNote(''); app.toast('Internal note added');
  };
  const tags = [...PRESET_TAGS, ...ann.tags.filter((t) => !PRESET_TAGS.includes(t))];

  return (
    <>
      <Card title={<span className="row gap-4"><Tag size={14} />Human annotations</span>} sub="Visible to supervisors and QA">
        <div className="label">Labels</div>
        <div className="row-wrap mt-8" style={{ gap: 6 }}>
          {tags.map((t) => {
            const on = ann.tags.includes(t);
            return on ? (
              <button key={t} onClick={() => canQA && toggleTag(t)} style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer' }} title="Remove label"><Badge tone={TAG_TONE(t)}><Check size={11} />{t}</Badge></button>
            ) : (
              <button key={t} className="tag" style={{ cursor: canQA ? 'pointer' : 'not-allowed' }} disabled={!canQA} onClick={() => toggleTag(t)}><Plus size={11} />{t}</button>
            );
          })}
        </div>
        <div className="row mt-8">
          <input className="input sm soft" placeholder="Custom label…" value={custom} maxLength={40} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCustom()} disabled={!canQA} />
          <Button size="sm" onClick={addCustom} disabled={!custom.trim() || !canQA}>Add</Button>
        </div>
        <div className="divider" style={{ margin: '14px 0' }} />
        <div className="row between">
          <div><div className="label">QA score</div><div className="xs muted mt-4">{ann.qa ? `${ann.qa} of 5 · by ${app.me.name}` : 'Not yet scored'}</div></div>
          <div className="row" style={{ gap: 0 }} title={!canScore ? 'Only managers and supervisors can score QA' : undefined}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={`cd-star ${n <= ann.qa ? 'on' : ''}`} disabled={!canScore} onClick={() => score(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`}>
                <Star size={20} fill={n <= ann.qa ? '#F59E0B' : 'none'} strokeWidth={1.5} />
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card title={<span className="row gap-4"><MessageSquarePlus size={14} />Internal notes</span>} sub="Not shared with the customer">
        <textarea className="textarea" rows={3} placeholder="Add a note for the team…" value={note} onChange={(e) => setNote(e.target.value)} maxLength={600} />
        <div className="row between mt-8"><span className="xs muted">{note.length}/600</span><Button size="sm" disabled={!note.trim()} onClick={addNote}>Add note</Button></div>
        {ann.notes.length > 0 && (
          <div className="list mt-12">
            {ann.notes.map((n) => (
              <div key={n.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                <Avatar name={n.author} size="sm" />
                <div className="grow">
                  <div className="row between"><span className="small medium" style={{ color: 'var(--ink)' }}>{n.author}</span><span className="xs muted">{fmtRelative(n.at)}</span></div>
                  <div className="small subtle mt-4" style={{ whiteSpace: 'pre-wrap' }}>{n.text}</div>
                </div>
                <Button size="xs" variant="ghost" iconOnly icon={<X />} aria-label="Delete note" onClick={() => setAnn({ notes: ann.notes.filter((x) => x.id !== n.id) })} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

/* ---------- escalate modal ---------- */
function EscalateModal({ call, onClose, onDone }: { call: Call; onClose: () => void; onDone: (repId: string) => void }) {
  const app = useApp();
  const lead = app.leadById.get(call.leadId)!;
  const reps = app.team.filter((t) => t.role === 'Sales Representative');
  const suggested = reps.find((r) => r.products.includes(call.productId) && r.status === 'Available') ?? reps[0];
  const [repId, setRepId] = useState(lead.assignedRepId ?? suggested?.id ?? '');
  const [priority, setPriority] = useState<'High' | 'Medium' | 'Low'>(call.score >= 80 ? 'High' : 'Medium');
  const [note, setNote] = useState(`Please follow up on ${call.id}. ${call.summary}`);
  const [err, setErr] = useState('');

  const submit = () => {
    if (!repId) { setErr('Choose a sales representative'); return; }
    const rep = app.memberById.get(repId)!;
    app.upsertTask({ id: `TK-${Date.now() % 1000000}`, leadId: lead.id, repId, title: `Escalated conversation ${call.id}: ${note.slice(0, 80)}`, due: new Date(NOW.getTime() + (priority === 'High' ? 0.5 : 1) * DAY).toISOString(), priority, done: false });
    app.updateLead(lead.id, { assignedRepId: repId });
    app.audit('Escalated conversation to rep', `${call.id} → ${rep.name}`, 'Data');
    onDone(repId);
    app.toast('Escalated to sales rep', `${rep.name} has a ${priority.toLowerCase()}-priority follow-up task for ${lead.name}.`);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Escalate to sales rep" desc={`${lead.name} · ${call.id}`} footer={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" onClick={submit}>Escalate</Button>
    </>}>
      <div className="col gap-16">
        <Field label="Sales representative" required error={err}>
          <select className="select" value={repId} onChange={(e) => { setRepId(e.target.value); setErr(''); }}>
            <option value="">Choose…</option>
            {reps.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.team} · {r.status}{r.id === suggested?.id ? ' (suggested)' : ''}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <Segmented value={priority} onChange={setPriority} options={['High', 'Medium', 'Low']} />
        </Field>
        <Field label="Handover note" hint="Included in the rep’s task with the AI summary and transcript link.">
          <textarea className="textarea" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
