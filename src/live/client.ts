import { createClient } from '@supabase/supabase-js';
import { toRole } from './adapters';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

// Placeholders keep createClient from throwing when Live mode is not configured.
export const supabase = createClient(url || 'http://localhost', key || 'unconfigured');

export const isLiveConfigured = (): boolean => !!(url && key);

export function getMode(): 'live' | 'demo' {
  if (!isLiveConfigured()) return 'demo';
  try { return localStorage.getItem('vf-mode') === 'demo' ? 'demo' : 'live'; } catch { return 'live'; }
}
export function setMode(m: 'live' | 'demo'): void {
  try { localStorage.setItem('vf-mode', m); } catch { /* ignore */ }
}

export async function signInLive(email: string, password: string): Promise<{ role: string } | { error: string }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: error?.message ?? 'Sign in failed.' };
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
  if (!profile?.role) {
    await supabase.auth.signOut();
    return { error: 'Your account has no role yet. Ask an administrator to assign one.' };
  }
  return { role: toRole(profile.role) };
}
