import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Campaign, Lead, TranscriptLine } from '../data/types';

// A fake LiveKit room: tests push transcription streams and audio tracks through what joinCall registers.
const { fake } = vi.hoisted(() => {
  const fake = {
    session: { access_token: 'tok' } as unknown,
    rooms: [] as any[],
    connectError: null as Error | null,
    audioBlocked: false,
  };
  return { fake };
});
vi.mock('./client', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: fake.session } }) } } }));
vi.mock('livekit-client', () => ({
  RoomEvent: { TrackSubscribed: 'trackSubscribed', AudioPlaybackStatusChanged: 'audioPlaybackChanged' },
  Track: { Kind: { Audio: 'audio', Video: 'video' } },
  Room: class {
    handlers: Record<string, (reader: unknown, who: { identity: string }) => Promise<void>> = {};
    events: Record<string, (arg: any) => void> = {};
    canPlaybackAudio = !fake.audioBlocked;
    connect = vi.fn(async () => { if (fake.connectError) throw fake.connectError; });
    disconnect = vi.fn(async () => {});
    startAudio = vi.fn(async () => {});
    constructor() { fake.rooms.push(this); }
    registerTextStreamHandler(topic: string, h: (reader: unknown, who: { identity: string }) => Promise<void>) { this.handlers[topic] = h; }
    on(event: string, h: (arg: any) => void) { this.events[event] = h; return this; }
  },
}));

import { fetchLiveRooms, joinCall, roomToLiveCall, upsertLine } from './liveCalls';

const reader = (chunks: string[], segment = 'SG_1', timestamp = 5000) => ({
  info: { id: 'stream-1', timestamp, attributes: { 'lk.segment_id': segment } },
  async *[Symbol.asyncIterator]() { yield* chunks; },
});
const fetchMock = vi.fn();
const respond = (body: unknown, status = 200) => fetchMock.mockResolvedValue({ ok: status < 400, status, json: async () => body });

