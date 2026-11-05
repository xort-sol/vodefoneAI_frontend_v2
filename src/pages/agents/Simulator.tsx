import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Send, ClipboardCheck, CheckCircle2, XCircle } from 'lucide-react';
import { Avatar, Badge, Button, Card, SimBadge, EmptyState } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import type { Offer, Product } from '../../data/types';
import { uid, type Draft, type TestRun } from './model';

interface Msg { who: 'AI' | 'Customer' | 'System'; text: string; meta?: string }

const SCENARIOS: { key: string; label: string; lines: string[] }[] = [
  { key: 'price', label: 'Price-sensitive', lines: ['Yes, speaking.', 'How much is it per month?', "That's too expensive for me.", 'Okay, what would the cheaper option cost?'] },
  { key: 'human', label: 'Wants a human', lines: ['Yes, who is this?', "I'd rather speak to a real person please."] },
  { key: 'optout', label: 'Opts out', lines: ['Yes.', 'Please stop calling me and remove my number.'] },
  { key: 'biz', label: 'Business owner', lines: ['Yes, I run a small business.', 'We have about 8 employees who need mobile lines.', 'What does it cost per line?', 'Sounds good, I am interested.'] },
  { key: 'callback', label: 'Callback', lines: ["I'm driving, it's not a good time.", 'Can you call me back tomorrow evening?'] },
];

const has = (t: string, words: string[]) => words.some((w) => t.includes(w));

