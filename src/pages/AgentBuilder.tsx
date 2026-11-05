import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Bot, CircleDot, FlaskConical, GitBranch, History, ListChecks, MessageSquareText, Mic, PhoneOff, Rocket,
  Save, ShieldAlert, Smile, FileText, Undo2, Workflow, Lock,
} from 'lucide-react';
import { useApp } from '../store/store';
import { Avatar, Badge, Button, EmptyState, Field, Modal, PageHeader, SimBadge, StatusBadge, useConfirm } from '../components/ui';
import { fmtRelative } from '../lib/format';
import type { Agent } from '../data/types';
import { builderOf, bumpVersion, diffSummary, draftOf, versionsOf, type AgentX, type Builder, type Draft, type TestRun } from './agents/model';
import {
  Escalation, Ending, Identity, Instructions, Knowledge, Objections, Personality, Publishing, Qualification, Scripts, Versions, Voice, type CheckItem,
} from './agents/Sections';
import FlowBuilder from './agents/FlowBuilder';
import Simulator from './agents/Simulator';

const SECTIONS = [
  { key: 'identity', label: 'Agent identity', icon: <Bot size={15} /> },
  { key: 'voice', label: 'Voice & language', icon: <Mic size={15} /> },
  { key: 'personality', label: 'Personality & style', icon: <Smile size={15} /> },
  { key: 'instructions', label: 'Agent instructions', icon: <FileText size={15} /> },
  { key: 'scripts', label: 'Conversation scripts', icon: <MessageSquareText size={15} /> },
  { key: 'flow', label: 'Conversation flow', icon: <Workflow size={15} /> },
  { key: 'knowledge', label: 'Product knowledge', icon: <BookOpen size={15} /> },
  { key: 'objections', label: 'Objection handling', icon: <ShieldAlert size={15} /> },
  { key: 'qualification', label: 'Qualification criteria', icon: <ListChecks size={15} /> },
  { key: 'escalation', label: 'Escalation rules', icon: <GitBranch size={15} /> },
  { key: 'ending', label: 'Call ending', icon: <PhoneOff size={15} /> },
  { key: 'testing', label: 'Testing & simulation', icon: <FlaskConical size={15} /> },
  { key: 'versions', label: 'Version history', icon: <History size={15} /> },
  { key: 'publishing', label: 'Publishing', icon: <Rocket size={15} /> },
] as const;
type SectionKey = typeof SECTIONS[number]['key'];

export default function AgentBuilder() {
  const { id = '' } = useParams();
  const app = useApp();
  const agent = app.agentById.get(id) as AgentX | undefined;
  if (!agent) {
    return (<>
      <PageHeader title="Agent not found" />
      <EmptyState icon={<Bot size={18} />} title={`No agent with ID ${id}`} desc="It may have been removed." action={<Button onClick={() => history.back()} icon={<ArrowLeft />}>Back to agents</Button>} />
    </>);
  }
  return <Builder key={agent.id} agent={agent} />;
}

