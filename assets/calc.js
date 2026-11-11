/*
 * CarCalc — the money engine behind "Which car should I buy?"
 * Pure functions, no DOM. Works in the browser (window.CarCalc) and in Node (require).
 *
 * Every option is simulated month by month over the horizon. Cash flows are what you pay
 * (positive) or receive (negative). The "true monthly cost" is the level monthly amount whose
 * invested future value equals the future value of all those cash flows, so it already
 * includes what your money could have earned instead (opportunity cost).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CarCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULT_GLOBALS = {
    mode: 'replace',          // 'replace' (you own a car today) | 'first'
    dailyKm: 50,
    daysPerMonth: 30,
    petrol: 346,              // Rs per litre
    elecTariff: 60,           // Rs per unit (kWh) at home
    solarPct: 0,              // share of charging from your own solar, 0-100
    years: 5,
    returnPct: 10,            // what money earns after tax, % a year
    inflationPct: 5,          // running costs rise, % a year
    regPct: 1,                // registration / excise as % of price (one-time)
    filer: true,              // non-filers pay ~3x withholding tax
    longTripsPerYear: 0,      // intercity round trips a year
    longTripKm: 600,          // km per round trip
    longTripRental: 18000,    // Rs per trip if the option can't do it (EV range, ride-hailing)
    driverMonthly: 0,
    parkingMonthly: 0
  };

  var SBP = { loanCap: 3000000, maxFinancePct: 70, maxTenureSmall: 5, maxTenureLarge: 3, evTenure: 7 };

  function num(v, d) { var n = Number(v); return isFinite(n) ? n : (d || 0); }

  function monthlyRate(annualPct) { return Math.pow(1 + annualPct / 100, 1 / 12) - 1; }

  function emiFor(loan, ratePct, months) {
    if (loan <= 0 || months <= 0) return 0;
    var i = ratePct / 100 / 12;
    if (i === 0) return loan / months;
    return loan * i / (1 - Math.pow(1 + i, -months));
  }

  function balanceAfter(loan, ratePct, emi, k) {
    var i = ratePct / 100 / 12;
    if (i === 0) return Math.max(0, loan - emi * k);
    var g = Math.pow(1 + i, k);
    return Math.max(0, loan * g - emi * (g - 1) / i);
  }

  /** Market value after t years with a constant yearly depreciation rate. */
  function valueAt(price, deprPct, years) {
    return price * Math.pow(1 - deprPct / 100, years);
  }

  /** Withholding tax actually payable: presets hold the filer amount; non-filers pay 3x. */
  function whtFor(opt, g) { return num(opt.wht) * (g.filer ? 1 : 3); }

  function isRide(o) { return o.type === 'ride'; }
  function isEV(o) { return o.type === 'ev'; }
  function isPHEV(o) { return o.type === 'phev'; }

  /** Energy cost for a given number of km at today's prices. */
  function energyCost(o, km, g) {
    var elec = g.elecTariff * (1 - g.solarPct / 100);
    if (isEV(o)) return km / Math.max(0.1, num(o.kmPerKwh, 6)) * elec;
    if (isPHEV(o)) {
      var share = num(o.evShare, 50) / 100;
      return km * share / Math.max(0.1, num(o.kmPerKwh, 5)) * elec +
             km * (1 - share) / Math.max(0.1, num(o.kmpl, 12)) * g.petrol;
    }
    return km / Math.max(0.1, num(o.kmpl, 12)) * g.petrol;
  }

  /**
   * Simulate one option. Returns cash flows, breakdown, the true monthly cost and warnings.
   * opt.type: petrol | hybrid | phev | ev | ride | keep (keep = your current car, as entered)
   */
  function simulate(opt, gIn) {
    var g = Object.assign({}, DEFAULT_GLOBALS, gIn || {});
    var M = Math.max(1, Math.round(g.years * 12));
    var rm = monthlyRate(g.returnPct);
    var kmMonth = g.dailyKm * g.daysPerMonth;
    var trips = num(g.longTripsPerYear);
    var tripKmMonth = trips * num(g.longTripKm) / 12;
    var keep = opt.type === 'keep';
    var ride = isRide(opt);
    var o = Object.assign({}, opt);
    if (keep) o.type = o.fuel || 'petrol';

    var cf = new Array(M + 1).fill(0);
    var b = { depreciation: 0, onRoad: 0, energy: 0, insurance: 0, tax: 0, maintenance: 0,
              battery: 0, financing: 0, driverParking: 0, longTrips: 0, fares: 0, waiting: 0, charger: 0 };
    var warnings = [];
    var price = num(o.price);
    var depr = num(o.deprPct, 6);
    var loan = 0, emi = 0, n = 0, rate = 0, runFlows = null, travel1 = 0;

    function infl(m) { return Math.pow(1 + g.inflationPct / 100, Math.floor(m / 12)); }

    if (ride) {
      var surge = 1 + num(o.surgePct) / 100;
      for (var m = 1; m <= M; m++) {
        var fare = (kmMonth * num(o.perKm) + g.daysPerMonth * num(o.tripsPerDay, 2) * num(o.perTrip)) * surge * infl(m - 1);
        var lt = trips * num(g.longTripRental) / 12 * infl(m - 1);
        cf[m] += fare + lt; b.fares += fare; b.longTrips += lt;
        if (m === 1) travel1 = fare + lt;
      }
    } else {
      // ---- month 0: buying (or, for "keep", the value you choose not to sell) ----
      var onRoad = keep ? 0 : whtFor(o, g) + price * g.regPct / 100;
      var charger = (!keep && (isEV(o) || isPHEV(o))) ? num(o.chargerCost) : 0;
      var premium = keep ? 0 : num(o.premium);
      var upfront;
      if (!keep && o.payment === 'emi') {
        var downPct = num(o.downPct, 30);
        loan = price * (1 - downPct / 100);
        rate = num(o.ratePct, 16.5);
        n = Math.max(1, Math.round(num(o.tenureYears, 3) * 12));
        emi = emiFor(loan, rate, n);
        upfront = price * downPct / 100 + onRoad + charger + premium + num(o.processingFee);
        b.financing += num(o.processingFee);
        if (loan > SBP.loanCap) warnings.push('Loan of Rs ' + Math.round(loan).toLocaleString('en-PK') + ' is above the SBP cap of Rs 30 lakh per person. Raise the down payment.');
        if (100 - downPct > SBP.maxFinancePct) warnings.push('Banks finance at most ' + SBP.maxFinancePct + '% of the price: down payment must be at least ' + (100 - SBP.maxFinancePct) + '%.');
        var maxT = isEV(o) && !o.imported ? SBP.evTenure : (num(o.cc) > 1000 ? SBP.maxTenureLarge : SBP.maxTenureSmall);
        if (num(o.tenureYears) > maxT) warnings.push('SBP allows up to ' + maxT + ' years for this car; ' + o.tenureYears + ' years may not be offered.');
        if (o.imported) warnings.push('Imported (CBU) cars usually cannot be bank-financed. Check with the dealer.');
      } else {
        upfront = price + onRoad + charger + premium;
      }
      cf[0] += upfront;
      b.onRoad += onRoad; b.charger += charger; b.waiting += premium;

      // Paying months before delivery: the money stops earning that long.
      var wait = keep ? 0 : num(o.waitMonths);
      if (wait > 0) { var wc = upfront * (Math.pow(1 + rm, wait) - 1); cf[0] += wc; b.waiting += wc; }

      // ---- monthly running costs ----
      var drivesTrips = !isEV(o); // EVs rent a car for long trips; everything else drives them
      for (var mm = 1; mm <= M; mm++) {
        var f = infl(mm - 1);
        var km = kmMonth + (drivesTrips ? tripKmMonth : 0);
        var en = energyCost(o, km, g) * f;
        var ins = num(o.insurancePct, 2.5) / 100 * valueAt(price, depr, (mm - 1) / 12) / 12;
        var tax = num(o.tokenTax) / 12;
        var mnt = num(o.maintenance) / 12 * f;
        var dp = (num(g.driverMonthly) + num(g.parkingMonthly)) * f;
        var ltc = drivesTrips ? 0 : trips * num(g.longTripRental) / 12 * f;
        var pay = (emi > 0 && mm <= n) ? emi : 0;
        cf[mm] += en + ins + tax + mnt + dp + ltc + pay;
        if (mm === 1) travel1 = en + ltc;
        b.energy += en; b.insurance += ins; b.tax += tax; b.maintenance += mnt; b.driverParking += dp; b.longTrips += ltc;
      }
      if (emi > 0) b.financing += emi * Math.min(n, M) + balanceAfter(loan, rate, emi, Math.min(n, M)) - loan;

      // Battery replacement (hybrid pack, EV pack): due in year X of ownership.
      var by = num(o.batteryYear);
      if (by > 0 && by <= g.years && num(o.batteryCost) > 0) {
        var bm = Math.min(M, Math.max(1, Math.round(by * 12)));
        var bc = num(o.batteryCost) * infl(bm - 1);
        cf[bm] += bc; b.battery += bc;
      }

      // ---- end: sell the car, settle any loan still running ----
      var resale = valueAt(price, depr, g.years);
      runFlows = cf.slice();
      var owed = (emi > 0 && n > M) ? balanceAfter(loan, rate, emi, M) : 0;
      cf[M] += owed - resale;
      b.depreciation = price - resale;
      b.resale = resale;
    }

    // ---- roll everything forward to the horizon ----
    var fv = 0, nominal = 0;
    for (var k = 0; k <= M; k++) { fv += cf[k] * Math.pow(1 + rm, M - k); nominal += cf[k]; }
    var annuity = rm === 0 ? M : (Math.pow(1 + rm, M) - 1) / rm;
    var monthly = fv / annuity;
    b.opportunity = fv - nominal;

    // Net cost to date if you stopped at month t: everything paid so far (grown at the
    // investment rate), minus what selling the car would bring after settling the loan.
    function owedAt(t) { return (emi > 0 && t < n) ? balanceAfter(loan, rate, emi, t) : 0; }
    var curve = [], acc = 0;
    var endAdj = ride ? 0 : cf[M] - (cfRunningAt(M));
    for (var t = 0; t <= M; t++) {
      var flow = (t === M) ? cf[t] - endAdj : cf[t];
      acc = acc * (1 + rm) + flow;
      var exit = ride ? 0 : valueAt(price, depr, t / 12) - owedAt(t);
      curve.push(acc - exit);
    }
    function cfRunningAt(t) { return runFlows[t]; }

    return {
      id: opt.id, name: opt.name, type: opt.type,
      monthly: monthly,
      perKm: monthly / Math.max(1, kmMonth + tripKmMonth),
      fv: fv, nominal: nominal, upfront: cf[0], emi: emi, loan: loan,
      resale: b.resale || 0, travelFirstMonth: travel1, breakdown: b, curve: curve, warnings: warnings, cashflows: cf
    };
  }

  function compare(options, g) { return options.map(function (o) { return simulate(o, g); }); }

  /** True monthly cost of each option across a range of daily km, for break-even charts. */
  function sweepKm(options, g, from, to, step) {
    var xs = [], series = options.map(function (o) { return { id: o.id, name: o.name, ys: [] }; });
    for (var km = from; km <= to; km += step) {
      xs.push(km);
      var gg = Object.assign({}, g, { dailyKm: km });
      options.forEach(function (o, i) { series[i].ys.push(simulate(o, gg).monthly); });
    }
    return { xs: xs, series: series };
  }

  /** Daily km where option b becomes cheaper than option a (null if never in range). */
  function crossover(a, b, g, from, to) {
    from = from || 1; to = to || 300;
    function diff(km) { var gg = Object.assign({}, g, { dailyKm: km }); return simulate(a, gg).monthly - simulate(b, gg).monthly; }
    var prev = diff(from);
    for (var km = from + 1; km <= to; km++) {
      var d = diff(km);
      if ((prev <= 0 && d > 0) || (prev >= 0 && d < 0)) return km;
      prev = d;
    }
    return null;
  }

  return { DEFAULT_GLOBALS: DEFAULT_GLOBALS, SBP: SBP, simulate: simulate, compare: compare,
           sweepKm: sweepKm, crossover: crossover, emiFor: emiFor, balanceAfter: balanceAfter,
           valueAt: valueAt, monthlyRate: monthlyRate, energyCost: energyCost };
});
