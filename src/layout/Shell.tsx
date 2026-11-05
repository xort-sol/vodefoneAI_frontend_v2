import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard, Users, PhoneCall, Megaphone, Bot, MessagesSquare, BadgeCheck, CalendarClock, BarChart3, Package,
  UserCog, History, ShieldCheck, Bell, Settings as SettingsIcon, PanelLeftClose, PanelLeftOpen, Search, ChevronDown,
  Menu as MenuIcon, LogOut, User, Check, Briefcase, CheckCircle2, AlertCircle, Info, X, ChevronRight, FlaskConical, Building2,
} from 'lucide-react';
import { useApp } from '../store/store';
import { Avatar, Badge, Button, Menu, MenuItem } from '../components/ui';
import { fmtRelative } from '../lib/format';
import type { Role } from '../data/types';

interface NavDef { to: string; label: string; icon: React.ReactNode; count?: (s: ReturnType<typeof useApp>) => number | undefined; children?: { to: string; label: string }[] }
const MAIN: NavDef[] = [
  { to: '/', label: 'Overview', icon: <LayoutDashboard /> },
  { to: '/leads', label: 'Leads & Contacts', icon: <Users /> },
  { to: '/calling', label: 'AI Calling Centre', icon: <PhoneCall />, count: (s) => s.live.length || undefined },
  { to: '/campaigns', label: 'Campaigns', icon: <Megaphone /> },
  { to: '/agents', label: 'AI Agents', icon: <Bot /> },
  { to: '/conversations', label: 'Conversations', icon: <MessagesSquare /> },
  { to: '/qualified', label: 'Qualified Leads', icon: <BadgeCheck />, count: (s) => s.leads.filter((l) => (l.status === 'Hot' || l.status === 'Warm') && !l.assignedRepId).length || undefined },
  { to: '/appointments', label: 'Appointments', icon: <CalendarClock /> },
  { to: '/workspace', label: 'My Workspace', icon: <Briefcase /> },
];
const MGMT: NavDef[] = [
  { to: '/analytics', label: 'Analytics & Reports', icon: <BarChart3 />, children: [
    { to: '/analytics?tab=calls', label: 'Call analytics' }, { to: '/analytics?tab=leads', label: 'Lead analytics' },
    { to: '/analytics?tab=ai', label: 'AI performance' }, { to: '/analytics?tab=cost', label: 'Cost analytics' }, { to: '/analytics?tab=builder', label: 'Report builder' },
  ] },
  { to: '/products', label: 'Products & Offers', icon: <Package /> },
  { to: '/team', label: 'Sales Team', icon: <UserCog /> },
  { to: '/history', label: 'Call History & Logs', icon: <History /> },
  { to: '/compliance', label: 'Compliance & Security', icon: <ShieldCheck /> },
  { to: '/notifications', label: 'Notifications', icon: <Bell />, count: (s) => s.notifications.filter((n) => !n.read).length || undefined },
  { to: '/settings', label: 'Settings', icon: <SettingsIcon /> },
];
const LABELS: Record<string, string> = Object.fromEntries([...MAIN, ...MGMT].map((n) => [n.to.slice(1) || '', n.label]));

function NavItem({ n, collapsed, onNavigate }: { n: NavDef; collapsed: boolean; onNavigate: () => void }) {
  const app = useApp(); const loc = useLocation();
  const active = n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to);
  const count = n.count?.(app);
  return (
    <>
      <NavLink to={n.to} end={n.to === '/'} className={`nav-item ${active ? 'active' : ''}`} title={collapsed ? n.label : undefined} onClick={onNavigate}>
        {n.icon}<span className="nav-label">{n.label}</span>{count !== undefined && <span className="nav-count">{count}</span>}
      </NavLink>
      {n.children && active && (
        <div className="nav-sub">
          {n.children.map((c) => {
            const on = loc.pathname + loc.search === c.to || (c.to.endsWith('tab=calls') && loc.pathname === n.to && !loc.search);
            return <Link key={c.to} to={c.to} className={`nav-item ${on ? 'active' : ''}`} style={on ? { background: 'transparent', color: 'var(--ink)' } : undefined} onClick={onNavigate}><span className="nav-label">{c.label}</span></Link>;
          })}
        </div>
      )}
    </>
  );
}