function Builder({ agent }: { agent: AgentX }) {
  const app = useApp(); const nav = useNavigate(); const confirm = useConfirm();
  const [sp, setSp] = useSearchParams();
  const section = (SECTIONS.some((s) => s.key === sp.get('section')) ? sp.get('section') : 'identity') as SectionKey;
  const go = (k: SectionKey) => { const n = new URLSearchParams(sp); n.set('section', k); setSp(n, { replace: true }); window.scrollTo({ top: 0 }); };

  const canEdit = app.can('agents.edit'); const canPublish = app.can('agents.publish');
  const ro = !canEdit || !!agent.archived;
  const baseline = useMemo(() => draftOf(agent, app.products), [agent, app.products]);
  const [draft, setDraft] = useState<Draft>(baseline);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const changed = diffSummary(baseline, draft);
  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const setB = (p: Partial<Draft['builder']>) => setDraft((d) => ({ ...d, builder: { ...d.builder, ...p } }));
  const [publishOpen, setPublishOpen] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const stored = builderOf(agent, app.products);
  const persist = (d: Draft, extra: Partial<Agent> = {}, builderExtra: Partial<Builder> = {}) => {
    const builder: Builder = { ...stored, ...d.builder, tests: stored.tests, snapshots: stored.snapshots, ...builderExtra };
    const { builder: _b, ...fields } = d;
    app.updateAgent(agent.id, { ...fields, initials: d.name.slice(0, 2).toUpperCase(), updatedAt: new Date().toISOString(), ...extra, builder } as Partial<Agent>);
  };

  const draftVersion = `${bumpVersion(agent.version)}-draft`;
  const saveDraft = () => {
    if (!draft.name.trim()) { app.toast('Name is required', 'Add a name in Agent identity before saving.', 'error'); go('identity'); return; }
    const versions = [...versionsOf(agent).filter((v) => v.status !== 'Draft'), { version: draftVersion, at: new Date().toISOString(), author: app.me.name, note: `Draft: ${changed.length ? `updated ${changed.join(', ').toLowerCase()}` : 'saved'}`, status: 'Draft' as const }];
    persist(draft, { versions }, { snapshots: { [agent.version]: baseline, ...stored.snapshots, [draftVersion]: draft } });
    app.audit('Saved AI agent draft', `${draft.name} ${draftVersion}`, 'Agent');
    app.toast('Draft saved', `${draftVersion} · ${changed.length ? changed.join(', ') : 'no configuration changes'}`);
  };
  const discard = async () => {
    if (await confirm({ title: 'Discard unsaved changes?', desc: `Changes to ${changed.join(', ') || 'this agent'} will be lost.`, danger: true, confirmLabel: 'Discard' })) setDraft(baseline);
  };
  const saveTest = (t: TestRun) => {
    app.updateAgent(agent.id, { builder: { ...stored, tests: [t, ...stored.tests].slice(0, 30) } } as Partial<Agent>);
    const passed = t.checks.filter((c) => c.pass).length;
    app.toast(`Test evaluated: ${passed}/${t.checks.length} passed`, `${t.scenario} · simulated`, passed === t.checks.length ? 'success' : 'info');
  };

  const approvedScripts = draft.builder.scripts.every((s) => app.productById.get(s.productId)?.approved);
  const lastTest = stored.tests[0];
  const weights = draft.builder.criteria.filter((c) => c.enabled).reduce((s, c) => s + c.weight, 0);
  const checklist: CheckItem[] = [
    { label: 'Mandatory disclosure configured', ok: !!draft.builder.disclosure.trim(), detail: 'Agent states it is an AI and the call is recorded.', blocking: true },
    { label: 'Agent name and system prompt set', ok: !!draft.name.trim() && draft.instructions.trim().length > 40 && draft.instructions.length <= 4000, detail: 'Instructions between 40 and 4,000 characters.', blocking: true },
    { label: 'Human escalation available', ok: draft.escalation.some((r) => /person|human/i.test(r.rule) && r.enabled), detail: 'Customer can always ask for a person.', blocking: true },
    { label: 'Opt-outs added to suppression list', ok: draft.builder.ending.suppress, detail: 'Required by PECR for outbound marketing.', blocking: true },
    { label: 'Qualification weights total 100', ok: weights === 100 && draft.builder.warmThreshold < draft.builder.hotThreshold, detail: `Currently ${weights}; warm threshold below hot.`, blocking: true },
    { label: 'Scripts use approved products only', ok: approvedScripts, detail: approvedScripts ? 'All scripted products have approved pricing.' : 'One or more scripted products are pending approval.', blocking: false },
    { label: 'Simulation test passed', ok: !!lastTest && lastTest.checks.every((c) => c.pass), detail: lastTest ? `Last test “${lastTest.scenario}” ${fmtRelative(lastTest.at)}` : 'Run and evaluate at least one test in Testing & simulation.', blocking: false },
    { label: 'Draft saved', ok: !dirty, detail: dirty ? 'Unsaved changes will be included when you publish.' : 'All changes saved.', blocking: false },
  ];
  const blocking = checklist.filter((c) => !c.ok && c.blocking);

  const publish = (note: string) => {
    const nv = bumpVersion(agent.version);
    const now = new Date().toISOString();
    const versions = [
      ...versionsOf(agent).filter((v) => v.status !== 'Draft').map((v) => (v.status === 'Published' ? { ...v, status: 'Archived' as const } : v)),
      { version: nv, at: now, author: app.me.name, note, status: 'Published' as const },
    ];
    const env = draft.builder.environment;
    persist(draft, { versions, version: nv, status: env === 'Live' ? 'Live' : env === 'Testing' ? 'Testing' : 'Draft' }, { snapshots: { [agent.version]: baseline, ...stored.snapshots, [nv]: draft } });
    app.audit(`Published AI agent ${nv} to ${env}`, `${draft.name} — ${note}`, 'Agent');
    app.toast(`${draft.name} ${nv} published`, `${env} environment${env === 'Live' ? ` · ${draft.builder.trafficSplit}% of traffic` : ''}`);
    setPublishOpen(false);
  };
  const restore = (version: string) => {
    const snap = stored.snapshots[version];
    const versions = versionsOf(agent).map((v) => (v.version === version ? { ...v, status: 'Published' as const } : v.status === 'Published' ? { ...v, status: 'Archived' as const } : v));
    if (snap) { persist(snap, { versions, version }); setDraft(snap); }
    else app.updateAgent(agent.id, { versions, version, updatedAt: new Date().toISOString() });
    app.audit(`Rolled back AI agent to ${version}`, agent.name, 'Agent');
    app.toast(`Rolled back to ${version}`, `${agent.version} archived.`);
  };

  const cur = SECTIONS.find((s) => s.key === section)!;
  const sp_ = { draft, set, setB, ro };
  const dirtySet = new Set(changed);
  const SEC_DIFF: Partial<Record<SectionKey, string>> = { identity: 'Identity', voice: 'Voice', personality: 'Personality', instructions: 'Instructions', scripts: 'Scripts', flow: 'Flow', knowledge: 'Knowledge base', objections: 'Objections', qualification: 'Qualification', escalation: 'Escalation', ending: 'Call ending', publishing: 'Publishing' };

  return (
    <>
      <div className="row small" style={{ marginBottom: 12 }}><Button size="xs" variant="ghost" icon={<ArrowLeft />} onClick={() => nav('/agents')}>AI agents</Button></div>
      <PageHeader
        title={<span className="row" style={{ gap: 12 }}><Avatar initials={draft.name.slice(0, 2).toUpperCase() || '?'} color={draft.color} agent size="lg" />{draft.name || 'Unnamed agent'}</span>}
        eyebrow={<>
          {agent.archived ? <Badge tone="outline">Archived</Badge> : <StatusBadge status={agent.status} />}
          <Badge tone="outline"><span className="mono">{agent.version}</span></Badge>
          {dirty ? <Badge tone="amber" dot>Unsaved changes{changed.length ? ` · ${changed.length} section${changed.length > 1 ? 's' : ''}` : ''}</Badge> : <span className="xs muted">Saved · updated {fmtRelative(agent.updatedAt)}</span>}
          {ro && <Badge tone="neutral"><Lock size={11} />{agent.archived ? 'Archived — read only' : 'Read only for your role'}</Badge>}
        </>}
        desc={`${draft.voice} · ${draft.language} · ${draft.accent}`}
        actions={<>
          {dirty && <Button size="sm" variant="ghost" icon={<Undo2 />} onClick={discard}>Discard</Button>}
          <Button size="sm" icon={<Save />} onClick={saveDraft} disabled={ro || !dirty} title={ro ? 'You do not have permission to edit agents' : !dirty ? 'No unsaved changes' : undefined}>Save draft</Button>
          <Button size="sm" icon={<FlaskConical />} onClick={() => go('testing')}>Test</Button>
          <Button size="sm" variant="primary" icon={<Rocket />} disabled={!canPublish || !!agent.archived} title={!canPublish ? 'Publishing requires the agents.publish permission (Administrator or Super Admin)' : undefined} onClick={() => setPublishOpen(true)}>Publish</Button>
        </>}
      />

      <div className="builder-layout">
        <nav className="builder-nav" aria-label="Builder sections">
          <div className="steps">
            {SECTIONS.map((s, i) => (
              <button key={s.key} className={`step ${section === s.key ? 'on' : ''}`} onClick={() => go(s.key)} aria-current={section === s.key ? 'page' : undefined}>
                <span className="step-num">{i + 1}</span>
                <span className="grow truncate">{s.label}</span>
                {SEC_DIFF[s.key] && dirtySet.has(SEC_DIFF[s.key]!) && <CircleDot size={12} style={{ color: 'var(--amber)' }} aria-label="Unsaved" />}
              </button>
            ))}
          </div>
        </nav>
        <select className="select builder-nav-mobile" value={section} onChange={(e) => go(e.target.value as SectionKey)} aria-label="Builder section">
          {SECTIONS.map((s, i) => <option key={s.key} value={s.key}>{i + 1}. {s.label}</option>)}
        </select>

        <div style={{ minWidth: 0 }}>
          <div className="row between" style={{ marginBottom: 12 }}>
            <div className="row"><span style={{ color: 'var(--fog)' }}>{cur.icon}</span><span className="section-title">{cur.label}</span></div>
            {section === 'testing' && <SimBadge />}
          </div>
          {section === 'identity' && <Identity {...sp_} />}
          {section === 'voice' && <Voice {...sp_} />}
          {section === 'personality' && <Personality {...sp_} />}
          {section === 'instructions' && <Instructions {...sp_} />}
          {section === 'scripts' && <Scripts {...sp_} />}
          {section === 'flow' && (
            <div className="card">
              <div className="card-head"><div className="grow"><div className="card-title">Conversation-flow builder</div><div className="card-sub">Drag nodes to arrange, select to edit, use Connect mode to link steps. Dashed edges are alternative branches.</div></div></div>
              <FlowBuilder flow={draft.builder.flow} onChange={(f) => setB({ flow: f })} readOnly={ro} />
            </div>
          )}
          {section === 'knowledge' && <Knowledge {...sp_} />}
          {section === 'objections' && <Objections {...sp_} />}
          {section === 'qualification' && <Qualification {...sp_} />}
          {section === 'escalation' && <Escalation {...sp_} />}
          {section === 'ending' && <Ending {...sp_} />}
          {section === 'testing' && (<>
            <div className="banner sim" style={{ marginBottom: 12 }}><FlaskConical />Testing runs entirely in the browser against the current draft{dirty ? ' (including unsaved changes)' : ''}. No call is placed and no customer is contacted.</div>
            <Simulator key={JSON.stringify([draft.greeting, draft.builder.disclosure])} draft={draft} products={app.products} offers={app.offers} tests={stored.tests} onSaveTest={saveTest} />
          </>)}
          {section === 'versions' && <Versions agent={agent} draft={draft} canPublish={canPublish} onRestore={restore} />}
          {section === 'publishing' && <Publishing {...sp_} checklist={checklist} agentId={agent.id} />}

          <div className="row between mt-16">
            <Button size="sm" variant="ghost" disabled={SECTIONS[0].key === section} onClick={() => go(SECTIONS[Math.max(0, SECTIONS.findIndex((s) => s.key === section) - 1)].key)}>← Previous</Button>
            <Button size="sm" variant="ghost" disabled={SECTIONS[SECTIONS.length - 1].key === section} onClick={() => go(SECTIONS[Math.min(SECTIONS.length - 1, SECTIONS.findIndex((s) => s.key === section) + 1)].key)}>Next →</Button>
          </div>
        </div>
      </div>

      <style>{'@media(max-width:720px){.page-head > .grow{flex-basis:100%}}'}</style>
      {publishOpen && <PublishModal agent={agent} draft={draft} changed={changed} checklist={checklist} blocking={blocking} onClose={() => setPublishOpen(false)} onPublish={publish} />}
      <style>{`
        .builder-layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:24px;align-items:start}
        .builder-nav{position:sticky;top:72px}
        .builder-nav-mobile{display:none}
        @media(max-width:860px){.builder-layout{grid-template-columns:minmax(0,1fr);gap:12px}.builder-nav{display:none}.builder-nav-mobile{display:block}}
      `}</style>
    </>
  );
}

