// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../live/client', () => ({ getMode: () => 'live', supabase: {} }));

import { CallFindings } from './Handover';
import type { Call } from '../../data/types';

afterEach(cleanup);
const call = (o: Record<string, unknown>) => ({ id: 'c1', outcome: 'Interested', score: 0, connected: true, ...o }) as Call;
const show = (o: Record<string, unknown>) => { render(<CallFindings call={call(o)} />); return document.body.textContent ?? ''; };
const known = (value: unknown) => ({ status: 'known', value });

describe('What we learned', () => {
  it('shows known facts in their groups, "Declined to say" for declined, and hides unknown and n/a', () => {
    const text = show({ discovery: {
      business_type: known('Café'), employees: known({ min: 5, max: 10 }), decision_maker: known(true),
      bb_provider: known('Eir'), bb_spend: known({ exact: 60, vat: 'incl' }), bb_contract: known({ date: '2027-03-01', type: 'fixed' }),
      mob_spend: { status: 'declined', value: null }, mob_network: { status: 'unknown', value: null }, m365: { status: 'n/a', value: null },
      mob_connections: known({ min: 50, max: null }),
    } });
    for (const s of ['Business', 'Broadband', 'Mobile', 'Café', '5–10', 'Eir', '€60/month incl. VAT', 'fixed', 'Declined to say', '50+']) expect(text).toContain(s);
    expect(screen.getByText('Decision maker').nextSibling?.textContent).toBe('Yes');
    expect(text).not.toContain('Network');
    expect(text).not.toContain('Microsoft 365');
    expect(text).not.toContain('Other services');
  });
  it('shows nothing for a call with no facts', () => expect(show({})).toBe(''));
  it('pluralises months left', () => {
    expect(show({ discovery: { bb_contract: known({ months: 1 }) } })).toContain('1 month left');
    cleanup();
    expect(show({ discovery: { bb_contract: known({ months: 3 }) } })).toContain('3 months left');
  });
});

describe('Estimates and unconfirmed dates', () => {
  it('contract with day and month but no year says the year is to confirm', () => {
    const text = show({ discovery: { bb_contract: known({ month: 1, day: 25 }) } });
    expect(text).toContain('25 Jan (year to confirm)');
    expect(text).not.toContain('NaN');
  });
  it('spend ranges are estimates, exact figures are not', () => {
    const text = show({ discovery: { mob_spend: known({ min: 500, max: null }), bb_spend: known({ min: 50, max: 75, vat: 'incl' }) } });
    expect(text).toContain('€500+/month (estimate)');
    expect(text).toContain('€50–75/month incl. VAT (estimate)');
    cleanup();
    expect(show({ discovery: { bb_spend: known({ exact: 60 }) } })).not.toContain('estimate');
  });
});

describe('Still to confirm', () => {
  const orla = { employees: known(5), premises: known(3), decision_maker: known(true), bb_issues: known(true), mob_network: known('Eir'), mob_connections: known(5),
    mob_spend: known({ min: 500, max: null }), bb_contract: known({ month: 1, day: 25 }), mob_contract: known({ month: 1, day: 25 }), m365: known(false) };
  it('lists what is missing or unconfirmed, and nothing already known', () => {
    show({ discovery: orla });
    const items = [...document.querySelectorAll('[data-testid="still-to-confirm"] li')].map((e) => e.textContent);
    expect(items).toEqual(['Broadband provider', 'Broadband spend', 'Broadband contract end (year to confirm)', 'Mobile contract end (year to confirm)']);
  });
  it('is hidden when everything is confirmed, and for demo calls', () => {
    const all = { ...orla, bb_provider: known('Eir'), bb_spend: known({ exact: 60 }), bb_contract: known({ date: '2027-03-01' }), mob_contract: known({ months: 6 }) };
    expect(show({ discovery: all })).not.toContain('Still to confirm');
    cleanup();
    expect(show({ discovery: orla, simulated: true })).not.toContain('Still to confirm');
  });
  it('declined facts stay as "Declined to say" rows and are not listed again', () => {
    show({ discovery: { ...orla, bb_provider: { status: 'declined', value: null } } });
    expect(document.querySelector('[data-testid="still-to-confirm"]')?.textContent).not.toContain('Broadband provider');
  });
});

