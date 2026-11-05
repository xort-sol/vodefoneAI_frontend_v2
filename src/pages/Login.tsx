import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, KeyRound, ShieldCheck, PhoneCall, BadgeCheck, FlaskConical } from 'lucide-react';
import { Button, Field, Badge } from '../components/ui';
import { useApp } from '../store/store';
import { DAY, NOW } from '../data/seed';

export default function Login() {
  const nav = useNavigate(); const loc = useLocation();
  const app = useApp();
  const monthCalls = app.calls.filter((c) => NOW.getTime() - new Date(c.startedAt).getTime() < 30 * DAY).length;
  const [email, setEmail] = useState('sarah.mitchell@vodafone-demo.co.uk');
  const [pw, setPw] = useState('demo-password');
  const [err, setErr] = useState<{ email?: string; pw?: string }>({});
  const [step, setStep] = useState<'creds' | 'mfa'>('creds');
  const [code, setCode] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n: typeof err = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) n.email = 'Enter a valid work email address.';
    if (pw.length < 8) n.pw = 'Password must be at least 8 characters.';
    setErr(n);
    if (!Object.keys(n).length) setStep('mfa');
  };
  const verify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) { setErr({ pw: 'Enter the 6-digit code from your authenticator app.' }); return; }
    try { sessionStorage.setItem('vf-auth', '1'); } catch { /* */ }
    nav((loc.state as { from?: string } | null)?.from ?? '/', { replace: true });
  };
  return (
    <div className="auth">
      <div className="auth-form">
        <div className="row" style={{ marginBottom: 48 }}>
          <span className="brand-mark" style={{ width: 28, height: 28 }}><svg width="16" height="16" viewBox="0 0 24 24"><path fill="#fff" d="M13.6 4.2c-3.9.7-6.9 4-6.9 8.3 0 4.4 3.4 7.6 7.2 7.6 3.6 0 6.4-2.7 6.4-6.4 0-3.3-2.2-5.4-5.3-6.1v-.2c0-1.3.7-2.4 1.5-3.1-.9 0-1.9 0-2.9-.1z" /></svg></span>
          <div><div className="brand-name">Vodafone</div><div className="brand-sub">AI Sales Operations</div></div>
        </div>
        <h1 className="display" style={{ fontSize: 40, lineHeight: 1.1 }}>{step === 'creds' ? 'Sign in to your workspace' : 'Two-step verification'}</h1>
        <p className="subtle mt-8">{step === 'creds' ? 'Manage AI outbound campaigns, qualified leads and your sales team in one place.' : 'Enter the 6-digit code from your authenticator app. Any 6 digits work in demo mode.'}</p>
        {step === 'creds' ? (
          <form className="col gap-16 mt-24" onSubmit={submit} noValidate>
            <Field label="Work email" error={err.email}><input className={`input ${err.email ? 'invalid' : ''}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></Field>
            <Field label="Password" error={err.pw}><input className={`input ${err.pw ? 'invalid' : ''}`} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></Field>
            <Button variant="primary" type="submit" className="mt-8" iconRight={<ArrowRight />} style={{ height: 38 }}>Continue</Button>
            <div className="row" style={{ gap: 12 }}><div className="divider grow" /><span className="xs muted">OR</span><div className="divider grow" /></div>
            <Button style={{ height: 38 }} icon={<KeyRound />} onClick={() => setStep('mfa')}>Continue with Vodafone SSO</Button>
          </form>
        ) : (
          <form className="col gap-16 mt-24" onSubmit={verify} noValidate>
            <Field label="Verification code" error={err.pw}><input className={`input mono ${err.pw ? 'invalid' : ''}`} inputMode="numeric" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus style={{ letterSpacing: '0.3em', fontSize: 16 }} /></Field>
            <Button variant="primary" type="submit" style={{ height: 38 }}>Verify and sign in</Button>
            <Button variant="ghost" onClick={() => { setStep('creds'); setErr({}); }}>Back</Button>
          </form>
        )}
        <div className="banner sim mt-24"><FlaskConical /><div>Demonstration environment. Data is synthetic and calls are simulated — no real customers are contacted.</div></div>
      </div>
      <div className="auth-side dotgrid">
        <div className="card feature" style={{ width: 440, maxWidth: '100%' }}>
          <div className="row between"><span className="label">Live operations</span><Badge tone="green" dot live>Simulated</Badge></div>
          <div className="display mt-12" style={{ fontSize: 48, lineHeight: 1 }}>{monthCalls.toLocaleString('en-GB')}</div>
          <div className="subtle small mt-4">AI calls placed in the last 30 days</div>
          <div className="divider" />
          <div className="col gap-12">
            {[
              [<PhoneCall size={15} key="a" />, 'AI agent introduces the right offer', 'Approved pricing, compliant disclosure'],
              [<BadgeCheck size={15} key="b" />, 'Qualifies intent and books the next step', 'Hot, warm and cold scoring'],
              [<ShieldCheck size={15} key="c" />, 'Hands over to a human with full context', 'Transcript, recording and AI summary'],
            ].map(([i, t, s], k) => (
              <div key={k} className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
                <span className="avatar" style={{ borderRadius: 8 }}>{i}</span>
                <div><div className="medium" style={{ color: 'var(--ink)' }}>{t}</div><div className="small muted">{s}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