beforeEach(() => {
  fake.session = { access_token: 'tok' }; fake.rooms = []; fake.connectError = null; fake.audioBlocked = false;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_API_URL', 'http://api.test');
  respond({ serverUrl: 'wss://lk.test', participantToken: 'lk-token' });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('fetchLiveRooms', () => {
  it('sends the Supabase access token', async () => {
    respond([{ room: 'call-1-1', phone: '+1', started_at: 1 }]);
    await expect(fetchLiveRooms()).resolves.toEqual([{ room: 'call-1-1', phone: '+1', started_at: 1 }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/live-calls');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });
  it('rejects on an API error, with no session and with no API URL', async () => {
    respond({}, 502);
    await expect(fetchLiveRooms()).rejects.toThrow('502');
    fake.session = null;
    await expect(fetchLiveRooms()).rejects.toThrow();
    fake.session = { access_token: 'tok' };
    vi.stubEnv('VITE_API_URL', '');
    await expect(fetchLiveRooms()).rejects.toThrow('VITE_API_URL');
  });
});

describe('roomToLiveCall', () => {
  const lead = { id: '7', phone: '+353 87 000 0000', name: 'Rita', campaignId: '5' } as Lead;
  const campaign = { id: '5', agentId: 'ag-02' } as Campaign;

  it('matches a room to its lead by phone', () => {
    const lc = roomToLiveCall({ room: 'call-353870000000-1', phone: '+353870000000', started_at: 1 }, [lead], [campaign]);
    expect(lc).toMatchObject({ id: 'call-353870000000-1', leadId: '7', campaignId: '5', agentId: 'ag-02', startedAt: 1000, lines: [] });
  });
  it('still returns a call when no lead matches, labelled by phone', () => {
    const lc = roomToLiveCall({ room: 'call-353870000000-1', phone: '+353870000000', started_at: 1 }, [], []);
    expect(lc.leadId).toBe(''); expect(lc.phone).toBe('+353870000000');
  });
  it('copes with a room that has no phone, and never matches a lead with no phone', () => {
    const lc = roomToLiveCall({ room: 'call-test', phone: null, started_at: 1 }, [{ ...lead, phone: '' }], [campaign]);
    expect(lc).toMatchObject({ id: 'call-test', leadId: '', campaignId: '', agentId: '' });
    expect(lc.phone).toBeUndefined();
  });
  it('reports elapsed in the units the page multiplies by four', () => {
    vi.useFakeTimers({ now: 61_000 });
    expect(roomToLiveCall({ room: 'r', phone: null, started_at: 1 }, [], []).elapsed * 4).toBe(60);
    vi.useRealTimers();
  });
});

describe('upsertLine', () => {
  const line = (text: string): TranscriptLine => ({ t: 1, speaker: 'AI', text });
  it('replaces a line when the same segment updates', () => {
    const one = upsertLine([], line('Hel'), 'a');
    const two = upsertLine(one, line('Other'), 'b');
    const three = upsertLine(two, line('Hello'), 'a');
    expect(three.map((l) => l.text)).toEqual(['Hello', 'Other']);
  });
});

describe('joinCall', () => {
  const join = async (listen = false) => {
    const lines: [TranscriptLine, string][] = [];
    const leave = await joinCall('call-1-1', (l, s) => lines.push([l, s]), listen);
    return { lines, leave, room: fake.rooms[0] };
  };
  const stream = (room: any, r: unknown, identity: string) => room.handlers['lk.transcription'](r, { identity });

  it('asks for a token for the room and connects with it', async () => {
    const { room } = await join();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/live-token');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ room: 'call-1-1' });
    expect(room.connect.mock.calls[0].slice(0, 2)).toEqual(['wss://lk.test', 'lk-token']);
  });
  it('treats sip- identities as the customer', async () => {
    const { room, lines } = await join();
    await stream(room, reader(['Hello?'], 'SG_c'), 'sip-+353870000000');
    await stream(room, reader(['Hi there'], 'SG_a'), 'agent-AJ_1');
    expect(lines.map(([l]) => l.speaker)).toEqual(['Customer', 'AI']);
  });
  it('builds up a streamed segment under one id', async () => {
    const { room, lines } = await join();
    await stream(room, reader(['Hi ', 'Rita']), 'agent-AJ_1');
    expect(lines.map(([l, s]) => [l.text, s])).toEqual([['Hi', 'SG_1'], ['Hi Rita', 'SG_1']]);
    expect(lines[0][0].t).toBe(5);
  });
  it('strips delivery tags from live lines', async () => {
    const { room, lines } = await join();
    await stream(room, reader(['[warmly] ', 'Hi ', '[pause]Rita']), 'agent-AJ_1');
    expect(lines[lines.length - 1][0].text).toBe('Hi Rita');
    expect(lines.every(([l]) => l.text !== '')).toBe(true);
  });
  it('a stream cut off by leaving does not throw', async () => {
    const { room } = await join();
    const broken = { ...reader([]), async *[Symbol.asyncIterator]() { throw new Error('closed'); } };
    await expect(stream(room, broken, 'agent-AJ_1')).resolves.toBeUndefined();
  });
  it('does not subscribe to audio unless listening', async () => {
    const { room } = await join(false);
    expect(room.connect.mock.calls[0][2]).toEqual({ autoSubscribe: false });
    expect(room.events.trackSubscribed).toBeUndefined();
    expect(room.events.audioPlaybackChanged).toBeUndefined();
    expect(room.startAudio).not.toHaveBeenCalled();
  });
  it('plays subscribed audio when listening, and removes it on leaving', async () => {
    const audio = { remove: vi.fn() }; const append = vi.fn();
    vi.stubGlobal('document', { body: { appendChild: append } });
    const { room, leave } = await join(true);
    expect(room.connect.mock.calls[0][2]).toEqual({ autoSubscribe: true });
    room.events.trackSubscribed({ kind: 'audio', attach: () => audio });
    room.events.trackSubscribed({ kind: 'video', attach: () => { throw new Error('no video'); } });
    expect(append).toHaveBeenCalledWith(audio);
    leave();
    expect(audio.remove).toHaveBeenCalled();
    expect(room.disconnect).toHaveBeenCalled();
  });
  describe('blocked audio', () => {
    const listen = async () => {
      const reports: ((() => void) | null)[] = [];
      await joinCall('call-1-1', () => {}, true, (enable) => reports.push(enable));
      return { reports, room: fake.rooms[0] };
    };

    it('says audio can play when the browser allows it', async () => {
      const { reports, room } = await listen();
      expect(reports).toEqual([null]);
      expect(room.startAudio).not.toHaveBeenCalled();
    });
    it('hands back an enable function, and only that click starts audio', async () => {
      fake.audioBlocked = true;
      const { reports, room } = await listen();
      expect(reports).toHaveLength(1);
      expect(room.startAudio).not.toHaveBeenCalled();
      reports[0]!();
      expect(room.startAudio).toHaveBeenCalledTimes(1);
    });
    it('follows playback status changes after connecting', async () => {
      const { reports, room } = await listen();
      room.canPlaybackAudio = false; room.events.audioPlaybackChanged(false);
      expect(reports[1]).toBeTypeOf('function');
      room.canPlaybackAudio = true; room.events.audioPlaybackChanged(true);
      expect(reports[2]).toBeNull();
    });
    it('an enable click the browser refuses does not throw', async () => {
      fake.audioBlocked = true;
      const { reports, room } = await listen();
      room.startAudio.mockRejectedValueOnce(new Error('NotAllowedError'));
      reports[0]!(); // an uncaught rejection here would fail the run
      await new Promise((res) => setTimeout(res));
      expect(room.startAudio).toHaveBeenCalledTimes(1);
    });
  });

  it('rejects when the room cannot be reached', async () => {
    fake.connectError = new Error('no route');
    await expect(joinCall('call-1-1', () => {}, false)).rejects.toThrow('no route');
  });
});