describe('Next step', () => {
  it('callback shows time, reason and renewal date', () => {
    const text = show({ outcome: 'Callback requested', callbackTime: 'Tuesday at 3pm', followUp: { reason: 'renewal', contract_end: '2027-01-31' } });
    expect(text).toContain('Tuesday at 3pm');
    expect(text).toMatch(/renewal/i);
    expect(text).toContain('31 Jan 2027');
  });
  it.each([['unknown', 'Unknown'], ['2027-01-31', '31 Jan 2027'], ['soon', null]])('renewal contract end %s shows %s', (end, want) => {
    const text = show({ outcome: 'Callback requested', callbackTime: 'Tuesday at 3pm', followUp: { reason: 'renewal', contract_end: end } });
    expect(text).not.toContain('NaN');
    if (want) expect(screen.getByText('Contract ends').nextSibling?.textContent).toBe(want);
    else expect(text).not.toContain('Contract ends');
  });
  it('field visit is a request awaiting the team', () => {
    const text = show({ outcome: 'Qualified', callbackTime: 'Thursday 10am', followUp: { reason: 'field_visit', visit_address: '1 Main St, Cork', contact_name: 'Ann', attendees: 'Ann and Joe', products: 'Broadband' } });
    for (const s of ['Request — awaiting team confirmation', '1 Main St, Cork', 'Ann and Joe', 'Broadband', 'Thursday 10am']) expect(text).toContain(s);
  });
  it('email request is not sent yet', () => {
    const text = show({ outcome: 'Interested', followUp: { reason: 'email', email: 'ann@cafe.ie', products: 'Mobile' } });
    for (const s of ['Not sent yet', 'ann@cafe.ie', 'Mobile']) expect(text).toContain(s);
  });
  it('a simulated demo transfer shows no next step', () => expect(show({ outcome: 'Transferred to human', simulated: true })).toBe(''));
  it('a Live transfer with no follow-up still shows it', () => expect(show({ outcome: 'Transferred to human', simulated: false })).toContain('Transferred to a specialist'));
  it('transfer done', () => expect(show({ outcome: 'Transferred to human', followUp: { transfer: 'done' } })).toContain('Transferred to a specialist'));
  it.each([
    ['callback', { reason: 'callback' }, 'Callback'], ['field visit', { reason: 'field_visit', visit_address: '1 Main St', contact_name: 'Ann' }, 'Field visit'],
    ['email', { reason: 'email', email: 'ann@cafe.ie', products: 'Mobile' }, 'Email'],
  ])('a failed transfer shows "Transfer attempted" with a %s next step', (_, followUp, step) => {
    const text = show({ outcome: 'Interested', callbackTime: 'Friday 2pm', followUp: { ...followUp, transfer: 'failed' } });
    expect(text).toContain('Transfer attempted');
    expect(text).toContain(step);
  });
  it('a failed transfer with no follow-up still shows it was attempted', () =>
    expect(show({ outcome: 'Not interested', followUp: { transfer: 'failed' } })).toContain('Transfer attempted'));
});

describe('Score', () => {
  it('shows total, classification and every criterion with its points', () => {
    const text = show({ score: 65, classification: 'warm', qualification: { decision_maker: 10, employees_5: 5, bb_spend_50: 0 } });
    expect(text).toContain('65/100');
    expect(text).toContain('Warm');
    expect(screen.getByText('Decision maker').nextSibling?.textContent).toBe('10/10');
    expect(screen.getByText('Broadband spend €50+').nextSibling?.textContent).toBe('0/10');
    expect(screen.getByText('Next step agreed').nextSibling?.textContent).toBe('0/10');
  });
  it('an old 4-key qualification does not show matrix points', () => {
    const text = show({ score: 50, qualification: { need: 20, budget: 10, timeline: 5, authority: 15 } });
    expect(text).not.toContain('Decision maker');
  });
});