/** Deterministic rule-based responder — SIMULATED, no model or telephony is called. */
function respond(input: string, d: Draft, products: Product[], offers: Offer[], ctx: { optedOut: boolean; productId: string }): { msgs: Msg[]; optedOut?: boolean; productId?: string } {
  const t = input.toLowerCase();
  const approved = products.filter((p) => p.approved && p.availability !== 'Retired');
  const prod = approved.find((p) => p.id === ctx.productId) ?? approved[0];
  const findObj = (keys: string[]) => d.objections.find((o) => has(o.trigger.toLowerCase(), keys));
  const esc = (k: string) => d.escalation.find((e) => e.rule.toLowerCase().includes(k))?.enabled;
  const fill = (s: string) => s.replace(/\{first_name\}/g, 'Alex').replace(/\{agent_name\}/g, d.name).replace(/\{product_name\}/g, prod?.name ?? '').replace(/\{monthly_price\}/g, String(prod?.monthlyPrice ?? ''));
  if (ctx.optedOut) return { msgs: [{ who: 'System', text: 'Call has ended — the customer opted out.' }] };

  if (has(t, ['stop calling', 'opt out', 'remove my number', 'remove me', "don't call", 'do not call', 'unsubscribe', 'stop'])) {
    const msgs: Msg[] = [{ who: 'AI', text: `Of course, I'm sorry to have bothered you. I've ${d.builder.ending.suppress ? 'added your number to our do-not-call list' : 'noted your preference'} and you won't receive further sales calls from us. Goodbye.`, meta: 'Opt-out honoured' }];
    msgs.push({ who: 'System', text: `${d.builder.ending.optOut}. ${d.builder.ending.suppress ? 'Number added to suppression list (simulated).' : ''}` });
    return { msgs, optedOut: true };
  }
  if (has(t, ['real person', 'human', 'speak to someone', 'advisor', 'adviser', 'manager'])) {
    return esc('person')
      ? { msgs: [{ who: 'AI', text: "Absolutely — I'll transfer you to one of our specialists now. They'll have a summary of our conversation so you won't need to repeat yourself.", meta: 'Escalation rule: customer asks to speak to a person' }, { who: 'System', text: 'Warm transfer to human specialist (simulated).' }] }
      : { msgs: [{ who: 'AI', text: "I understand. I can arrange for a specialist to call you back — would that help?", meta: 'Escalation rule disabled — offered callback' }] };
  }
  if (has(t, ['scam', 'is this real', 'legit'])) {
    const o = findObj(['scam']);
    return { msgs: [{ who: 'AI', text: "That's a very fair question. I'll never ask for passwords or payment details. If you'd prefer, you can call the number on your Vodafone bill to check.", meta: o ? `Objection matched: ${o.trigger}` : undefined }] };
  }
  if (has(t, ['not a good time', 'driving', 'busy', 'call me back', 'call back', 'later', 'tomorrow'])) {
    const o = findObj(['time']);
    const when = has(t, ['tomorrow']) ? 'tomorrow evening after 6pm' : 'a better time';
    return { msgs: [{ who: 'AI', text: `No problem at all, I'm sorry for the interruption. I'll arrange a callback for ${when}. Is this the best number to reach you on?`, meta: o ? `Objection matched: ${o.trigger} · Flow: Callback requested` : 'Flow: Callback requested' }] };
  }
  if (has(t, ['business', 'employees', 'staff', 'company', 'lines'])) {
    const biz = approved.find((p) => p.category === 'Business Mobile') ?? prod;
    const offer = offers.find((o) => o.status === 'Active' && o.productIds.includes(biz.id));
    return { productId: biz.id, msgs: [{ who: 'AI', text: `Great — for businesses, ${biz.name} gives each user ${biz.data.toLowerCase()} data for £${biz.monthlyPrice} per line a month on a ${biz.contractMonths}-month plan, excluding VAT.${offer ? ` There's also ${offer.name}: ${offer.discount.toLowerCase()}.` : ''} How many lines would you need?`, meta: `Product: ${biz.name} (approved)` }] };
  }
  if (has(t, ['too expensive', 'expensive', 'cheaper', "can't afford", 'too much'])) {
    const o = findObj(['expensive']);
    const cheaper = [...approved].filter((p) => p.monthlyPrice < (prod?.monthlyPrice ?? 0) && p.category.startsWith('Business') === (prod?.category.startsWith('Business') ?? false)).sort((a, b) => b.monthlyPrice - a.monthlyPrice)[0];
    const together = offers.find((x) => x.status === 'Active' && x.code.startsWith('TOGETHER') && x.productIds.includes(prod?.id ?? ''));
    const text = has(t, ['cheaper', 'cost', 'what would']) && cheaper
      ? `The lower-cost option is ${cheaper.name} at £${cheaper.monthlyPrice} a month on a ${cheaper.contractMonths === 1 ? '30-day rolling' : `${cheaper.contractMonths}-month`} plan, with ${cheaper.data.toLowerCase()} data.`
      : `I completely understand. ${together ? `If you have broadband with us, the ${together.name} takes ${together.discount.toLowerCase()}. ` : ''}${cheaper ? `There's also ${cheaper.name} at £${cheaper.monthlyPrice} a month if you'd like something lighter.` : 'I can email you the details to compare in your own time.'}`;
    return { productId: has(t, ['cheaper', 'what would']) && cheaper ? cheaper.id : undefined, msgs: [{ who: 'AI', text, meta: o ? `Objection matched: ${o.trigger}` : 'Pricing from approved catalogue' }] };
  }
  if (has(t, ['how much', 'price', 'cost', 'per month', 'monthly'])) {
    return { msgs: [{ who: 'AI', text: `${prod.name} is £${prod.monthlyPrice} a month on a ${prod.contractMonths === 1 ? '30-day rolling' : `${prod.contractMonths}-month`} plan${prod.upfront ? ` with £${prod.upfront} upfront` : ' with nothing to pay upfront'}.`, meta: `Pricing: ${prod.name} (approved)` }] };
  }
  if (has(t, ['happy with', 'already have', 'not interested', 'no thanks'])) {
    const o = findObj(['happy']);
    return { msgs: [{ who: 'AI', text: `That's absolutely fine, and thanks for being honest. One thing worth knowing is ${prod.benefits[0]?.toLowerCase() ?? 'the extra benefits'} — shall I just email the details so you have them?`, meta: o ? `Objection matched: ${o.trigger}` : undefined }] };
  }
  if (has(t, ['interested', 'sounds good', 'go ahead', 'sign me up', 'book'])) {
    return { msgs: [{ who: 'AI', text: "Brilliant. I'll book a quick call with a specialist to finalise everything — would Thursday at 11am or Friday at 2pm suit you better?", meta: 'Flow: Qualification → Appointment booking' }] };
  }
  if (has(t, ['data', 'speed', 'included', 'what do i get', 'roaming'])) {
    return { msgs: [{ who: 'AI', text: `${prod.name} includes ${prod.benefits.slice(0, 3).join(', ').toLowerCase()}.`, meta: 'Knowledge base: approved product entry' }] };
  }
  if (has(t, ['yes', 'speaking', "that's me", 'who is this', 'hello'])) {
    const script = d.builder.scripts.find((s) => s.productId === prod.id) ?? d.builder.scripts[0];
    return { msgs: [{ who: 'AI', text: `Thanks, Alex. ${fill(script?.opening ?? `I'm calling because you're eligible for ${prod.name}.`)} How do you mostly use your phone and internet day to day?`, meta: 'Flow: Customer identification → Needs assessment' }] };
  }
  return { msgs: [{ who: 'AI', text: "Thanks for sharing that. To make sure I recommend the right plan, could you tell me a little about how you use your connection?", meta: 'Flow: Needs assessment (fallback)' }] };
}

function evaluate(msgs: Msg[], d: Draft, products: Product[], offers: Offer[]): TestRun['checks'] {
  const ai = msgs.filter((m) => m.who === 'AI').map((m) => m.text);
  const all = ai.join(' ').toLowerCase();
  const disc = d.builder.disclosure.trim().toLowerCase();
  const disclosed = (!!disc && all.includes(disc.slice(0, 40))) || (all.includes('ai assistant') && all.includes('recorded'));
  const allowed = new Set<number>(); products.filter((p) => p.approved).forEach((p) => { allowed.add(p.monthlyPrice); allowed.add(p.upfront); });
  offers.filter((o) => o.status === 'Active').forEach((o) => (o.discount.match(/£(\d+(?:\.\d+)?)/g) ?? []).forEach((m) => allowed.add(+m.slice(1))));
  const quoted = (all.match(/£(\d+(?:\.\d+)?)/g) ?? []).map((m) => +m.slice(1));
  const bad = quoted.filter((q) => !allowed.has(q));
  const custOptOut = msgs.findIndex((m) => m.who === 'Customer' && /stop|opt out|remove|do not call|don't call/i.test(m.text));
  const optOk = custOptOut < 0 ? true : /do-not-call|won't receive|noted your preference/i.test(msgs.slice(custOptOut + 1).find((m) => m.who === 'AI')?.text ?? '');
  const banned = d.builder.bannedPhrases.filter((b) => b && all.includes(b.toLowerCase()));
  const pushy = /(act now|today only|must decide|last chance)/i.test(all);
  return [
    { label: 'Compliance disclosure said', pass: disclosed, detail: disclosed ? 'AI identity and recording notice given in greeting.' : 'Greeting did not include the mandatory disclosure.' },
    { label: 'Pricing accurate', pass: bad.length === 0, detail: quoted.length ? (bad.length ? `Unapproved price quoted: ${bad.map((b) => `£${b}`).join(', ')}` : `${quoted.length} price${quoted.length > 1 ? 's' : ''} matched approved catalogue.`) : 'No prices quoted.' },
    { label: 'Opt-out honoured', pass: optOk, detail: custOptOut < 0 ? 'No opt-out requested in this test.' : optOk ? 'Agent confirmed suppression and ended the call.' : 'Agent continued after opt-out request.' },
    { label: 'Tone & banned phrases', pass: banned.length === 0 && !pushy, detail: banned.length ? `Used banned phrase: “${banned[0]}”` : pushy ? 'High-pressure language detected.' : 'Polite, non-pressured language throughout.' },
  ];
}

export default function Simulator({ draft, products, offers, tests, onSaveTest }: { draft: Draft; products: Product[]; offers: Offer[]; tests: TestRun[]; onSaveTest: (t: TestRun) => void }) {
  const greeting = () => {
    const g = draft.greeting.replace(/\{first_name\}/g, 'Alex').replace(/\{agent_name\}/g, draft.name);
    const disc = draft.builder.disclosure.trim();
    const includes = disc && g.toLowerCase().includes(disc.toLowerCase().slice(0, 30));
    return includes || !disc ? g : `${g} ${disc}`;
  };
  const [msgs, setMsgs] = useState<Msg[]>(() => [{ who: 'System', text: 'Simulated test call started — no real call is placed.' }, { who: 'AI', text: greeting() }]);
  const [input, setInput] = useState('');
  const [ctx, setCtx] = useState({ optedOut: false, productId: draft.builder.scripts[0]?.productId ?? '' });
  const [scenario, setScenario] = useState('Free-form');
  const [running, setRunning] = useState(false);
  const [lastEval, setLastEval] = useState<TestRun | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => { const el = endRef.current?.parentElement; if (el) el.scrollTop = el.scrollHeight; }, [msgs]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const send = (text: string, c = ctx) => {
    const r = respond(text, draft, products, offers, c);
    const next = { optedOut: r.optedOut ?? c.optedOut, productId: r.productId ?? c.productId };
    setMsgs((m) => [...m, { who: 'Customer', text }, ...r.msgs]);
    setCtx(next);
    return next;
  };
  const reset = (label = 'Free-form') => {
    timers.current.forEach(clearTimeout); timers.current = [];
    setMsgs([{ who: 'System', text: `Simulated test call started${label !== 'Free-form' ? ` · scenario: ${label}` : ''} — no real call is placed.` }, { who: 'AI', text: greeting() }]);
    setCtx({ optedOut: false, productId: draft.builder.scripts[0]?.productId ?? '' }); setScenario(label); setLastEval(null); setRunning(false);
  };
  const runScenario = (s: typeof SCENARIOS[number]) => {
    reset(s.label); setRunning(true);
    let c = { optedOut: false, productId: draft.builder.scripts[0]?.productId ?? '' };
    s.lines.forEach((line, i) => {
      timers.current.push(window.setTimeout(() => { c = send(line, c); if (i === s.lines.length - 1) setRunning(false); }, 500 + i * 700));
    });
  };
  const runEval = () => {
    const run: TestRun = { id: uid('t'), scenario, at: new Date().toISOString(), checks: evaluate(msgs, draft, products, offers) };
    setLastEval(run); onSaveTest(run);
  };

  return (
    <div className="grid g-main-side">
      <Card title={<span className="row">Test conversation <SimBadge label="Simulated responder" /></span>} sub="Type as the customer. Replies come from a deterministic rule-based responder using this draft's greeting, products and objection library."
        actions={<Button size="xs" icon={<RotateCcw />} onClick={() => reset()}>Reset</Button>}>
        <div className="row-wrap" style={{ marginBottom: 12 }}>
          <span className="small muted">Scenarios:</span>
          {SCENARIOS.map((s) => <Button key={s.key} size="xs" onClick={() => runScenario(s)} disabled={running}>{s.label}</Button>)}
        </div>
        <div className="inset-box scroll-y" style={{ height: 360, background: '#FAFAFA' }}>
          <div className="transcript">
            {msgs.map((m, i) => m.who === 'System'
              ? <div key={i} className="row small muted"><span className="badge outline">System</span><span>{m.text}</span></div>
              : (
                <div key={i} className={`msg ${m.who === 'AI' ? 'ai' : 'customer'}`}>
                  <Avatar name={m.who === 'AI' ? draft.name : 'Alex Customer'} initials={m.who === 'AI' ? draft.name.slice(0, 2).toUpperCase() : 'AC'} size="sm" color={m.who === 'AI' ? draft.color : undefined} agent={m.who === 'AI'} />
                  <div className="msg-body">
                    <div className="msg-meta"><span className="msg-speaker">{m.who === 'AI' ? `${draft.name} (AI)` : 'Alex (test customer)'}</span>{m.meta && <Badge tone="outline">{m.meta}</Badge>}</div>
                    <div className="msg-text">{m.text}</div>
                  </div>
                </div>
              ))}
            {running && <div className="typing"><span /><span /><span /></div>}
            <div ref={endRef} />
          </div>
        </div>
        <form className="row mt-12" onSubmit={(e) => { e.preventDefault(); if (input.trim() && !running) { send(input.trim()); setInput(''); } }}>
          <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder={ctx.optedOut ? 'Call ended — reset to start again' : 'Type a customer reply, e.g. “How much is it?”'} disabled={ctx.optedOut || running} aria-label="Customer message" />
          <Button variant="secondary" icon={<Send />} disabled={!input.trim() || ctx.optedOut || running} onClick={() => { if (input.trim()) { send(input.trim()); setInput(''); } }}>Send</Button>
        </form>
      </Card>

      <div className="col gap-16">
        <Card title="Response evaluation" sub="Automated checks on the current transcript" actions={<Button size="xs" variant="primary" icon={<ClipboardCheck />} onClick={runEval} disabled={running || msgs.filter((m) => m.who === 'Customer').length === 0}>Evaluate</Button>}>
          {lastEval ? (
            <div className="col gap-12">
              {lastEval.checks.map((c) => (
                <div key={c.label} className="row" style={{ alignItems: 'flex-start' }}>
                  {c.pass ? <CheckCircle2 size={16} className="green" style={{ marginTop: 2, flexShrink: 0 }} /> : <XCircle size={16} className="red" style={{ marginTop: 2, flexShrink: 0 }} />}
                  <div className="grow"><div className="row between"><span className="small medium" style={{ color: 'var(--ink)' }}>{c.label}</span><Badge tone={c.pass ? 'green' : 'red'}>{c.pass ? 'Pass' : 'Fail'}</Badge></div><div className="xs muted">{c.detail}</div></div>
                </div>
              ))}
            </div>
          ) : <div className="small muted">Run a scenario or chat, then press Evaluate to score compliance disclosure, pricing accuracy, opt-out handling and tone.</div>}
        </Card>
        <Card flush title="Test history" sub={`${tests.length} evaluated test${tests.length === 1 ? '' : 's'} on this agent`}>
          <div style={{ padding: '0 16px 8px' }} className="list">
            {tests.slice(0, 6).map((t) => {
              const passed = t.checks.filter((c) => c.pass).length;
              return (
                <div key={t.id} className="list-item">
                  <div className="grow"><div className="cell-primary">{t.scenario}</div><div className="cell-sub mono">{fmtDateTime(t.at)}</div></div>
                  <Badge tone={passed === t.checks.length ? 'green' : 'red'}>{passed}/{t.checks.length} passed</Badge>
                </div>
              );
            })}
            {!tests.length && <EmptyState title="No tests yet" desc="Evaluated tests are saved with the agent." />}
          </div>
        </Card>
      </div>
    </div>
  );
}
