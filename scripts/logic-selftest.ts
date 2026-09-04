/**
 * Self-test for the pure business logic: money, distances, statuses.
 *
 * These functions decide what a rider is told they earned and how far they
 * have to ride, so they are worth pinning down. Run with:
 *   npx tsx scripts/logic-selftest.ts
 */
import { summarizeEarnings, successRateOf, formatRupees } from '../src/lib/earnings';
import {
  normalizeStatus,
  stageOf,
  parseItems,
  itemCountOf,
  titleFor,
  estimatePayout,
  isTerminal,
  toDeliveryOrder,
} from '../src/lib/orders';
import { haversineKm, etaMinutesFromKm, formatKm, formatMinutes, isValidLatLng } from '../src/lib/geo';
import type { DeliveryOrder } from '../src/types';
import type { PartnerOrderRpcRow } from '../src/lib/schema';

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

const order = (over: Partial<DeliveryOrder> = {}): DeliveryOrder =>
  ({
    id: 'o1',
    orderNumber: 'ORD1',
    title: 'Wheat',
    items: [],
    itemCount: 1,
    totalAmount: 1000,
    payout: 100,
    status: 'delivered',
    stage: 'completed',
    address: null,
    phone: null,
    destination: null,
    assignedPartner: 'p1',
    isMine: true,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    distanceKm: null,
    etaMinutes: null,
    ...over,
  }) as DeliveryOrder;

console.log('\n--- status normalisation ---');
check('in_transit maps to out_for_delivery', normalizeStatus('in_transit') === 'out_for_delivery', normalizeStatus('in_transit'));
check('out_for_delivery passes through', normalizeStatus('out_for_delivery') === 'out_for_delivery');
check('unknown falls back to pending', normalizeStatus('banana') === 'pending', normalizeStatus('banana'));
check('null falls back to pending', normalizeStatus(null) === 'pending');
check('accepted -> active stage', stageOf('accepted') === 'active', stageOf('accepted'));
check('pending -> incoming stage', stageOf('pending') === 'incoming');
check('delivered -> completed stage', stageOf('delivered') === 'completed');
check('cancelled -> cancelled stage', stageOf('cancelled') === 'cancelled');
check('delivered is terminal', isTerminal('delivered') === true);
check('accepted is not terminal', isTerminal('accepted') === false);

console.log('\n--- item parsing (jsonb is untrusted) ---');
check('parses an array', parseItems([{ name: 'Rice', quantity: 2 }] as never).length === 1);
check('non-array returns empty', parseItems({ nope: true } as never).length === 0);
check('null returns empty', parseItems(null).length === 0);
check('string returns empty', parseItems('oops' as never).length === 0);
check('counts quantities', itemCountOf([{ quantity: 3 }, { quantity: 2 }] as never) === 5, String(itemCountOf([{ quantity: 3 }, { quantity: 2 }] as never)));
check('missing quantity counts as 1', itemCountOf([{}] as never) === 1, String(itemCountOf([{}] as never)));
check('title falls back to order number', titleFor([], 'ORD9').includes('ORD9'), titleFor([], 'ORD9'));

console.log('\n--- payout estimate ---');
const p = estimatePayout(1000, 5);
check('payout is positive', p > 0, String(p));
check('longer distance pays more', estimatePayout(1000, 10) > estimatePayout(1000, 2));
check('bigger order pays more', estimatePayout(5000, 5) > estimatePayout(500, 5));
check('null distance still pays', estimatePayout(1000, null) > 0, String(estimatePayout(1000, null)));
check('zero order still pays a floor', estimatePayout(0, 0) > 0, String(estimatePayout(0, 0)));

console.log('\n--- earnings bucket by DELIVERY time, not order time ---');
const now = new Date('2026-08-04T18:00:00+05:30');
const yesterday = new Date('2026-08-03T10:00:00+05:30').toISOString();
const todayISO = new Date('2026-08-04T14:00:00+05:30').toISOString();

// The regression that motivated this suite: placed yesterday, delivered today.
const straddling = summarizeEarnings(
  [order({ createdAt: yesterday, completedAt: todayISO, payout: 250 })],
  now,
);
check("counts toward TODAY when delivered today", straddling.today === 250, `got ${straddling.today}`);
check('trips today counts it', straddling.tripsToday === 1, String(straddling.tripsToday));

const oldDelivery = summarizeEarnings(
  [order({ createdAt: yesterday, completedAt: yesterday, payout: 250 })],
  now,
);
check('yesterday delivery excluded from today', oldDelivery.today === 0, `got ${oldDelivery.today}`);
check('but still in lifetime total', oldDelivery.total === 250, `got ${oldDelivery.total}`);

