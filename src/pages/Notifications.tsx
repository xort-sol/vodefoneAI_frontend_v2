import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Bell, Check, Minus, BellOff, Bot, CalendarDays, CheckCheck, Gauge, ListChecks, Mail, Megaphone, MailOpen, ShieldAlert, Tag, Target,
} from 'lucide-react';
import { useApp } from '../store/store';
import type { Notification } from '../data/types';
import { Badge, Button, Card, EmptyState, PageHeader, Segmented, StatusBadge } from '../components/ui';
import { fmtDateTime, fmtRelative } from '../lib/format';
import { DAY, NOW, startOfDay } from '../data/seed';
import { AdminStyles, Chip } from './admin/shared';

type Cat = Notification['category'];
const CATS: { c: Cat; icon: JSX.Element; color: string; pref: string[] }[] = [
  { c: 'Leads', icon: <Target />, color: 'var(--tangerine)', pref: ['New qualified leads', 'High-priority leads'] },
  { c: 'Campaigns', icon: <Megaphone />, color: 'var(--blue)', pref: ['Campaign completion'] },
  { c: 'Agents', icon: <Bot />, color: 'var(--lavender)', pref: ['AI agent failures'] },
  { c: 'Capacity', icon: <Gauge />, color: 'var(--amber)', pref: ['Calling capacity limits'] },
  { c: 'Follow-ups', icon: <ListChecks />, color: 'var(--slate)', pref: ['Follow-up deadlines'] },
  { c: 'Appointments', icon: <CalendarDays />, color: 'var(--green)', pref: ['Appointments'] },
  { c: 'Offers', icon: <Tag />, color: 'var(--sapphire)', pref: ['Expired promotions'] },
  { c: 'Security', icon: <ShieldAlert />, color: 'var(--red)', pref: ['Unusual calling activity'] },
];
const CAT_META = Object.fromEntries(CATS.map((c) => [c.c, c])) as Record<Cat, (typeof CATS)[number]>;

