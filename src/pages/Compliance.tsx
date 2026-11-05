import { useSearchParams } from 'react-router-dom';
import { Download, ShieldCheck } from 'lucide-react';
import { useApp } from '../store/store';
import { Badge, Button, PageHeader, SimBadge, Tabs } from '../components/ui';
import { AdminStyles, ReadOnlyNotice } from './admin/shared';
import { ConsentTab, HoursTab, OptOutTab, OverviewTab, RecordingTab, SuppressionTab, useCompliance } from './admin/complianceA';
import { AccessTab, ActivityTab, AuditTab, DsrTab, SecurityTab } from './admin/complianceB';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'consent', label: 'Consent records' },
  { value: 'suppression', label: 'Do-not-call & suppression' },
  { value: 'optout', label: 'Opt-outs' },
  { value: 'hours', label: 'Calling hours' },
  { value: 'recording', label: 'Recording & retention' },
  { value: 'access', label: 'Data access' },
  { value: 'dsr', label: 'Data subject requests' },
  { value: 'audit', label: 'Audit logs' },
  { value: 'activity', label: 'User activity' },
  { value: 'security', label: 'Security controls' },
] as const;
type Tab = (typeof TABS)[number]['value'];

export default function Compliance() {
  const app = useApp();
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('tab') ?? 'overview';
  const tab: Tab = (TABS.some((t) => t.value === raw) ? raw : 'overview') as Tab;
  const go = (t: string) => { const n = new URLSearchParams(sp); n.set('tab', t); setSp(n); window.scrollTo({ top: 0 }); };
  const canEdit = app.can('compliance.manage');
  const c = useCompliance();
  const openDsr = app.deletionRequests.filter((d) => !['Completed', 'Rejected'].includes(d.status)).length;

  const report = () => { app.audit('Exported compliance report', 'Compliance posture (PDF)', 'Export'); app.toast('Compliance report queued', 'PDF generation is a backend integration point', 'info'); };

  return (
    <>
      <AdminStyles />
      <PageHeader
        title="Compliance & security"
        desc="Controls that every simulated call must pass, the records that prove consent, and the security policy that protects customer data."
        eyebrow={<><Badge tone={c.score >= 90 ? 'green' : 'amber'} dot><ShieldCheck size={11} />Score {c.score}/100</Badge><SimBadge /></>}
        actions={<Button size="sm" icon={<Download />} onClick={report}>Compliance report</Button>}
      />
      <Tabs value={tab} onChange={go} tabs={TABS.map((t) => ({ ...t, label: t.label, count: t.value === 'dsr' ? openDsr : t.value === 'suppression' ? app.suppressions.length : undefined }))} />
      {!canEdit && tab !== 'overview' && tab !== 'access' && tab !== 'audit' && tab !== 'consent' && <ReadOnlyNotice perm="compliance.manage" what="compliance controls" />}
      {tab === 'overview' && <OverviewTab go={go} />}
      {tab === 'consent' && <ConsentTab />}
      {tab === 'suppression' && <SuppressionTab canEdit={canEdit} />}
      {tab === 'optout' && <OptOutTab canEdit={canEdit} />}
      {tab === 'hours' && <HoursTab canEdit={canEdit} />}
      {tab === 'recording' && <RecordingTab canEdit={canEdit} />}
      {tab === 'access' && <AccessTab />}
      {tab === 'dsr' && <DsrTab canEdit={canEdit} />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'activity' && <ActivityTab canEdit={canEdit} />}
      {tab === 'security' && <SecurityTab canEdit={canEdit} />}
    </>
  );
}
