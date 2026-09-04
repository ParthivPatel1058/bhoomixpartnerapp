/**
 * Self-test for the delivery SLA.
 *
 * This logic decides whether a partner keeps or loses an order, so the tier
 * boundaries are pinned down here. Run with:
 *   npx tsx scripts/sla-selftest.ts
 */
import {
  slaFor,
  isAcceptable,
  formatSlaRemaining,
  SLA_MINUTES,
  AT_RISK_MINUTES,
  MIN_ACCEPT_HEADROOM_MINUTES,
} from '../src/lib/sla';
import type { DeliveryOrder } from '../src/types';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail = '') => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
};

const NOW = new Date('2026-08-04T12:00:00Z');

/** An order placed `age` minutes before NOW. */
const aged = (age: number, over: Partial<DeliveryOrder> = {}): DeliveryOrder =>
  ({
    id: 'o1',
    orderNumber: 'ORD1',
    title: 'Wheat',
    items: [],
    itemCount: 1,
    totalAmount: 1000,
    payout: 100,
    status: 'pending',
    stage: 'incoming',
    address: null,
    phone: null,
    destination: null,
    assignedPartner: null,
    isMine: false,
    createdAt: new Date(NOW.getTime() - age * 60_000).toISOString(),
    completedAt: null,
    distanceKm: null,
    etaMinutes: null,
    ...over,
  }) as DeliveryOrder;

console.log('\n--- policy constants ---');
check('SLA window is 1h20m', SLA_MINUTES === 80, String(SLA_MINUTES));
check('at-risk tier starts before the deadline', AT_RISK_MINUTES < SLA_MINUTES);
check('accept headroom is positive', MIN_ACCEPT_HEADROOM_MINUTES > 0);

console.log('\n--- tier boundaries ---');
check('fresh order is on time', slaFor(aged(0), NOW)?.state === 'on_time');
check('59 min is still on time', slaFor(aged(59), NOW)?.state === 'on_time', slaFor(aged(59), NOW)?.state);
check('60 min flips to at risk', slaFor(aged(60), NOW)?.state === 'at_risk', slaFor(aged(60), NOW)?.state);
check('79 min is at risk, not breached', slaFor(aged(79), NOW)?.state === 'at_risk', slaFor(aged(79), NOW)?.state);
check('80 min is breached', slaFor(aged(80), NOW)?.state === 'breached', slaFor(aged(80), NOW)?.state);
check('120 min is breached', slaFor(aged(120), NOW)?.state === 'breached');

console.log('\n--- expiry flag ---');
check('not expired at 79 min', slaFor(aged(79), NOW)?.expired === false);
check('expired exactly at 80 min', slaFor(aged(80), NOW)?.expired === true);
check('expired well past', slaFor(aged(200), NOW)?.expired === true);

console.log('\n--- remaining time ---');
const at30 = slaFor(aged(30), NOW)!;
check('50 min left at the 30 min mark', Math.round(at30.minutesRemaining) === 50, String(at30.minutesRemaining));
const at90 = slaFor(aged(90), NOW)!;
check('goes negative once overdue', at90.minutesRemaining < 0, String(at90.minutesRemaining));
check('overdue by 10 min at 90 min', Math.round(at90.minutesRemaining) === -10, String(at90.minutesRemaining));

console.log('\n--- progress fraction ---');
check('0 at placement', slaFor(aged(0), NOW)!.fraction === 0);
check('~0.5 at halfway', Math.abs(slaFor(aged(40), NOW)!.fraction - 0.5) < 0.01);
check('clamped to 1 when overdue', slaFor(aged(500), NOW)!.fraction === 1);

console.log('\n--- acceptability (the pool filter) ---');
check('fresh order is acceptable', isAcceptable(aged(0), NOW) === true);
check('60 min old still acceptable', isAcceptable(aged(60), NOW) === true);
check('65 min leaves exactly the headroom', isAcceptable(aged(65), NOW) === true);
check('66 min is too stale to offer', isAcceptable(aged(66), NOW) === false);
check('expired order is not acceptable', isAcceptable(aged(95), NOW) === false);

console.log('\n--- deadline timestamp ---');
const dl = slaFor(aged(0), NOW)!.deadline;
check('deadline is 80 min after placement', dl.getTime() === NOW.getTime() + 80 * 60_000, dl.toISOString());

console.log('\n--- formatting ---');
check('sub-hour reads in minutes', formatSlaRemaining(45) === '45m left', formatSlaRemaining(45));
check('over an hour splits h/m', formatSlaRemaining(72) === '1h 12m left', formatSlaRemaining(72));
check('negative reads as overdue', formatSlaRemaining(-10) === '10m overdue', formatSlaRemaining(-10));
check('zero reads as overdue', formatSlaRemaining(0) === '0m overdue', formatSlaRemaining(0));
check('long overdue splits h/m', formatSlaRemaining(-95) === '1h 35m overdue', formatSlaRemaining(-95));

console.log('\n--- robustness ---');
check('unparseable timestamp -> null', slaFor(aged(0, { createdAt: 'nonsense' }), NOW) === null);
check(
  'unparseable order is NOT hidden from the pool',
  isAcceptable(aged(0, { createdAt: 'nonsense' }), NOW) === true,
);
check('future-dated order is on time', slaFor(aged(-30), NOW)?.state === 'on_time');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