export default function Notifications() {
  const app = useApp(); const nav = useNavigate();
  const [cats, setCats] = useState<Set<Cat>>(new Set());
  const [prio, setPrio] = useState<'all' | Notification['priority']>('all');
  const [view, setView] = useState<'all' | 'unread'>('all');

  const unread = app.notifications.filter((n) => !n.read).length;
  const list = useMemo(() => app.notifications
    .filter((n) => (!cats.size || cats.has(n.category)) && (prio === 'all' || n.priority === prio) && (view === 'all' || !n.read))
    .sort((a, b) => +new Date(b.at) - +new Date(a.at)), [app.notifications, cats, prio, view]);

  const today = startOfDay(NOW).getTime();
  const groups: [string, Notification[]][] = [
    ['Today', list.filter((n) => +new Date(n.at) >= today)],
    ['Yesterday', list.filter((n) => +new Date(n.at) < today && +new Date(n.at) >= today - DAY)],
    ['Earlier', list.filter((n) => +new Date(n.at) < today - DAY)],
  ];

  const toggleCat = (c: Cat) => { const n = new Set(cats); n.has(c) ? n.delete(c) : n.add(c); setCats(n); };
  const open = (n: Notification) => { if (!n.read) app.markNotification(n.id, true); nav(n.link); };
  const markAll = () => { app.markAllRead(); app.toast('All notifications marked as read', `${unread} updated`); };

  const prefs = app.settings.notify;
  const prefKeys = Object.keys(prefs);

  return (
    <>
      <AdminStyles />
      <PageHeader
        title="Notifications"
        desc="Alerts from leads, campaigns, AI agents, capacity, follow-ups and security — in one place."
        eyebrow={<Badge tone={unread ? 'blue' : 'neutral'} dot>{unread} unread</Badge>}
        actions={<>
          <Button size="sm" icon={<CheckCheck />} disabled={!unread} onClick={markAll}>Mark all read</Button>
          <Button size="sm" icon={<Bell />} onClick={() => nav('/settings?section=notifications')}>Preferences</Button>
        </>}
      />

      <div className="grid g-main-side">
        <Card flush>
          <div className="table-toolbar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
            <div className="row-wrap" style={{ gap: 6 }}>
              <Chip on={!cats.size} onClick={() => setCats(new Set())} count={app.notifications.length}>All</Chip>
              {CATS.map(({ c, icon }) => <Chip key={c} on={cats.has(c)} onClick={() => toggleCat(c)} count={app.notifications.filter((n) => n.category === c).length}>{icon}{c}</Chip>)}
            </div>
            <div className="row-wrap between">
              <Segmented value={view} onChange={setView} options={[{ value: 'all', label: 'All' }, { value: 'unread', label: `Unread (${unread})` }]} />
              <Segmented value={prio} onChange={setPrio} options={[{ value: 'all', label: 'Any priority' }, { value: 'High', label: 'High' }, { value: 'Medium', label: 'Medium' }, { value: 'Low', label: 'Low' }]} />
            </div>
          </div>
          {!list.length && <EmptyState icon={<BellOff size={18} />} title={view === 'unread' ? 'You’re all caught up' : 'No notifications'} desc="Nothing matches the current filters." action={(cats.size || prio !== 'all' || view !== 'all') ? <Button size="sm" onClick={() => { setCats(new Set()); setPrio('all'); setView('all'); }}>Reset filters</Button> : undefined} />}
          {groups.filter(([, items]) => items.length).map(([label, items]) => (
            <div key={label}>
              <div className="label" style={{ padding: '12px 16px 6px', borderBottom: '1px solid var(--ash)', background: '#fafafa' }}>{label} <span className="mono">· {items.length}</span></div>
              {items.map((n) => {
                const meta = CAT_META[n.category];
                return (
                  <div key={n.id} className={`adm-notif ${n.read ? '' : 'unread'}`} onClick={() => open(n)} role="link" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && open(n)}>
                    <span className="adm-notif-icon" style={{ color: meta.color }}>{meta.icon}</span>
                    <div className="grow">
                      <div className="row between" style={{ alignItems: 'flex-start', gap: 12 }}>
                        <div className={n.read ? 'medium' : 'strong'} style={{ color: 'var(--ink)', fontSize: 13.5 }}>{n.title}</div>
                        <span className="mono xs muted nowrap" title={fmtDateTime(n.at)}>{fmtRelative(n.at)}</span>
                      </div>
                      <div className="small subtle mt-4">{n.body}</div>
                      <div className="row-wrap mt-8" style={{ gap: 6 }}>
                        <Badge tone="outline">{n.category}</Badge>
                        <StatusBadge status={n.priority} dot={false} />
                        <span className="mono xs muted">{n.id}</span>
                        <span className="grow" />
                        <Button size="xs" variant="ghost" icon={n.read ? <Mail size={12} /> : <MailOpen size={12} />} onClick={(e) => { e.stopPropagation(); app.markNotification(n.id, !n.read); }}>{n.read ? 'Mark unread' : 'Mark read'}</Button>
                        <Button size="xs" variant="ghost" iconRight={<ArrowRight size={12} />} onClick={(e) => { e.stopPropagation(); open(n); }}>Open</Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </Card>

        <div className="col" style={{ gap: 16 }}>
          <Card title="By category" sub="Unread / total">
            <div className="col" style={{ gap: 8 }}>
              {CATS.map(({ c, icon, color }) => {
                const all = app.notifications.filter((n) => n.category === c); const u = all.filter((n) => !n.read).length;
                return (
                  <div key={c} className="row between small card-link" style={{ cursor: 'pointer' }} onClick={() => setCats(new Set([c]))}>
                    <span className="row gap-4"><span style={{ color, display: 'inline-flex' }}>{icon && <span style={{ width: 14, height: 14, display: 'inline-flex' }}>{icon}</span>}</span>{c}</span>
                    <span className="mono">{u ? <b className="blue">{u}</b> : 0} / {all.length}</span>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card title="Notification preferences" sub="Delivery channels for your account" actions={<Button size="xs" variant="ghost" iconRight={<ArrowRight size={12} />} onClick={() => nav('/settings?section=notifications')}>Edit</Button>}>
            <div className="row between xs muted" style={{ paddingBottom: 6, borderBottom: '1px solid var(--ash)' }}><span>Event</span><span className="row" style={{ gap: 0 }}><span style={{ width: 48, textAlign: 'center' }}>In-app</span><span style={{ width: 48, textAlign: 'center' }}>Email</span></span></div>
            <div className="col" style={{ gap: 0 }}>
              {prefKeys.map((k) => (
                <div key={k} className="row between small" style={{ padding: '7px 0', borderBottom: '1px solid var(--ash)' }}>
                  <span className="truncate">{k}</span>
                  <span className="row" style={{ gap: 0 }}>
                    <PrefMark on={prefs[k].inApp} label={`${k} in-app`} />
                    <PrefMark on={prefs[k].email} label={`${k} email`} />
                  </span>
                </div>
              ))}
            </div>
            <div className="xs muted mt-8">{prefKeys.filter((k) => prefs[k].email).length} of {prefKeys.length} events also sent by email. Change these in Settings.</div>
          </Card>
        </div>
      </div>
    </>
  );
}

function PrefMark({ on, label }: { on: boolean; label: string }) {
  return <span style={{ width: 48, display: 'inline-flex', justifyContent: 'center' }} aria-label={`${label}: ${on ? 'on' : 'off'}`} title={on ? 'On' : 'Off'}>{on ? <span className="adm-check"><Check size={13} /></span> : <Minus size={14} style={{ color: 'var(--smoke)' }} />}</span>;
}
