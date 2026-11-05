import { Room, RoomEvent, Track } from 'livekit-client';
import type { Campaign, Lead, TranscriptLine } from '../data/types';
import type { LiveCall } from '../store/store';
import { stripTags } from './adapters';
import { supabase } from './client';

export interface LiveRoom { room: string; phone: string | null; started_at: number } // started_at: Unix seconds

const digits = (phone: string) => phone.replace(/\D/g, '');

async function callApi<T>(path: string, init?: RequestInit): Promise<T> {
  const base = import.meta.env.VITE_API_URL as string | undefined;
  if (!base) throw new Error('VITE_API_URL is not set');
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Not signed in');
  const res = await fetch(`${base}${path}`, {
    ...init,
    signal: AbortSignal.timeout(15000), // a hung request must not stop the polling loop for good
    headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json();
}

export const fetchLiveRooms = () => callApi<LiveRoom[]>('/live-calls');

export function roomToLiveCall(room: LiveRoom, leads: Lead[], campaigns: Campaign[]): LiveCall {
  const phone = room.phone ? digits(room.phone) : '';
  const lead = phone ? leads.find((l) => digits(l.phone) === phone) : undefined;
  const campaign = campaigns.find((c) => c.id === lead?.campaignId);
  const startedAt = room.started_at * 1000;
  return {
    id: room.room, phone: room.phone ?? undefined, leadId: lead?.id ?? '', campaignId: campaign?.id ?? '', agentId: campaign?.agentId ?? '', startedAt,
    elapsed: Math.round(Math.max(0, Date.now() - startedAt) / 1000) / 4, // the page shows elapsed * 4 seconds, the simulation's tick
    lines: [], whisper: false, takenOver: false, monitoring: false,
    // the agent does not report these and Live hides them
    stage: 0, sentiment: 'Neutral', intent: 0, progress: 0, plannedOutcome: 'Callback requested', plannedDuration: 0,
  };
}

// A real call may have no matching lead, and a room not named by the dialler has no phone either
export const callerLabel = (lc: LiveCall, lead?: Lead): string => lead?.name || lc.phone || lc.id;

export function upsertLine(lines: TranscriptLine[], line: TranscriptLine, segmentId: string): TranscriptLine[] {
  const next = { ...line, segmentId };
  return lines.some((l) => l.segmentId === segmentId) ? lines.map((l) => (l.segmentId === segmentId ? next : l)) : [...lines, next];
}

// line.t is Unix seconds: only the caller knows when the call started.
// onAudioBlocked (listening only): null once audio can play; otherwise a function to call from a click, the gesture browsers want.
export async function joinCall(room: string, onLine: (line: TranscriptLine, segmentId: string) => void, listen: boolean, onAudioBlocked?: (enable: (() => void) | null) => void): Promise<() => void> {
  const { serverUrl, participantToken } = await callApi<{ serverUrl: string; participantToken: string }>('/live-token', { method: 'POST', body: JSON.stringify({ room }) });
  const call = new Room();
  // The agent streams its speech as deltas in one stream; the customer's text arrives whole, in a new stream per update. Both share a segment id.
  call.registerTextStreamHandler('lk.transcription', async (reader, { identity }) => {
    const segmentId = reader.info.attributes?.['lk.segment_id'] ?? reader.info.id;
    const speaker = identity.startsWith('sip-') ? 'Customer' : 'AI';
    let raw = '';
    try {
      for await (const chunk of reader) {
        raw += chunk;
        const text = stripTags(raw);
        if (text) onLine({ t: reader.info.timestamp / 1000, speaker, text }, segmentId);
      }
    } catch { /* leaving cuts the stream off */ }
  });
  const players: HTMLMediaElement[] = [];
  const reportAudio = () => onAudioBlocked?.(call.canPlaybackAudio ? null : () => { call.startAudio().catch(() => { /* still blocked: the button stays */ }); });
  if (listen) {
    call.on(RoomEvent.AudioPlaybackStatusChanged, reportAudio);
    call.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind !== Track.Kind.Audio) return;
      const player = track.attach();
      document.body.appendChild(player);
      players.push(player);
    });
  }
  await call.connect(serverUrl, participantToken, { autoSubscribe: listen });
  if (listen) reportAudio();
  return () => { players.forEach((p) => p.remove()); void call.disconnect(); };
}
