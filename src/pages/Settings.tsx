import { useSearchParams } from 'react-router-dom';
import {
  Bell, Bot, Building2, CalendarDays, Database, FileClock, Gauge, KeyRound, LayoutGrid, Mic, PhoneCall, Route, Shield, ShieldCheck, Users, Workflow,
} from 'lucide-react';
import { useApp } from '../store/store';
import { Card, PageHeader } from '../components/ui';
import { AdminStyles, ReadOnlyNotice } from './admin/shared';
import { SecurityForm } from './admin/complianceB';
import {
  AISection, AssignmentSection, AuditSection, CallingSection, IntegrationSection, NotifySection, OrganisationSection, PermissionsSection,
  QualificationSection, RetentionSection, UsersSection, VoiceSection, WorkspaceSection,
} from './admin/settingsSections';

const SECTIONS = [
  { id: 'organisation', label: 'Organisation', icon: <Building2 />, group: 'General' },
  { id: 'workspace', label: 'Workspace', icon: <LayoutGrid />, group: 'General' },
  { id: 'users', label: 'User management', icon: <Users />, group: 'General' },
  { id: 'permissions', label: 'Permissions', icon: <KeyRound />, group: 'General' },
  { id: 'ai', label: 'AI configuration', icon: <Bot />, group: 'Calling' },
  { id: 'voice', label: 'Voice settings', icon: <Mic />, group: 'Calling' },
  { id: 'calling', label: 'Calling rules', icon: <Gauge />, group: 'Calling' },
  { id: 'qualification', label: 'Qualification rules', icon: <ShieldCheck />, group: 'Calling' },
  { id: 'assignment', label: 'Lead assignment', icon: <Route />, group: 'Calling' },
  { id: 'notifications', label: 'Notification preferences', icon: <Bell />, group: 'Calling' },
  { id: 'telephony', label: 'Telephony integrations', icon: <PhoneCall />, group: 'Integrations' },
  { id: 'crm', label: 'CRM integrations', icon: <Workflow />, group: 'Integrations' },
  { id: 'calendar', label: 'Calendar integrations', icon: <CalendarDays />, group: 'Integrations' },
  { id: 'security', label: 'Security', icon: <Shield />, group: 'Security & data' },
  { id: 'retention', label: 'Data retention', icon: <Database />, group: 'Security & data' },
  { id: 'audit', label: 'Audit logs', icon: <FileClock />, group: 'Security & data' },
] as const;
type Section = (typeof SECTIONS)[number]['id'];

export default function Settings() {
  const app = useApp();
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('section') ?? 'organisation';
  const section: Section = (SECTIONS.some((s) => s.id === raw) ? raw : 'organisation') as Section;
  const go = (s: string) => { const n = new URLSearchParams(sp); n.set('section', s); setSp(n, { replace: true }); };
  const canEdit = app.can('settings.manage');
  const groups = [...new Set(SECTIONS.map((s) => s.group))];
  const readOnlyRelevant = !['users', 'permissions', 'audit'].includes(section);

  return (
    <>
      <AdminStyles />
      <PageHeader title="Settings" desc="Organisation-wide configuration for the AI sales operation — calling rules, AI behaviour, integrations and security." />
      <div className="grid g-side-main" style={{ alignItems: 'start' }}>
        <div>
          <select className="select mobile-only" style={{ width: '100%' }} value={section} onChange={(e) => go(e.target.value)} aria-label="Settings section">
            {groups.map((g) => <optgroup key={g} label={g}>{SECTIONS.filter((s) => s.group === g).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>)}
          </select>
          <Card className="desktop-only adm-section-nav" style={{ padding: 8, position: 'sticky', top: 72 }}>
            <nav className="steps" aria-label="Settings sections">
              {groups.map((g) => (
                <div key={g} style={{ marginBottom: 6 }}>
                  <div className="label" style={{ padding: '8px 10px 4px' }}>{g}</div>
                  {SECTIONS.filter((s) => s.group === g).map((s) => (
                    <button key={s.id} type="button" className={`step ${section === s.id ? 'on' : ''}`} onClick={() => go(s.id)} aria-current={section === s.id ? 'page' : undefined}>{s.icon}{s.label}</button>
                  ))}
                </div>
              ))}
            </nav>
          </Card>
        </div>
        <div style={{ minWidth: 0 }}>
          {!canEdit && readOnlyRelevant && <ReadOnlyNotice perm="settings.manage" what="settings" />}
          {section === 'organisation' && <OrganisationSection canEdit={canEdit} />}
          {section === 'workspace' && <WorkspaceSection canEdit={canEdit} />}
          {section === 'users' && <UsersSection />}
          {section === 'permissions' && <PermissionsSection />}
          {section === 'ai' && <AISection canEdit={canEdit} />}
          {section === 'voice' && <VoiceSection canEdit={canEdit} />}
          {section === 'calling' && <CallingSection canEdit={canEdit} />}
          {section === 'qualification' && <QualificationSection canEdit={canEdit} />}
          {section === 'assignment' && <AssignmentSection canEdit={canEdit} />}
          {section === 'notifications' && <NotifySection canEdit={canEdit} />}
          {section === 'telephony' && <IntegrationSection key="tel" title="Telephony" desc="Carriers and contact-centre platforms that place and transfer calls" names={['Twilio Voice', 'Vonage', 'Genesys Cloud']} scope="telephony" canEdit={canEdit} />}
          {section === 'crm' && <IntegrationSection key="crm" title="CRM & data" desc="Systems of record for leads, outcomes and analytics" names={['Salesforce', 'Microsoft Dynamics 365', 'HubSpot', 'Snowflake']} scope="crm" canEdit={canEdit} />}
          {section === 'calendar' && <IntegrationSection key="cal" title="Calendars" desc="Where AI-booked appointments are created" names={['Google Calendar', 'Microsoft Outlook']} scope="calendar" canEdit={canEdit} />}
          {section === 'security' && <Card title="Security" sub="Authentication and session policy"><SecurityForm canEdit={canEdit} reason="Requires settings.manage permission" /></Card>}
          {section === 'retention' && <RetentionSection canEdit={canEdit} />}
          {section === 'audit' && <AuditSection />}
        </div>
      </div>
    </>
  );
}
