// Run: node tests/calc.test.js
const assert = require('assert');
const C = require('../assets/calc.js');

let passed = 0;
function t(name, fn) { fn(); passed++; console.log('ok  ', name); }
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b}`);
const sumBreakdown = (b) => b.depreciation + b.onRoad + b.energy + b.insurance + b.tax + b.maintenance +
  b.battery + b.financing + b.driverParking + b.longTrips + b.fares + b.waiting + b.charger + b.opportunity;

const g = { ...C.DEFAULT_GLOBALS, dailyKm: 50, petrol: 346, elecTariff: 60, years: 5, returnPct: 10, inflationPct: 5 };
const petrol = { id: 'p', name: 'Petrol', type: 'petrol', price: 6000000, kmpl: 12, deprPct: 5, insurancePct: 2.5,
  maintenance: 60000, tokenTax: 7000, wht: 90000, payment: 'cash' };
const ev = { id: 'e', name: 'EV', type: 'ev', price: 9000000, kmPerKwh: 6, deprPct: 11, insurancePct: 2.5,
  maintenance: 25000, tokenTax: 0, wht: 0, chargerCost: 250000, payment: 'cash' };
const ride = { id: 'r', name: 'Ride', type: 'ride', perKm: 65, perTrip: 100, tripsPerDay: 2, surgePct: 10 };

t('EMI matches the textbook formula', () => {
  near(C.emiFor(3000000, 16.5, 36), 106213.15, 0.01, 'emi');
  near(C.balanceAfter(3000000, 16.5, C.emiFor(3000000, 16.5, 36), 36), 0, 1, 'paid off');
});

t('with no return and no inflation, the breakdown adds up to the cash spent', () => {
  const gg = { ...g, returnPct: 0, inflationPct: 0 };
  const r = C.simulate(petrol, gg);
  near(r.fv, r.nominal, 1e-6);
  near(sumBreakdown(r.breakdown), r.fv, 1, 'sum');
  near(r.monthly, r.fv / 60, 1e-6);
  near(r.breakdown.energy, 50 * 30 * 60 / 12 * 346, 1, 'fuel');
});

t('breakdown adds up to future value with return and inflation (cash, EMI, ride)', () => {
  for (const o of [petrol, { ...petrol, payment: 'emi', downPct: 50, ratePct: 16.5, tenureYears: 3, processingFee: 10000 }, ev, ride,
    { ...petrol, payment: 'emi', downPct: 30, ratePct: 16, tenureYears: 7 }]) {
    const r = C.simulate(o, g);
    near(sumBreakdown(r.breakdown), r.fv, 1, o.name);
    near(r.curve[r.curve.length - 1], r.fv, 1, 'curve end ' + o.name);
  }
});

t('EMI costs more than cash when the loan rate beats the investment return', () => {
  const cash = C.simulate(petrol, g).monthly;
  const emi = C.simulate({ ...petrol, payment: 'emi', downPct: 50, ratePct: 16.5, tenureYears: 3 }, g).monthly;
  assert.ok(emi > cash);
});

t('loan still running at the horizon is settled from the sale', () => {
  const r = C.simulate({ ...petrol, payment: 'emi', downPct: 30, ratePct: 16, tenureYears: 7 }, { ...g, years: 3 });
  assert.ok(r.warnings.length >= 2); // above cap, tenure too long
});

t('solar charging lowers EV energy cost; non-filer pays more tax', () => {
  assert.ok(C.simulate(ev, { ...g, solarPct: 100 }).breakdown.energy === 0);
  assert.ok(C.simulate(petrol, { ...g, filer: false }).breakdown.onRoad > C.simulate(petrol, g).breakdown.onRoad);
});

t('ride-hailing gets dearer the more you drive, and there is a crossover vs owning', () => {
  const lo = C.simulate(ride, { ...g, dailyKm: 10 }).monthly, hi = C.simulate(ride, { ...g, dailyKm: 80 }).monthly;
  assert.ok(hi > lo * 3);
  const km = C.crossover(ride, petrol, g, 1, 300);
  assert.ok(km && km > 1 && km < 300, 'crossover ' + km);
});

t('keep option: no purchase costs, depreciation from today\'s value', () => {
  const r = C.simulate({ id: 'k', name: 'Keep', type: 'keep', fuel: 'hybrid', price: 2200000, kmpl: 18, deprPct: 5,
    insurancePct: 0, maintenance: 120000, batteryCost: 180000, batteryYear: 1 }, g);
  assert.strictEqual(r.breakdown.onRoad, 0);
  assert.ok(r.breakdown.battery > 0);
});

console.log(`\n${passed} tests passed`);
