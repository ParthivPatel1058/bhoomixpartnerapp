import {
  projectOntoRoute,
  computeProgress,
  formatManeuverDistance,
  ARRIVAL_RADIUS_M,
  OFF_ROUTE_M,
} from '../src/lib/navigation';
import type { Route } from '../src/lib/routing';

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

// A ~1km east-west leg then a ~1km north leg, in Mumbai.
const A = { lat: 19.076, lng: 72.8777 };
const B = { lat: 19.076, lng: 72.8872 }; // ~1km east
const C = { lat: 19.085, lng: 72.8872 }; // ~1km north

const route: Route = {
  coordinates: [A, B, C],
  distanceKm: 2.0,
  durationMinutes: 7,
  steps: [
    { instruction: 'Head east on MG Road', distanceKm: 1.0 },
    { instruction: 'Turn left onto Linking Road', distanceKm: 1.0 },
    { instruction: 'Arrive at the drop-off', distanceKm: 0 },
  ],
  source: 'osrm',
};

console.log('\n--- projectOntoRoute ---');
const onLine = projectOntoRoute({ lat: 19.076, lng: 72.882 }, route.coordinates);
check('projects a point sitting on the line to ~0m', !!onLine && onLine.distanceM < 5, `got ${onLine?.distanceM.toFixed(1)}m`);
check('identifies the first segment', onLine?.segmentIndex === 0, `got ${onLine?.segmentIndex}`);

// ~200m north of the first leg
const offLine = projectOntoRoute({ lat: 19.0778, lng: 72.882 }, route.coordinates);
check('measures perpendicular offset', !!offLine && offLine.distanceM > 150 && offLine.distanceM < 250, `got ${offLine?.distanceM.toFixed(0)}m`);

console.log('\n--- progress at the start ---');
const atStart = computeProgress(route, A, C);
check('remaining ~= full route', !!atStart && Math.abs(atStart.remainingM - 2000) < 120, `got ${atStart?.remainingM.toFixed(0)}m`);
check('fraction ~ 0', !!atStart && atStart.fraction < 0.06, `got ${atStart?.fraction.toFixed(3)}`);
check('first step is current', atStart?.currentStep?.instruction === 'Head east on MG Road', `got "${atStart?.currentStep?.instruction}"`);
check('not arrived', atStart?.arrived === false);
check('not off route', atStart?.offRoute === false);
check('all 3 steps upcoming', atStart?.upcomingSteps.length === 3, `got ${atStart?.upcomingSteps.length}`);

console.log('\n--- progress at the corner (1km in) ---');
const atCorner = computeProgress(route, B, C);
check('remaining ~= 1km', !!atCorner && Math.abs(atCorner.remainingM - 1000) < 120, `got ${atCorner?.remainingM.toFixed(0)}m`);
check('fraction ~ 0.5', !!atCorner && Math.abs(atCorner.fraction - 0.5) < 0.08, `got ${atCorner?.fraction.toFixed(3)}`);
check('second step is now current', atCorner?.currentStep?.instruction === 'Turn left onto Linking Road', `got "${atCorner?.currentStep?.instruction}"`);

console.log('\n--- arrival ---');
const nearDest = { lat: C.lat - 0.0003, lng: C.lng }; // ~33m short
const atEnd = computeProgress(route, nearDest, C);
check(`arrived within ${ARRIVAL_RADIUS_M}m`, atEnd?.arrived === true);
const farFromDest = computeProgress(route, { lat: C.lat - 0.002, lng: C.lng }, C); // ~220m
check('not arrived at 220m', farFromDest?.arrived === false);

console.log('\n--- off-route detection ---');
const wandered = computeProgress(route, { lat: 19.0778, lng: 72.882 }, C); // ~200m off
check(`flags off-route beyond ${OFF_ROUTE_M}m`, wandered?.offRoute === true, `offset ${wandered?.offRouteM.toFixed(0)}m`);
const slightlyOff = computeProgress(route, { lat: 19.0762, lng: 72.882 }, C); // ~22m off
check('tolerates GPS jitter (22m)', slightlyOff?.offRoute === false, `offset ${slightlyOff?.offRouteM.toFixed(0)}m`);

console.log('\n--- manoeuvre phrasing ---');
check('under 30m reads "now"', formatManeuverDistance(12) === 'now', formatManeuverDistance(12));
check('rounds to 10m', formatManeuverDistance(247) === 'in 250 m', formatManeuverDistance(247));
check('switches to km', formatManeuverDistance(1240) === 'in 1.2 km', formatManeuverDistance(1240));
check('handles null', formatManeuverDistance(null) === '');

console.log('\n--- edge cases ---');
check('null route -> null', computeProgress(null, A, C) === null);
check('null position -> null', computeProgress(route, null, C) === null);
check('degenerate 1-point path -> null', projectOntoRoute(A, [A]) === null);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
