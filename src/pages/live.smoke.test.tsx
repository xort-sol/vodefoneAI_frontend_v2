// @vitest-environment jsdom
// Every Live page must render with no data, and with rows whose lookups miss.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../live/client', () => ({ getMode: () => 'live', isLiveConfigured: () => true, setMode: vi.fn(), signInLive: vi.fn(), supabase: {} }));
vi.mock('../live/repo', () => ({
  loadMe: vi.fn(), loadAll: vi.fn(), onAuthChange: vi.fn(() => () => {}), loadTranscript: vi.fn(async () => []), saveLead: vi.fn(), saveCampaign: vi.fn(), insertSuppression: vi.fn(async () => {}),
}));
vi.mock('../live/liveCalls', async (actual) => ({ ...(await actual<typeof import('../live/liveCalls')>()), fetchLiveRooms: vi.fn(), joinCall: vi.fn() }));

import * as repo from '../live/repo';
import { fetchLiveRooms, joinCall } from '../live/liveCalls';
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
const rooms = vi.mocked(fetchLiveRooms);
const join = vi.mocked(joinCall);
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
  rooms.mockReset(); rooms.mockResolvedValue([]);
  join.mockReset(); join.mockResolvedValue(() => {});
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

describe('real calls on the Calling page', () => {
  const OUTAGE = 'Live call service is unavailable. Saved calls and leads are not affected.';
  const room = { room: 'call-353871234567-1', phone: '+353871234567', started_at: Math.floor(Date.now() / 1000) - 65 };
  const tick = (ms = 3000) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  const calling = (url = '/calling') => show(url, <Calling />, '/calling');
  const rita = () => toLead({ id: 1, name: 'Rita Ryan', phone: '+353 87 123 4567', status: 'new', campaign_id: 2, created_at: iso }, []);
  const running = () => toCampaign({ id: 2, name: 'Spring', status: 'running', created_at: iso, agent_ref: 'no-such-agent' }, {});

  beforeEach(() => r.loadAll.mockResolvedValue({ ...empty(), leads: [rita()], campaigns: [running()] }));

  it('shows a running room by lead name, with no simulated figures', async () => {
    rooms.mockResolvedValue([room]);
    await calling(); await tick();
    expect(screen.getByText('Rita Ryan')).toBeTruthy();
    expect(screen.queryByText('Buying intent')).toBeNull();
    expect(screen.queryByText('Qualification')).toBeNull();
    expect(screen.queryByText('Dialling')).toBeNull();
    expect(screen.queryByText(/Simulation mode/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/simulated/i);
  });

  it('falls back to the phone, then the room name, when no lead matches', async () => {
    rooms.mockResolvedValue([{ ...room, phone: '+353860000000' }, { room: 'call-odd', phone: null, started_at: room.started_at }]);
    await calling(); await tick();
    expect(screen.getAllByText('+353860000000').length).toBeGreaterThan(0);
    expect(screen.getAllByText('call-odd').length).toBeGreaterThan(0);
  });

  it('an API failure sets liveError and leaves saved data alone', async () => {
    rooms.mockResolvedValueOnce([room]).mockRejectedValue(new Error('down'));
    r.saveLead.mockClear();
    await calling(); await tick(); await tick();
    expect(screen.getByText(OUTAGE)).toBeTruthy();
    expect(screen.getAllByText('Rita Ryan').length).toBeGreaterThan(0);
    expect(r.saveLead).not.toHaveBeenCalled();
  });

  it('liveError clears on the next successful poll', async () => {
    rooms.mockRejectedValueOnce(new Error('down')).mockResolvedValue([]);
    await calling(); await tick(0);
    expect(screen.getByText(OUTAGE)).toBeTruthy();
    await tick();
    expect(screen.queryByText(OUTAGE)).toBeNull();
  });

  it('a slow request is never overlapped, and polling stops on unmount', async () => {
    let finish = (_: never[]) => {};
    rooms.mockImplementationOnce(() => new Promise((res) => { finish = res; }));
    await calling(); await tick(10000);
    expect(rooms).toHaveBeenCalledTimes(1);
    finish([]); await tick(0); await tick();
    expect(rooms).toHaveBeenCalledTimes(2);
    cleanup(); await tick(10000);
    expect(rooms).toHaveBeenCalledTimes(2);
  });

  it('stops polling and clears calls on sign-out', async () => {
    rooms.mockResolvedValue([room]);
    await calling(); await tick();
    expect(screen.getAllByText('Rita Ryan').length).toBeGreaterThan(0);
    r.loadMe.mockResolvedValue(null);
    await tick(5000);
    const asked = rooms.mock.calls.length;
    await tick(10000);
    expect(rooms).toHaveBeenCalledTimes(asked);
    expect(screen.queryByText('Rita Ryan')).toBeNull();
  });

  it('an analyst, whom the API refuses, sees no outage', async () => {
    r.loadMe.mockResolvedValue({ ...member, role: 'analyst' });
    await calling(); await tick();
    expect(rooms).not.toHaveBeenCalled();
    expect(screen.queryByText(OUTAGE)).toBeNull();
  });

  it('the drawer streams lines, updates a segment in place, and survives polling', async () => {
    rooms.mockResolvedValue([room]);
    await calling(`/calling?call=${room.room}`); await tick(0); await tick(0);
    expect(join).toHaveBeenCalledTimes(1);
    expect(join.mock.calls[0][0]).toBe(room.room);
    expect(join.mock.calls[0][2]).toBe(false);
    const onLine = join.mock.calls[0][1];
    act(() => {
      onLine({ t: room.started_at + 3, speaker: 'AI', text: 'Hi' }, 'a');
      onLine({ t: room.started_at + 3, speaker: 'AI', text: 'Hi Rita' }, 'a');
      onLine({ t: room.started_at + 5, speaker: 'Customer', text: 'Hello?' }, 'b');
    });
    await tick();
    expect(screen.queryByText('Hi')).toBeNull();
    expect(screen.getByText('Hi Rita')).toBeTruthy();
    expect(screen.getByText('Hello?')).toBeTruthy();
    expect(screen.getByText('0:03')).toBeTruthy();
  });

  it('the drawer has no whisper, takeover, end or outcome controls', async () => {
    rooms.mockResolvedValue([room]);
    await calling(`/calling?call=${room.room}`); await tick(0); await tick(0);
    expect(screen.getByRole('button', { name: 'Listen in' })).toBeTruthy();
    for (const hidden of ['Human takeover', 'End call', 'Send']) expect(screen.queryByRole('button', { name: hidden })).toBeNull();
    expect(screen.queryByText('Whisper to AI')).toBeNull();
    expect(screen.queryByLabelText('Call outcome')).toBeNull();
  });

  it('Listen rejoins with audio, and every join is left when the drawer unmounts', async () => {
    const leaves = [vi.fn(), vi.fn()];
    join.mockResolvedValueOnce(leaves[0]).mockResolvedValueOnce(leaves[1]);
    rooms.mockResolvedValue([room]);
    await calling(`/calling?call=${room.room}`); await tick(0); await tick(0);
    fireEvent.click(screen.getByRole('button', { name: 'Listen in' }));
    await tick(0);
    expect(leaves[0]).toHaveBeenCalled();
    expect(join.mock.calls[1][2]).toBe(true);
    expect(leaves[1]).not.toHaveBeenCalled();
    cleanup();
    expect(leaves[1]).toHaveBeenCalled();
  });

  describe('Listen in', () => {
    const LISTENING = /Listening silently/;
    const openAndListen = async () => {
      rooms.mockResolvedValue([room]);
      await calling(`/calling?call=${room.room}`); await tick(0); await tick(0);
      fireEvent.click(screen.getByRole('button', { name: 'Listen in' }));
      await tick(0);
      return join.mock.calls[1][3]!;
    };

    it('does not claim to be listening before the join reports audio', async () => {
      await openAndListen();
      expect(screen.queryByText(LISTENING)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Enable audio' })).toBeNull();
    });
    it('blocked audio offers Enable audio, and only then says Listening', async () => {
      const report = await openAndListen();
      const enable = vi.fn();
      act(() => report(enable));
      expect(screen.queryByText(LISTENING)).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Enable audio' }));
      expect(enable).toHaveBeenCalledTimes(1);
      act(() => report(null));
      expect(screen.queryByRole('button', { name: 'Enable audio' })).toBeNull();
      expect(screen.getByText(LISTENING)).toBeTruthy();
    });
    it('goes back to Enable audio if playback is blocked later', async () => {
      const report = await openAndListen();
      act(() => report(null));
      act(() => report(vi.fn()));
      expect(screen.queryByText(LISTENING)).toBeNull();
      expect(screen.getByRole('button', { name: 'Enable audio' })).toBeTruthy();
    });
    it('a failed Listen shows the error, and the next click clears it', async () => {
      join.mockResolvedValueOnce(() => {}).mockRejectedValueOnce(new Error('no route'));
      rooms.mockResolvedValue([room]);
      await calling(`/calling?call=${room.room}`); await tick(0); await tick(0);
      fireEvent.click(screen.getByRole('button', { name: 'Listen in' }));
      await tick(0); await tick(0);
      expect(screen.getByText('Could not connect to this call')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Listen in' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Listen in' }));
      await tick(0);
      expect(screen.queryByText('Could not connect to this call')).toBeNull();
    });
  });

  it('leaves the room when the call ends, and a join that lands after closing is left at once', async () => {
    const leave = vi.fn();
    let joined = (_: () => void) => {};
    join.mockImplementationOnce(() => new Promise((res) => { joined = res; }));
    rooms.mockResolvedValueOnce([room]).mockResolvedValue([]);
    await calling(`/calling?call=${room.room}`); await tick(0); await tick(0);
    await tick();
    expect(screen.getByText(/This call has ended/)).toBeTruthy();
    joined(leave); await tick(0);
    expect(leave).toHaveBeenCalled();
  });

  it('a failed join tells the user and does not crash', async () => {
    join.mockRejectedValue(new Error('no route'));
    rooms.mockResolvedValue([room]);
    await calling(`/calling?call=${room.room}`); await tick(0); await tick(0);
    expect(screen.getByText('Could not connect to this call')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Listen in' })).toBeTruthy();
  });

  it('pause sets every running campaign to paused, and only those', async () => {
    r.saveCampaign.mockResolvedValue(undefined); r.saveCampaign.mockClear();
    r.loadAll.mockResolvedValue({ ...empty(), campaigns: [running(), toCampaign({ id: 3, name: 'Draft', status: 'draft', created_at: iso }, {})] });
    await calling(); await tick(0);
    fireEvent.click(screen.getByRole('button', { name: 'Pause all calling' }));
    await tick(0);
    expect(r.saveCampaign.mock.calls).toEqual([['2', { status: 'paused' }]]);
  });

  it('Overview and the campaign page name a real call and invent nothing about it', async () => {
    rooms.mockResolvedValue([room, { room: 'call-odd', phone: null, started_at: room.started_at }]);
    await show('/', <Overview />, '/'); await tick();
    expect(screen.getAllByText('Rita Ryan').length).toBeGreaterThan(0);
    expect(screen.getAllByText('call-odd').length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('Dialling');
    cleanup();
    await show('/campaigns/2', <CampaignDetail />, '/campaigns/:id'); await tick();
    expect(document.body.textContent).not.toContain('intent 0');
  });

  it('suppressing the number of a real call does not fake an ending', async () => {
    rooms.mockResolvedValue([room]);
    await calling(); await tick();
    fireEvent.change(screen.getByPlaceholderText('+353 87 123 4567'), { target: { value: '+353 87 123 4567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to suppression list' }));
    await tick(0);
    expect(document.body.textContent).not.toContain('live call ended');
    expect(screen.getAllByText('Rita Ryan').length).toBeGreaterThan(0);
  });
});