function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }: { collapsed: boolean; setCollapsed: (v: boolean) => void; mobileOpen: boolean; setMobileOpen: (v: boolean) => void }) {
  const { settings } = useApp();
  const close = () => setMobileOpen(false);
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`} aria-label="Primary">
      <div className="sidebar-head">
        <span className="brand-mark" aria-hidden><svg width="14" height="14" viewBox="0 0 24 24"><path fill="#fff" d="M13.6 4.2c-3.9.7-6.9 4-6.9 8.3 0 4.4 3.4 7.6 7.2 7.6 3.6 0 6.4-2.7 6.4-6.4 0-3.3-2.2-5.4-5.3-6.1v-.2c0-1.3.7-2.4 1.5-3.1-.9 0-1.9 0-2.9-.1z" /></svg></span>
        <div className="brand-text grow" style={{ minWidth: 0 }}>
          <div className="brand-name">Vodafone</div>
          <div className="brand-sub">AI Sales Operations</div>
        </div>
        <Button variant="ghost" size="xs" iconOnly className="mobile-only" icon={<X />} onClick={close} aria-label="Close menu" />
      </div>
      <div className="sidebar-scroll">
        <div className="nav-section">
          <div className="nav-section-title label">Operations</div>
          {MAIN.map((n) => <NavItem key={n.to} n={n} collapsed={collapsed} onNavigate={close} />)}
        </div>
        <div className="nav-section">
          <div className="nav-section-title label">Management</div>
          {MGMT.map((n) => <NavItem key={n.to} n={n} collapsed={collapsed} onNavigate={close} />)}
        </div>
      </div>
      <div className="sidebar-foot">
        {!collapsed && (
          <div className="inset-box sidebar-foot-text" style={{ marginBottom: 8, padding: 10 }}>
            <div className="row small strong"><FlaskConical size={13} className="muted" />Demonstration mode</div>
            <div className="xs muted mt-4">All calls are simulated. No real outbound calls are placed. {settings.callingPaused && <b className="orange">Calling paused.</b>}</div>
          </div>
        )}
        <button className="nav-item desktop-only" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}<span className="nav-label">Collapse</span>
        </button>
      </div>
    </aside>
  );
}

function Breadcrumbs() {
  const loc = useLocation(); const app = useApp();
  const parts = loc.pathname.split('/').filter(Boolean);
  if (!parts.length) return <div className="breadcrumbs"><span className="current">Overview</span></div>;
  const crumbs: { to: string; label: string }[] = [];
  parts.forEach((p, i) => {
    const to = '/' + parts.slice(0, i + 1).join('/');
    let label = i === 0 ? LABELS[p] ?? p : p;
    if (i === 1) {
      label = p === 'new' ? 'New' : app.leadById.get(p)?.name ?? app.campaignById.get(p)?.name ?? app.agentById.get(p)?.name ?? app.memberById.get(p)?.name ?? p;
    }
    crumbs.push({ to, label });
  });
  return (
    <nav className="breadcrumbs truncate" aria-label="Breadcrumb">
      {crumbs.map((c, i) => (
        <React.Fragment key={c.to}>
          {i > 0 && <ChevronRight size={13} style={{ flexShrink: 0 }} />}
          {i === crumbs.length - 1 ? <span className="current truncate">{c.label}</span> : <Link to={c.to}>{c.label}</Link>}
        </React.Fragment>
      ))}
    </nav>
  );
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp(); const nav = useNavigate();
  const [q, setQ] = useState(''); const [idx, setIdx] = useState(0);
  useEffect(() => { if (open) { setQ(''); setIdx(0); } }, [open]);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const pages = [...MAIN, ...MGMT].map((n) => ({ group: 'Pages', label: n.label, sub: '', to: n.to }));
    if (!s) return pages.slice(0, 9);
    const out: { group: string; label: string; sub: string; to: string }[] = [];
    out.push(...pages.filter((p) => p.label.toLowerCase().includes(s)));
    app.leads.filter((l) => l.name.toLowerCase().includes(s) || l.id.toLowerCase().includes(s) || l.phone.replace(/\s/g, '').includes(s.replace(/\s/g, '')) || l.email.includes(s)).slice(0, 6)
      .forEach((l) => out.push({ group: 'Leads', label: l.name, sub: `${l.id} · ${l.phone}`, to: `/leads/${l.id}` }));
    app.campaigns.filter((c) => c.name.toLowerCase().includes(s) || c.id.toLowerCase().includes(s)).slice(0, 4).forEach((c) => out.push({ group: 'Campaigns', label: c.name, sub: c.id, to: `/campaigns/${c.id}` }));
    app.agents.filter((a) => a.name.toLowerCase().includes(s)).forEach((a) => out.push({ group: 'AI agents', label: a.name, sub: a.voice, to: `/agents/${a.id}` }));
    app.calls.filter((c) => c.id.toLowerCase().includes(s)).slice(0, 4).forEach((c) => out.push({ group: 'Conversations', label: c.id, sub: app.leadById.get(c.leadId)?.name ?? '', to: `/conversations/${c.id}` }));
    app.products.filter((p) => p.name.toLowerCase().includes(s)).slice(0, 4).forEach((p) => out.push({ group: 'Products', label: p.name, sub: p.category, to: `/products?product=${p.id}` }));
    app.team.filter((m) => m.name.toLowerCase().includes(s)).slice(0, 4).forEach((m) => out.push({ group: 'Team', label: m.name, sub: m.role, to: `/team/${m.id}` }));
    return out;
  }, [q, app.leads, app.campaigns, app.agents, app.calls, app.products, app.team, app.leadById]);
  if (!open) return null;
  const go = (to: string) => { nav(to); onClose(); };
  let lastGroup = '';
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal cmdk" role="dialog" aria-label="Search">
        <div style={{ position: 'relative' }}>
          <Search size={17} style={{ position: 'absolute', left: 16, top: 17, color: 'var(--fog)' }} />
          <input autoFocus className="cmdk-input" placeholder="Search leads, phone numbers, campaigns, call IDs…" value={q}
            onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(results.length - 1, i + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
              if (e.key === 'Enter' && results[idx]) go(results[idx].to);
              if (e.key === 'Escape') onClose();
            }} />
        </div>
        <div className="cmdk-list">
          {results.length === 0 && <div className="empty small">No results for “{q}”</div>}
          {results.map((r, i) => {
            const head = r.group !== lastGroup; lastGroup = r.group;
            return (
              <React.Fragment key={r.group + r.to}>
                {head && <div className="label" style={{ padding: '8px 10px 4px' }}>{r.group}</div>}
                <div className={`cmdk-item ${i === idx ? 'on' : ''}`} onMouseEnter={() => setIdx(i)} onClick={() => go(r.to)}>
                  <span className="medium" style={{ color: 'var(--ink)' }}>{r.label}</span>
                  {r.sub && <span className="mono muted truncate">{r.sub}</span>}
                  <ChevronRight size={14} className="muted" style={{ marginLeft: 'auto' }} />
                </div>
              </React.Fragment>
            );
          })}
        </div>
        <div className="modal-foot" style={{ justifyContent: 'space-between' }}><span className="xs muted">↑↓ to navigate · ↵ to open · esc to close</span><span className="xs muted">{results.length} results</span></div>
      </div>
    </div>
  );
}

const ROLES: Role[] = ['Super Admin', 'Administrator', 'Sales Manager', 'Supervisor', 'Sales Representative', 'Analyst'];
const WORKSPACES = ['Consumer & SME Outbound', 'Enterprise Accounts', 'Retention & Loyalty'];

function Topbar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  const app = useApp(); const nav = useNavigate();
  const unread = app.notifications.filter((n) => !n.read);
  return (
    <header className="topbar">
      <Button variant="ghost" size="sm" iconOnly className="mobile-only" icon={<MenuIcon />} onClick={onMenu} aria-label="Open menu" />
      <div className="grow" style={{ minWidth: 0 }}><Breadcrumbs /></div>
      <button className="search-trigger" onClick={onSearch} aria-label="Search"><Search size={15} /><span className="search-text grow" style={{ textAlign: 'left' }}>Search leads, calls, campaigns…</span><span className="kbd">⌘K</span></button>
      <Menu width={260} trigger={(t) => <Button size="sm" className="desktop-only" icon={<Building2 />} iconRight={<ChevronDown size={13} />} onClick={t}><span className="truncate" style={{ maxWidth: 150 }}>{app.settings.workspace}</span></Button>}>
        {(close) => (<>
          <div className="menu-label label">Workspaces</div>
          {WORKSPACES.map((w) => <MenuItem key={w} onClick={() => { app.updateSettings({ workspace: w }); app.toast('Workspace switched', w); close(); }}>{w}{app.settings.workspace === w && <Check size={14} style={{ marginLeft: 'auto' }} />}</MenuItem>)}
        </>)}
      </Menu>
      <Menu width={360} trigger={(t) => (
        <Button variant="ghost" size="sm" iconOnly onClick={t} aria-label="Notifications" style={{ position: 'relative' }} icon={<Bell />}>
          {unread.length > 0 && <span style={{ position: 'absolute', top: 5, right: 6, width: 7, height: 7, borderRadius: 9, background: 'var(--tangerine)', border: '1.5px solid #fff' }} />}
        </Button>
      )}>
        {(close) => (<div style={{ width: 352 }}>
          <div className="row between" style={{ padding: '8px 10px' }}><span className="strong">Notifications</span><button className="btn link small" onClick={() => app.markAllRead()}>Mark all read</button></div>
          <div className="menu-sep" />
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {app.notifications.slice(0, 7).map((n) => (
              <button key={n.id} className="menu-item" style={{ alignItems: 'flex-start', whiteSpace: 'normal' }} onClick={() => { app.markNotification(n.id, true); nav(n.link); close(); }}>
                <span style={{ width: 6, height: 6, borderRadius: 6, marginTop: 7, flexShrink: 0, background: n.read ? 'transparent' : 'var(--blue)' }} />
                <span className="grow"><span className="row between"><span className="medium" style={{ color: 'var(--ink)' }}>{n.title}</span>{n.priority === 'High' && <Badge tone="orange">High</Badge>}</span><span className="small muted" style={{ display: 'block' }}>{n.body}</span><span className="xs muted mono">{fmtRelative(n.at)}</span></span>
              </button>
            ))}
          </div>
          <div className="menu-sep" />
          <MenuItem onClick={() => { nav('/notifications'); close(); }}>View all notifications<ChevronRight size={14} style={{ marginLeft: 'auto' }} /></MenuItem>
        </div>)}
      </Menu>
      <Menu width={260} trigger={(t) => <button className="btn ghost sm" onClick={t} style={{ padding: '0 4px', gap: 8 }} aria-label="Account"><Avatar name={app.me.name} size="sm" /><span className="desktop-only medium">{app.me.name.split(' ')[0]}</span><ChevronDown size={13} className="desktop-only" /></button>}>
        {(close) => (<>
          <div style={{ padding: '8px 10px' }}><div className="strong">{app.me.name}</div><div className="small muted">{app.me.email}</div><div className="mt-8"><Badge tone="blue">{app.role}</Badge></div></div>
          <div className="menu-sep" />
          <div className="menu-label label">View as role (RBAC demo)</div>
          {ROLES.map((r) => <MenuItem key={r} onClick={() => { app.setRole(r); app.toast('Role switched', `Now viewing as ${r}. Permissions updated.`, 'info'); close(); }}>{r}{app.role === r && <Check size={14} style={{ marginLeft: 'auto' }} />}</MenuItem>)}
          <div className="menu-sep" />
          <MenuItem icon={<User />} onClick={() => { nav(`/team/${app.me.id}`); close(); }}>My profile</MenuItem>
          <MenuItem icon={<SettingsIcon />} onClick={() => { nav('/settings'); close(); }}>Account settings</MenuItem>
          <MenuItem icon={<LogOut />} onClick={() => { try { sessionStorage.removeItem('vf-auth'); } catch { /* */ } nav('/login'); close(); }}>Sign out</MenuItem>
        </>)}
      </Menu>
    </header>
  );
}

function Toasts() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.kind === 'error' ? <AlertCircle style={{ color: '#f87171' }} /> : t.kind === 'info' ? <Info style={{ color: '#93c5fd' }} /> : <CheckCircle2 style={{ color: '#4ade80' }} />}
          <div className="grow"><div className="medium">{t.title}</div>{t.desc && <div className="t-desc">{t.desc}</div>}</div>
          <button className="btn ghost xs icon" style={{ color: '#a3a3a3' }} onClick={() => dismissToast(t.id)} aria-label="Dismiss"><X size={13} /></button>
        </div>
      ))}
    </div>
  );
}

export function Shell() {
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('vf-collapsed') === '1'; } catch { return false; } });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState(false);
  const loc = useLocation();
  useEffect(() => { try { localStorage.setItem('vf-collapsed', collapsed ? '1' : '0'); } catch { /* */ } }, [collapsed]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch(true); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  return (
    <div className="shell">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      {mobileOpen && <div className="drawer-overlay" style={{ zIndex: 25 }} onClick={() => setMobileOpen(false)} />}
      <div className="main">
        <Topbar onMenu={() => setMobileOpen(true)} onSearch={() => setSearch(true)} />
        <main className="content"><Outlet /></main>
      </div>
      <CommandPalette open={search} onClose={() => setSearch(false)} />
      <Toasts />
    </div>
  );
}
