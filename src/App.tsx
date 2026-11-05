import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { getMode, supabase } from './live/client';
import { AppProvider } from './store/store';
import { ConfirmProvider } from './components/ui';
import { Shell } from './layout/Shell';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Leads from './pages/Leads';
import LeadProfile from './pages/LeadProfile';
import Calling from './pages/Calling';
import Campaigns from './pages/Campaigns';
import CampaignWizard from './pages/CampaignWizard';
import CampaignDetail from './pages/CampaignDetail';
import Agents from './pages/Agents';
import AgentBuilder from './pages/AgentBuilder';
import Conversations from './pages/Conversations';
import ConversationDetail from './pages/ConversationDetail';
import Qualified from './pages/Qualified';
import Appointments from './pages/Appointments';
import Workspace from './pages/Workspace';
import Analytics from './pages/Analytics';
import Products from './pages/Products';
import Team from './pages/Team';
import MemberProfile from './pages/MemberProfile';
import CallHistory from './pages/CallHistory';
import Compliance from './pages/Compliance';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';

function RequireAuth({ children }: { children: JSX.Element }) {
  const loc = useLocation();
  const live = getMode() === 'live';
  const [session, setSession] = useState<'loading' | 'in' | 'out'>(live ? 'loading' : 'out');
  useEffect(() => {
    if (!live) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session ? 'in' : 'out'));
    const { data } = supabase.auth.onAuthStateChange((_e, sess) => setSession(sess ? 'in' : 'out'));
    return () => data.subscription.unsubscribe();
  }, [live]);
  let authed = false;
  if (live) { if (session === 'loading') return null; authed = session === 'in'; }
  else { try { authed = sessionStorage.getItem('vf-auth') === '1'; } catch { authed = true; } }
  return authed ? children : <Navigate to="/login" state={{ from: loc.pathname }} replace />;
}

export default function App() {
  return (
    <AppProvider>
      <ConfirmProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth><Shell /></RequireAuth>}>
            <Route index element={<Overview />} />
            <Route path="leads" element={<Leads />} />
            <Route path="leads/:id" element={<LeadProfile />} />
            <Route path="calling" element={<Calling />} />
            <Route path="campaigns" element={<Campaigns />} />
            <Route path="campaigns/new" element={<CampaignWizard />} />
            <Route path="campaigns/:id" element={<CampaignDetail />} />
            <Route path="agents" element={<Agents />} />
            <Route path="agents/:id" element={<AgentBuilder />} />
            <Route path="conversations" element={<Conversations />} />
            <Route path="conversations/:id" element={<ConversationDetail />} />
            <Route path="qualified" element={<Qualified />} />
            <Route path="appointments" element={<Appointments />} />
            <Route path="workspace" element={<Workspace />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="products" element={<Products />} />
            <Route path="team" element={<Team />} />
            <Route path="team/:id" element={<MemberProfile />} />
            <Route path="history" element={<CallHistory />} />
            <Route path="compliance" element={<Compliance />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </ConfirmProvider>
    </AppProvider>
  );
}
