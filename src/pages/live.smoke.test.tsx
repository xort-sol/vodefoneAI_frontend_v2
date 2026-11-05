// @vitest-environment jsdom
// Every Live page must render with no data, and with rows whose lookups miss.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../live/client', () => ({ getMode: () => 'live', isLiveConfigured: () => true, setMode: vi.fn(), signInLive: vi.fn(), supabase: {} }));
vi.mock('../live/repo', () => ({
  loadMe: vi.fn(), loadAll: vi.fn(), onAuthChange: vi.fn(() => () => {}), loadTranscript: vi.fn(async () => []), saveLead: vi.fn(),
}));

import * as repo from '../live/repo';
import { toCall, toCampaign, toLead, toMember } from '../live/adapters';
import { AppProvider } from '../store/store';
import { ConfirmProvider } from '../components/ui';
import Overview from './Overview';
import Leads from './Leads';
import LeadProfile from './LeadProfile';
import Calling from './Calling';
import Campaigns from './Campaigns';
import CampaignWizard from './CampaignWizard';
import CampaignDetail from './CampaignDetail';
import Conversations from './Conversations';
import ConversationDetail from './ConversationDetail';
import { LeadFormModal } from './leads/shared';
import Qualified from './Qualified';
import CallHistory from './CallHistory';

const r = vi.mocked(repo);
const iso = new Date().toISOString();
const member = { id: 'u1', email: 'a@b.ie', full_name: 'Mary Manager', role: 'admin', created_at: iso };
// A bare lead, a campaign with no refs, and calls pointing at a lead and a campaign that are not loaded
const rows = () => ({
  leads: [toLead({ id: 1, status: 'interested', sales_status: 'Hot', campaign_id: 99, assigned_to: 'gone', product_ref: 'no-such-product', created_at: iso }, [])],
  campaigns: [toCampaign({ id: 2, name: 'C', status: 'running', created_at: iso, agent_ref: 'no-such-agent', product_ref: 'no-such-product', offer_ref: 'no-such-offer' }, {})],
  calls: [
    toCall({ id: 3, lead_id: 1, campaign_id: null, outcome: 'hung_up', created_at: iso, analyses: null }),
    toCall({ id: 4, lead_id: 404, campaign_id: 2, outcome: 'interested', duration_s: 60, created_at: iso, analyses: { score: 90 } }),
  ],
  team: [toMember(member)], suppressions: [],
});
const empty = () => ({ leads: [], campaigns: [], calls: [], team: [], suppressions: [] });

const PAGES: [string, string, JSX.Element, string][] = [
  ['Overview', '/', <Overview />, '/'], ['Leads', '/leads', <Leads />, '/leads'], ['LeadProfile', '/leads/1', <LeadProfile />, '/leads/:id'],
  ['Calling', '/calling', <Calling />, '/calling'], ['Campaigns', '/campaigns', <Campaigns />, '/campaigns'],
  ['CampaignWizard', '/campaigns/new', <CampaignWizard />, '/campaigns/new'], ['CampaignDetail', '/campaigns/2', <CampaignDetail />, '/campaigns/:id'],
  ['Conversations', '/conversations', <Conversations />, '/conversations'],
  ['ConversationDetail with lead', '/conversations/3', <ConversationDetail />, '/conversations/:id'],
  ['ConversationDetail without lead', '/conversations/4', <ConversationDetail />, '/conversations/:id'],
  ['Qualified', '/qualified', <Qualified />, '/qualified'], ['CallHistory', '/history', <CallHistory />, '/history'],
];

async function show(url: string, el: JSX.Element, route: string) {
  render(<MemoryRouter initialEntries={[url]}><AppProvider><ConfirmProvider><Routes><Route path={route} element={el} /></Routes></ConfirmProvider></AppProvider></MemoryRouter>);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.scrollTo = () => {};
  r.loadMe.mockResolvedValue(member);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe.each(PAGES)('%s', (_name, url, el, route) => {
  it('renders with no data', async () => { r.loadAll.mockResolvedValue(empty()); await show(url, el, route); expect(document.body.textContent).not.toBe(''); });
  it('renders with missing lookups', async () => { r.loadAll.mockResolvedValue(rows()); await show(url, el, route); expect(document.body.textContent).not.toBe(''); });
});

describe('what Live pages hide', () => {
  beforeEach(() => r.loadAll.mockResolvedValue(rows()));
  it('no Simulated badge, no Call now, no breakdown card when the call has no qualification', async () => {
    await show('/conversations/3', <ConversationDetail />, '/conversations/:id');
    expect(document.querySelector('.sim-badge')).toBeNull();
    expect(screen.getByText('Call metadata')).toBeTruthy();
    expect(screen.queryByText('Qualification score')).toBeNull();
    cleanup();
    await show('/leads/1', <LeadProfile />, '/leads/:id');
    expect(screen.queryByText('Call now')).toBeNull();
  });
});

describe('Live review fixes', () => {
  const ready = { status: 'new', consent: true, customer_type: 'Consumer', created_at: iso };

  it('the wizard selects only callable leads', async () => {
    r.loadAll.mockResolvedValue({ ...empty(), leads: [
      toLead({ ...ready, id: 1, name: 'Ringable Rita' }, []),
      toLead({ ...ready, id: 2, name: 'Held Harry', sales_status: 'Contacted' }, []),
      toLead({ ...ready, id: 3, name: 'Exhausted Eve', status: 'exhausted' }, []),
    ] });
    await show('/campaigns/new', <CampaignWizard />, '/campaigns/new');
    fireEvent.change(screen.getByPlaceholderText(/Spring Renewal/), { target: { value: 'New one' } });
    const objective = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    fireEvent.change(objective, { target: { value: objective.options[1].value } });
    fireEvent.click(screen.getAllByRole('button', { name: /Lead selection/ })[0]);
    expect(screen.getByText('Ringable Rita')).toBeTruthy();
    expect(screen.queryByText('Held Harry')).toBeNull();
    expect(screen.queryByText('Exhausted Eve')).toBeNull();
  });

  it('Retry eligible is hidden in Live', async () => {
    r.loadAll.mockResolvedValue({ ...empty(), leads: [toLead({ ...ready, id: 1, name: 'Rita', phone: '+353871234567' }, [])] });
    await show('/leads', <Leads />, '/leads');
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    expect(screen.queryByText('Retry eligible')).toBeNull();
  });

  it('a lead whose phone fails validation can still be edited and keeps its phone', async () => {
    const dup = '+15551234';
    const bad = toLead({ ...ready, id: 1, name: 'Rita Ryan', phone: dup, email: 'r@x.ie', product_ref: 'p-x' }, []);
    r.loadAll.mockResolvedValue({ ...empty(), leads: [bad, toLead({ ...ready, id: 2, name: 'Twin', phone: dup }, [])] });
    r.saveLead.mockResolvedValue(undefined);
    r.saveLead.mockClear();
    const onClose = vi.fn(); const onSaved = vi.fn();
    await show('/', <LeadFormModal open lead={bad} onClose={onClose} onSaved={onSaved} />, '/');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(r.saveLead).toHaveBeenCalledTimes(1);
    expect(onSaved.mock.calls[0][0].phone).toBe(dup);
    expect(onClose).toHaveBeenCalled();
  });
});