const noCompleted = summarizeEarnings(
  [order({ createdAt: todayISO, completedAt: null, payout: 99 })],
  now,
);
check('falls back to createdAt when completedAt is null', noCompleted.today === 99, `got ${noCompleted.today}`);

console.log('\n--- earnings hygiene ---');
const mixed = summarizeEarnings(
  [order({ payout: 100 }), order({ status: 'cancelled', stage: 'cancelled', payout: 999 })],
  now,
);
check('cancelled orders earn nothing', mixed.total === 100, `got ${mixed.total}`);
check('empty list is all zeros', summarizeEarnings([], now).total === 0);
check('weekSeries always has 7 days', summarizeEarnings([], now).weekSeries.length === 7);
check('heatmap is 7x4', summarizeEarnings([], now).heatmap.every((d) => d.length === 4));
const badDate = summarizeEarnings([order({ completedAt: 'not-a-date', createdAt: 'nope' })], now);
check('invalid dates do not crash or leak into totals', Number.isFinite(badDate.today));

console.log('\n--- success rate ---');
check('no history -> null (not a fake 0%)', successRateOf([]) === null);
check('all delivered -> 100', successRateOf([order()]) === 100, String(successRateOf([order()])));
check(
  'half cancelled -> 50',
  successRateOf([order(), order({ status: 'cancelled' })]) === 50,
  String(successRateOf([order(), order({ status: 'cancelled' })])),
);
check(
  'in-flight orders are ignored',
  successRateOf([order({ status: 'accepted' })]) === null,
  String(successRateOf([order({ status: 'accepted' })])),
);

console.log('\n--- geo ---');
const mumbai = { lat: 19.076, lng: 72.8777 };
const delhi = { lat: 28.7041, lng: 77.1025 };
const d = haversineKm(mumbai, delhi);
check('Mumbai->Delhi ~1150km', d > 1100 && d < 1200, `got ${d.toFixed(0)}km`);
check('same point is 0km', haversineKm(mumbai, mumbai) < 0.001);
check('ETA scales with distance', etaMinutesFromKm(10) > etaMinutesFromKm(5));
check('formatKm handles null', formatKm(null) === '—', formatKm(null));
check('formatKm sub-1km uses metres', formatKm(0.4).includes('m'), formatKm(0.4));
check('formatMinutes handles null', formatMinutes(null) === '—', formatMinutes(null));
check('rejects (0,0) placeholder', isValidLatLng(0, 0) === false);
check('accepts real coords', isValidLatLng(19.076, 72.8777) === true);
check('rejects out-of-range lat', isValidLatLng(999, 72) === false);
check('rejects null', isValidLatLng(null, null) === false);

console.log('\n--- row -> DeliveryOrder mapping ---');
const row: PartnerOrderRpcRow = {
  id: 'x1',
  order_number: 'ORD5',
  items: [{ name: 'Seeds', quantity: 2 }] as never,
  total_amount: 3600,
  status: 'in_transit',
  delivery_address: 'Bandra',
  phone_number: '9999999999',
  gps_lat: 19.08,
  gps_lng: 72.88,
  created_at: yesterday,
  updated_at: todayISO,
  assigned_partner: 'p1',
};
const mapped = toDeliveryOrder(row, { partnerId: 'p1', origin: mumbai });
check('in_transit normalised', mapped.status === 'out_for_delivery', mapped.status);
check('stage is active', mapped.stage === 'active');
check('isMine true for own order', mapped.isMine === true);
check('completedAt picked up from updated_at', mapped.completedAt === todayISO);
check('distance computed from origin', mapped.distanceKm != null && mapped.distanceKm > 0);
check('payout computed', mapped.payout > 0);
check('itemCount from jsonb', mapped.itemCount === 2, String(mapped.itemCount));

const foreign = toDeliveryOrder({ ...row, assigned_partner: 'someone-else' }, { partnerId: 'p1' });
check('isMine false for another partner', foreign.isMine === false);
check('no origin -> null distance', foreign.distanceKm === null);

const noGps = toDeliveryOrder({ ...row, gps_lat: null, gps_lng: null }, { partnerId: 'p1', origin: mumbai });
check('missing GPS -> null destination', noGps.destination === null);
check('missing GPS -> null distance', noGps.distanceKm === null);

const zeroGps = toDeliveryOrder({ ...row, gps_lat: 0, gps_lng: 0 }, { partnerId: 'p1', origin: mumbai });
check('(0,0) treated as no destination', zeroGps.destination === null);

console.log('\n--- currency formatting ---');
check('formats with rupee sign', formatRupees(1234).startsWith('₹'), formatRupees(1234));
check('Indian digit grouping', formatRupees(100000).includes('1,00,000'), formatRupees(100000));
check('zero renders', formatRupees(0).includes('0'));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