function PublishModal({ agent, draft, changed, checklist, blocking, onClose, onPublish }: { agent: AgentX; draft: Draft; changed: string[]; checklist: CheckItem[]; blocking: CheckItem[]; onClose: () => void; onPublish: (note: string) => void }) {
  const [note, setNote] = useState(''); const [tried, setTried] = useState(false);
  const err = note.trim().length < 8 ? 'Describe the change (at least 8 characters)' : '';
  const nv = bumpVersion(agent.version);
  const warnings = checklist.filter((c) => !c.ok && !c.blocking);
  const submit = () => { setTried(true); if (err || blocking.length) return; onPublish(note.trim()); };
  return (
    <Modal open onClose={onClose} title={`Publish ${draft.name} ${nv}`} desc={`Replaces ${agent.version}, which will be archived. Environment: ${draft.builder.environment}${draft.builder.environment === 'Live' ? ` · ${draft.builder.trafficSplit}% traffic` : ''}.`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={<Rocket />} onClick={submit} disabled={blocking.length > 0}>Publish {nv}</Button></>}>
      <div className="col gap-12">
        {blocking.length > 0 && <div className="banner warn"><ShieldAlert /><div><b>Cannot publish yet.</b> Fix: {blocking.map((b) => b.label.toLowerCase()).join('; ')}.</div></div>}
        {warnings.length > 0 && !blocking.length && <div className="banner info"><ShieldAlert /><div>Warnings: {warnings.map((w) => w.label.toLowerCase()).join('; ')}.</div></div>}
        <div className="small"><span className="muted">Changed since last save:</span> {changed.length ? changed.join(', ') : 'none (publishing the saved draft)'}</div>
        <Field label="Change note" required error={tried && err} hint="Recorded in version history and the audit log">
          <textarea className={`textarea ${tried && err ? 'invalid' : ''}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Updated Winter Switch pricing and shortened introduction" autoFocus />
        </Field>
      </div>
    </Modal>
  );
}
