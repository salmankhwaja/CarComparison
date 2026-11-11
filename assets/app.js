/* UI for the car decision calculator. State lives in one object, saved to localStorage
   and shareable through the URL hash. */
(function () {
  'use strict';
  var C = window.CarCalc, Charts = window.MiniCharts;
  var MAX_OPTIONS = 5, STORE_KEY = 'carcomparison.v1';
  var PRESETS = { cars: [], rides: [], defaults: {} };
  var state;

  // ---------- formatting ----------
  function fmtRs(n) {
    var a = Math.abs(n), s = n < 0 ? '−' : '';
    if (a >= 1e7) return s + 'Rs ' + (a / 1e7).toFixed(a >= 1e8 ? 1 : 2) + ' Cr';
    if (a >= 1e5) return s + 'Rs ' + (a / 1e5).toFixed(a >= 1e6 ? 1 : 2) + ' L';
    return s + 'Rs ' + Math.round(a).toLocaleString('en-PK');
  }
  function fmtFull(n) { return (n < 0 ? '−' : '') + 'Rs ' + Math.round(Math.abs(n)).toLocaleString('en-PK'); }
  function fmtAxis(n) {
    var a = Math.abs(n), s = n < 0 ? '−' : '';
    function p3(x) { return String(parseFloat(x.toPrecision(3))); }
    if (a >= 1e7) return s + p3(a / 1e7) + ' Cr';
    if (a >= 1e5) return s + p3(a / 1e5) + ' L';
    if (a >= 1e3) return s + p3(a / 1e3) + 'k';
    return s + a;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(s, r) { return (r || document).querySelector(s); }

  var TYPE_LABEL = { petrol: 'Petrol', hybrid: 'Hybrid', phev: 'Plug-in hybrid', ev: 'Electric', ride: 'Ride-hailing', keep: 'Keep current' };
  var COLORS = ['#2f5fb3', '#d1730f', '#1f8a5b', '#b3346c', '#6b5bb8', '#5b6470'];

  // ---------- defaults ----------
  function defaultRate() { return Math.round(((PRESETS.defaults.kibor1y || 13) + 3.5) * 10) / 10; }
  function fromPreset(id) {
    var p = PRESETS.cars.concat(PRESETS.rides).filter(function (x) { return x.id === id; })[0];
    if (!p) return null;
    var o = Object.assign({ batteryCost: 0, batteryYear: 0, chargerCost: 0, premium: 0, waitMonths: 0, imported: false,
      payment: 'cash', downPct: 30, ratePct: defaultRate(), tenureYears: 3, processingFee: 15000 }, JSON.parse(JSON.stringify(p)));
    o.preset = p.id; o.uid = Math.random().toString(36).slice(2, 8);
    return o;
  }
  function customOption(type) {
    var base = { petrol: 'corolla-16-x-cvt', hybrid: 'corolla-cross-hev', phev: 'shark6', ev: 'atto3', ride: 'ride-car' }[type];
    var o = fromPreset(base); o.preset = ''; o.name = 'My ' + TYPE_LABEL[type].toLowerCase() + ' option';
    return o;
  }
  function defaultState() {
    var d = PRESETS.defaults || {};
    return {
      g: Object.assign({}, C.DEFAULT_GLOBALS, { petrol: d.petrol || 346, elecTariff: d.elecTariff || 60, dailyKm: 50 }),
      current: { name: 'My current car', fuel: 'petrol', price: 2200000, kmpl: 14, deprPct: 5, maintenance: 120000,
                 insurancePct: 1.5, tokenTax: 2500, batteryCost: 0, batteryYear: 0 },
      options: ['corolla-16-x-cvt', 'corolla-cross-hev', 'atto3', 'ride-car'].map(fromPreset).filter(Boolean)
    };
  }

  // ---------- persistence ----------
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage blocked */ }
  }
  function load() {
    if (location.hash.length > 3) {
      try { return JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(1))))); } catch (e) { /* bad link */ }
    }
    try { var s = localStorage.getItem(STORE_KEY); if (s) return JSON.parse(s); } catch (e) { /* storage blocked */ }
    return null;
  }
  function shareLink() {
    var h = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
    return location.origin + location.pathname + '#' + h;
  }
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('on'); }, 2200); }

  // ---------- field specs ----------
  // types: which option types show the field. 'adv' fields sit under "More".
  var CAR_FIELDS = [
    { k: 'price', label: 'Price', unit: 'Rs', step: 10000, types: 'petrol hybrid phev ev', hint: 'price' },
    { k: 'kmpl', label: 'Km per litre', unit: 'km/l', step: 0.5, types: 'petrol hybrid phev', note: 'Your real everyday figure, not the brochure.' },
    { k: 'kmPerKwh', label: 'Km per unit', unit: 'km/kWh', step: 0.1, types: 'ev phev', note: 'Karachi with AC on: about 6 to 7.' },
    { k: 'evShare', label: 'Driven on battery', unit: '%', step: 5, types: 'phev', note: 'Share of your km on charge.' },
    { k: 'deprPct', label: 'Loses value', unit: '% a year', step: 0.5, types: 'petrol hybrid phev ev', hint: 'resale' },
    { k: 'maintenance', label: 'Upkeep', unit: 'Rs a year', step: 5000, types: 'petrol hybrid phev ev', note: 'Service, tyres, repairs.' },
    { k: 'insurancePct', label: 'Insurance / takaful', unit: '% of value', step: 0.1, types: 'petrol hybrid phev ev' },
    { k: 'tokenTax', label: 'Token tax', unit: 'Rs a year', step: 500, types: 'petrol hybrid phev ev' },
    { k: 'wht', label: 'Withholding tax (filer)', unit: 'Rs', step: 1000, types: 'petrol hybrid phev ev', adv: true },
    { k: 'chargerCost', label: 'Home charger install', unit: 'Rs', step: 10000, types: 'ev phev', adv: true },
    { k: 'batteryCost', label: 'Battery replacement', unit: 'Rs', step: 10000, types: 'hybrid phev ev', adv: true },
    { k: 'batteryYear', label: 'Battery due in year', unit: 'yr', step: 1, types: 'hybrid phev ev', adv: true, note: '0 = not within the period.' },
    { k: 'premium', label: 'Own money / premium', unit: 'Rs', step: 10000, types: 'petrol hybrid phev ev', adv: true },
    { k: 'waitMonths', label: 'Pay this long before delivery', unit: 'months', step: 1, types: 'petrol hybrid phev ev', adv: true },
    { k: 'cc', label: 'Engine', unit: 'cc', step: 1, types: 'petrol hybrid phev', adv: true, note: 'Sets the SBP loan-tenure limit.' }
  ];
  var RIDE_FIELDS = [
    { k: 'perKm', label: 'Fare per km', unit: 'Rs', step: 1 },
    { k: 'perTrip', label: 'Base fare per trip', unit: 'Rs', step: 10 },
    { k: 'tripsPerDay', label: 'Trips a day', unit: 'trips', step: 1 },
    { k: 'surgePct', label: 'Surge & waiting', unit: '%', step: 5, note: 'Peak pricing, wait charges, tips.' }
  ];
  var EMI_FIELDS = [
    { k: 'downPct', label: 'Down payment', unit: '%', step: 5 },
    { k: 'ratePct', label: 'Markup / rental rate', unit: '% a year', step: 0.1, note: 'KIBOR + bank spread. Ijarah: the quoted rental rate.' },
    { k: 'tenureYears', label: 'Tenure', unit: 'years', step: 1 },
    { k: 'processingFee', label: 'Processing fee', unit: 'Rs', step: 1000 }
  ];

  function field(spec, value, scope) {
    return '<label class="field"><span class="flabel">' + esc(spec.label) + '</span>' +
      '<span class="finput"><input type="number" inputmode="decimal" step="' + spec.step + '" data-k="' + spec.k + '" data-scope="' + scope + '" value="' + esc(value) + '">' +
      '<span class="unit">' + esc(spec.unit) + '</span></span>' +
      (spec.hint ? '<span class="hint" data-hint="' + spec.hint + '"></span>' : '') +
      (spec.note ? '<span class="note">' + esc(spec.note) + '</span>' : '') + '</label>';
  }

  // ---------- rendering: inputs ----------
  function presetSelect(o) {
    var groups = [['petrol', 'Petrol'], ['hybrid', 'Hybrid'], ['phev', 'Plug-in hybrid'], ['ev', 'Electric']];
    var h = '<select class="preset" aria-label="Preset"><option value="">Custom…</option>';
    groups.forEach(function (gr) {
      h += '<optgroup label="' + gr[1] + '">' + PRESETS.cars.filter(function (c) { return c.type === gr[0]; }).map(function (c) {
        return '<option value="' + c.id + '"' + (o.preset === c.id ? ' selected' : '') + '>' + esc(c.name) + ' · ' + fmtRs(c.price) + '</option>';
      }).join('') + '</optgroup>';
    });
    h += '<optgroup label="Ride-hailing">' + PRESETS.rides.map(function (c) {
      return '<option value="' + c.id + '"' + (o.preset === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('') + '</optgroup></select>';
    return h;
  }

  function optionCard(o, i) {
    var color = COLORS[(i + (state.g.mode === 'replace' ? 1 : 0)) % COLORS.length];
    var types = ['petrol', 'hybrid', 'phev', 'ev', 'ride'];
    var h = '<article class="card opt" data-uid="' + o.uid + '" style="--accent:' + color + '">' +
      '<div class="opt-top"><span class="swatch"></span><input class="opt-name" data-k="name" data-scope="opt" value="' + esc(o.name) + '" aria-label="Option name">' +
      (state.options.length > 1 ? '<button type="button" class="x" data-act="remove" aria-label="Remove option">×</button>' : '') + '</div>' +
      presetSelect(o) +
      '<div class="chips" role="radiogroup" aria-label="Type">' + types.map(function (t) {
        return '<button type="button" data-type="' + t + '" class="chip' + (o.type === t ? ' on' : '') + '">' + TYPE_LABEL[t] + '</button>';
      }).join('') + '</div>';
    if (o.type === 'ride') {
      h += '<div class="fields">' + RIDE_FIELDS.map(function (f) { return field(f, o[f.k], 'opt'); }).join('') + '</div>';
    } else {
      var main = CAR_FIELDS.filter(function (f) { return !f.adv && f.types.indexOf(o.type) >= 0; });
      var adv = CAR_FIELDS.filter(function (f) { return f.adv && f.types.indexOf(o.type) >= 0; });
      h += '<div class="fields">' + main.map(function (f) { return field(f, o[f.k], 'opt'); }).join('') + '</div>';
      h += '<div class="pay"><span class="flabel">Paying</span><div class="seg small">' +
        '<button type="button" data-pay="cash" class="' + (o.payment !== 'emi' ? 'on' : '') + '">Cash</button>' +
        '<button type="button" data-pay="emi" class="' + (o.payment === 'emi' ? 'on' : '') + '">EMI / Ijarah</button></div></div>';
      if (o.payment === 'emi') h += '<div class="fields emi">' + EMI_FIELDS.map(function (f) { return field(f, o[f.k], 'opt'); }).join('') +
        '<p class="hint" data-hint="emi"></p></div>';
      h += '<details class="more"><summary>Taxes, battery, charger, waiting</summary><div class="fields">' +
        adv.map(function (f) { return field(f, o[f.k], 'opt'); }).join('') +
        '<label class="check"><input type="checkbox" data-k="imported" data-scope="opt"' + (o.imported ? ' checked' : '') + '> Imported (CBU)</label></div></details>';
    }
    if (o.source || o.note) h += '<p class="src">' + esc([o.source, o.note].filter(Boolean).join(' · ')) + '</p>';
    return h + '</article>';
  }

  function renderOptions() {
    $('#options').innerHTML = state.options.map(optionCard).join('');
    $('#btn-add').hidden = state.options.length >= MAX_OPTIONS;
  }

  function renderCurrent() {
    var c = state.current, box = $('#current-card');
    box.hidden = state.g.mode !== 'replace';
    if (box.hidden) return;
    var specs = [
      { k: 'price', label: 'Sells for today', unit: 'Rs', step: 10000, hint: 'cur-resale' },
      { k: 'kmpl', label: 'Km per litre', unit: 'km/l', step: 0.5, note: 'Real everyday figure.' },
      { k: 'deprPct', label: 'Loses value', unit: '% a year', step: 0.5, note: 'Older cars lose less each year.' },
      { k: 'maintenance', label: 'Upkeep', unit: 'Rs a year', step: 5000 },
      { k: 'insurancePct', label: 'Insurance', unit: '% of value', step: 0.1 },
      { k: 'tokenTax', label: 'Token tax', unit: 'Rs a year', step: 500 },
      { k: 'batteryCost', label: 'Repair or battery due', unit: 'Rs', step: 10000, note: 'A big bill you expect, e.g. a hybrid battery.' },
      { k: 'batteryYear', label: 'Due in year', unit: 'yr', step: 1, note: '1 = within the next 12 months. 0 = none.' }
    ];
    box.innerHTML = '<div class="opt-top"><span class="swatch" style="--accent:' + COLORS[0] + '"></span>' +
      '<input class="opt-name" data-k="name" data-scope="cur" value="' + esc(c.name) + '" aria-label="Current car name">' +
      '<div class="seg small"><button type="button" data-fuel="petrol" class="' + (c.fuel !== 'hybrid' ? 'on' : '') + '">Petrol</button>' +
      '<button type="button" data-fuel="hybrid" class="' + (c.fuel === 'hybrid' ? 'on' : '') + '">Hybrid</button></div></div>' +
      '<p class="sub">Keeping it is option zero. Every other option assumes you sell it today.</p>' +
      '<div class="fields">' + specs.map(function (f) { return field(f, c[f.k], 'cur'); }).join('') + '</div>';
  }

  function renderGlobals() {
    var g = state.g;
    var main = [
      { k: 'petrol', label: 'Petrol', unit: 'Rs/litre', step: 0.5, note: PRESETS.defaults.petrolAsOf ? 'Official rate on ' + PRESETS.defaults.petrolAsOf + ': Rs ' + PRESETS.defaults.petrol : '' },
      { k: 'elecTariff', label: 'Electricity at home', unit: 'Rs/unit', step: 1, note: 'Your slab rate incl. taxes.' },
      { k: 'solarPct', label: 'Charging from solar', unit: '%', step: 10 },
      { k: 'longTripsPerYear', label: 'Intercity trips', unit: 'a year', step: 1, note: 'Round trips you would drive.' },
      { k: 'longTripKm', label: 'Km per trip', unit: 'km', step: 50 },
      { k: 'longTripRental', label: 'Rental car per trip', unit: 'Rs', step: 1000, note: 'Used by EV and ride-hailing.' },
      { k: 'driverMonthly', label: 'Driver salary', unit: 'Rs a month', step: 1000 },
      { k: 'parkingMonthly', label: 'Parking & tolls', unit: 'Rs a month', step: 500 }
    ];
    var hood = [
      { k: 'years', label: 'Keep it for', unit: 'years', step: 1 },
      { k: 'returnPct', label: 'Money earns, after tax', unit: '% a year', step: 0.5, note: 'What the cash would earn if invested instead.' },
      { k: 'inflationPct', label: 'Running costs rise', unit: '% a year', step: 0.5 },
      { k: 'regPct', label: 'Registration', unit: '% of price', step: 0.1 },
      { k: 'daysPerMonth', label: 'Days driven', unit: 'a month', step: 1 }
    ];
    $('#globals').innerHTML =
      '<div class="km"><label for="km-range" class="flabel">How far you drive a day</label>' +
      '<div class="km-row"><input id="km-range" type="range" min="5" max="200" step="1" value="' + g.dailyKm + '" data-k="dailyKm" data-scope="g">' +
      '<span class="finput"><input type="number" step="1" data-k="dailyKm" data-scope="g" value="' + g.dailyKm + '" aria-label="Km a day"><span class="unit">km</span></span></div>' +
      '<p class="hint" data-hint="km"></p></div>' +
      '<div class="fields">' + main.map(function (f) { return field(f, g[f.k], 'g'); }).join('') + '</div>' +
      '<label class="check"><input type="checkbox" data-k="filer" data-scope="g"' + (g.filer ? ' checked' : '') + '> I\'m a tax filer (non-filers pay about 3× withholding tax)</label>' +
      '<details class="more"><summary>Under the hood: ' + g.years + ' years · money earns ' + g.returnPct + '% · costs rise ' + g.inflationPct + '%</summary>' +
      '<div class="fields">' + hood.map(function (f) { return field(f, g[f.k], 'g'); }).join('') + '</div></details>';
  }

  function renderMode() {
    document.querySelectorAll('[data-mode]').forEach(function (b) {
      var on = b.getAttribute('data-mode') === state.g.mode;
      b.classList.toggle('on', on); b.setAttribute('aria-checked', on);
    });
  }

  function renderAll() { renderMode(); renderCurrent(); renderOptions(); renderGlobals(); update(); }

  // ---------- results ----------
  function allOptions() {
    var list = [];
    if (state.g.mode === 'replace') {
      var c = state.current;
      list.push(Object.assign({}, c, { id: 'keep', type: 'keep', name: 'Keep: ' + (c.name || 'current car'), payment: 'cash' }));
    }
    state.options.forEach(function (o) { list.push(Object.assign({}, o, { id: o.uid })); });
    return list.map(function (o, i) { o.color = COLORS[i % COLORS.length]; return o; });
  }

  var CATS = [
    { key: 'depreciation', label: 'Depreciation', color: '#2f5fb3', of: ['depreciation'] },
    { key: 'energy', label: 'Fuel / charging', color: '#d1730f', of: ['energy'] },
    { key: 'fares', label: 'Ride fares & trip rentals', color: '#c0478a', of: ['fares', 'longTrips'] },
    { key: 'financing', label: 'Financing cost', color: '#a3322b', of: ['financing'] },
    { key: 'taxins', label: 'Taxes & insurance', color: '#6b5bb8', of: ['onRoad', 'tax', 'insurance'] },
    { key: 'upkeep', label: 'Upkeep, battery, charger', color: '#1f8a5b', of: ['maintenance', 'battery', 'charger'] },
    { key: 'people', label: 'Driver & parking', color: '#8a7a4e', of: ['driverParking'] },
    { key: 'opp', label: 'Lost investment return', color: '#9aa3ad', of: ['opportunity', 'waiting'] }
  ];

  function legend(box, items) {
    box.innerHTML = items.map(function (it) { return '<span><i style="background:' + it.color + (it.dash ? ';opacity:.6' : '') + '"></i>' + esc(it.label) + '</span>'; }).join('');
  }

  function update() {
    var g = state.g, opts = allOptions();
    var res = C.compare(opts, g);
    res.forEach(function (r, i) { r.color = opts[i].color; r.opt = opts[i]; });
    var sorted = res.slice().sort(function (a, b) { return a.monthly - b.monthly; });
    var best = sorted[0], second = sorted[1];

    // live hints inside the cards
    document.querySelectorAll('#options .opt').forEach(function (card) {
      var o = state.options.filter(function (x) { return x.uid === card.getAttribute('data-uid'); })[0];
      var r = res.filter(function (x) { return x.id === o.uid; })[0];
      if (!o || !r) return;
      var h = card.querySelector('[data-hint=resale]');
      if (h) { var v = C.valueAt(o.price, o.deprPct, g.years); h.textContent = 'Worth ' + fmtRs(v) + ' after ' + g.years + ' yrs (' + Math.round(v / o.price * 100) + '%)'; }
      var hp = card.querySelector('[data-hint=price]');
      if (hp) hp.textContent = '= ' + fmtRs(o.price);
      var he = card.querySelector('[data-hint=emi]');
      if (he) he.innerHTML = 'Loan ' + fmtRs(r.loan) + ' · EMI <b>' + fmtFull(r.emi) + '</b> a month';
    });
    var hc = document.querySelector('[data-hint=cur-resale]');
    if (hc) { var cv = C.valueAt(state.current.price, state.current.deprPct, g.years); hc.textContent = 'Worth ' + fmtRs(cv) + ' after ' + g.years + ' yrs'; }
    var hk = document.querySelector('[data-hint=km]');
    if (hk) hk.textContent = '= ' + Math.round(g.dailyKm * g.daysPerMonth).toLocaleString('en-PK') + ' km a month';

    // verdict
    var v = '<p class="v-main"><span class="dot" style="background:' + best.color + '"></span><b>' + esc(best.name) + '</b> is the cheapest at <b>' + fmtFull(best.monthly) + '</b> a month';
    if (second) v += ', ' + fmtFull(second.monthly - best.monthly) + ' a month less than ' + esc(second.name) + '. Over ' + g.years + ' years the gap adds up to ' + fmtRs(second.fv - best.fv) + ', counting what the money would have earned.';
    v += '</p>';
    var notes = [];
    if (second) {
      var k = C.crossover(best.opt, second.opt, g, 1, 300);
      if (k) notes.push(k > g.dailyKm ? 'Drive more than <b>' + k + ' km a day</b> and ' + esc(second.name) + ' becomes cheaper.' : 'Below <b>' + k + ' km a day</b>, ' + esc(second.name) + ' would be cheaper.');
    }
    var rides = res.filter(function (r) { return r.type === 'ride'; }), owns = sorted.filter(function (r) { return r.type !== 'ride'; });
    if (rides.length && owns.length) {
      var rb = rides.slice().sort(function (a, b) { return a.monthly - b.monthly; })[0];
      var kk = C.crossover(rb.opt, owns[0].opt, g, 1, 300);
      var dup = second && ((rb === second && owns[0] === best) || (rb === best && owns[0] === second));
      if (dup) { /* already covered by the first note */ }
      else if (kk) notes.push(esc(rb.name) + ' beats owning ' + esc(owns[0].name) + ' up to about <b>' + kk + ' km a day</b>.');
      else if (rb.monthly < owns[0].monthly) notes.push(esc(rb.name) + ' stays cheaper than owning at any distance up to 300 km a day.');
    }
    $('#verdict').innerHTML = v + (notes.length ? '<p class="v-notes">' + notes.join(' ') + '</p>' : '');

    // KPI cards
    $('#kpis').innerHTML = res.map(function (r) {
      var rank = sorted.indexOf(r) + 1;
      return '<div class="kpi' + (r === best ? ' best' : '') + '" style="--accent:' + r.color + '">' +
        '<div class="kpi-name"><span class="swatch"></span>' + esc(r.name) + '<em>' + TYPE_LABEL[r.type] + (r.opt.payment === 'emi' && r.type !== 'ride' && r.type !== 'keep' ? ' · EMI' : '') + '</em></div>' +
        '<div class="kpi-big">' + fmtFull(r.monthly) + '<small>/month</small></div>' +
        '<dl><div><dt>Per km</dt><dd>Rs ' + r.perKm.toFixed(1) + '</dd></div>' +
        '<div><dt>Pay today</dt><dd>' + fmtRs(r.upfront) + '</dd></div>' +
        (r.emi ? '<div><dt>EMI</dt><dd>' + fmtRs(r.emi) + '</dd></div>' : '') +
        (r.type !== 'ride' ? '<div><dt>Resale</dt><dd>' + fmtRs(r.resale) + '</dd></div>' : '') +
        '</dl><span class="rank">#' + rank + '</span></div>';
    }).join('');

    // chart 1: breakdown
    var rows = res.map(function (r) {
      var scale = r.fv ? r.monthly / r.fv : 0;
      return { label: r.name, segments: CATS.map(function (c) {
        return { key: c.key, value: c.of.reduce(function (s, k) { return s + (r.breakdown[k] || 0); }, 0) * scale };
      }) };
    });
    var used = CATS.filter(function (c) { return rows.some(function (r) { return r.segments.some(function (s) { return s.key === c.key && s.value > 1; }); }); });
    Charts.stackedBars($('#chart-breakdown'), rows, CATS, fmtAxisRs);
    legend($('#legend-breakdown'), used);

    // chart 2: cost vs km
    var sweep = C.sweepKm(opts, g, 5, 150, 5);
    var ser = sweep.series.map(function (s, i) { return { name: s.name, color: opts[i].color, ys: s.ys, dash: opts[i].type === 'ride' }; });
    Charts.lines($('#chart-km'), sweep.xs, ser, { fmtY: fmtAxisRs, xLabel: 'km a day', tipX: ' km a day', marker: g.dailyKm, markerLabel: 'you: ' + g.dailyKm + ' km' });
    legend($('#legend-km'), ser.map(function (s) { return { label: s.name, color: s.color, dash: s.dash }; }));

    // chart 3: money gone over time
    var months = res[0].curve.length, xs = [];
    for (var m = 0; m < months; m++) xs.push(m / 12);
    var ser3 = res.map(function (r) { return { name: r.name, color: r.color, ys: r.curve, dash: r.type === 'ride' }; });
    Charts.lines($('#chart-time'), xs, ser3, { fmtY: fmtAxisRs, xLabel: 'years from today', fmtX: function (x) { return (Math.round(x * 10) / 10) + 'y'; }, tipX: '' });
    legend($('#legend-time'), ser3.map(function (s) { return { label: s.name, color: s.color, dash: s.dash }; }));

    // table
    function row(label, f, cls) {
      return '<tr class="' + (cls || '') + '"><th scope="row">' + label + '</th>' + res.map(function (r) { return '<td>' + f(r) + '</td>'; }).join('') + '</tr>';
    }
    function sum(r, keys) { return keys.reduce(function (s, k) { return s + (r.breakdown[k] || 0); }, 0); }
    var dash = '–';
    $('#table').innerHTML = '<thead><tr><th scope="col">Over ' + g.years + ' years</th>' + res.map(function (r) {
      return '<th scope="col"><span class="swatch" style="--accent:' + r.color + '"></span>' + esc(r.name) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      row('Pay today', function (r) { return fmtFull(r.upfront); }) +
      row('EMI a month', function (r) { return r.emi ? fmtFull(r.emi) : dash; }) +
      row('Getting around, first month', function (r) { return fmtFull(r.travelFirstMonth); }) +
      row('Resale at the end', function (r) { return r.type === 'ride' ? dash : fmtFull(r.resale); }) +
      row('Depreciation', function (r) { return r.type === 'ride' ? dash : fmtFull(r.breakdown.depreciation); }) +
      row('Fuel / charging', function (r) { return fmtFull(r.breakdown.energy); }) +
      row('Ride fares & trip rentals', function (r) { return fmtFull(sum(r, ['fares', 'longTrips'])); }) +
      row('Financing cost', function (r) { return r.breakdown.financing ? fmtFull(r.breakdown.financing) : dash; }) +
      row('Taxes, registration & insurance', function (r) { return fmtFull(sum(r, ['onRoad', 'tax', 'insurance'])); }) +
      row('Upkeep, battery, charger', function (r) { return fmtFull(sum(r, ['maintenance', 'battery', 'charger'])); }) +
      row('Driver & parking', function (r) { return fmtFull(r.breakdown.driverParking); }) +
      row('Lost investment return', function (r) { return fmtFull(sum(r, ['opportunity', 'waiting'])); }) +
      row('Total cost, end of period', function (r) { return fmtFull(r.fv); }, 'strong') +
      row('True monthly cost', function (r) { return '<b>' + fmtFull(r.monthly) + '</b>'; }, 'strong') +
      row('Cost per km', function (r) { return 'Rs ' + r.perKm.toFixed(1); }) + '</tbody>';

    // warnings
    var w = [];
    res.forEach(function (r) { r.warnings.forEach(function (x) { w.push('<li><b>' + esc(r.name) + ':</b> ' + esc(x) + '</li>'); }); });
    $('#warnings').innerHTML = w.length ? '<h3>Check before you sign</h3><ul>' + w.join('') + '</ul>' : '';
    save();
  }

  function fmtAxisRs(v) { return 'Rs ' + fmtAxis(Math.round(v)); }

  // ---------- events ----------
  function findOpt(node) {
    var card = node.closest('.opt'); if (!card) return null;
    var uid = card.getAttribute('data-uid');
    return state.options.filter(function (o) { return o.uid === uid; })[0];
  }
  function onInput(e) {
    var t = e.target, k = t.getAttribute('data-k'), scope = t.getAttribute('data-scope');
    if (!k) return;
    var val = t.type === 'checkbox' ? t.checked : (t.type === 'number' || t.type === 'range') ? (t.value === '' ? 0 : Number(t.value)) : t.value;
    if (scope === 'g') {
      state.g[k] = val;
      if (k === 'dailyKm') document.querySelectorAll('[data-k=dailyKm]').forEach(function (x) { if (x !== t) x.value = val; });
      if (k === 'years' || k === 'returnPct' || k === 'inflationPct') {
        var s = document.querySelector('#globals details summary');
        if (s) s.textContent = 'Under the hood: ' + state.g.years + ' years · money earns ' + state.g.returnPct + '% · costs rise ' + state.g.inflationPct + '%';
      }
      if (k === 'years' && !(val >= 1)) return;
    } else if (scope === 'cur') {
      state.current[k] = val;
    } else {
      var o = findOpt(t); if (!o) return;
      o[k] = val;
    }
    update();
  }
  function onClick(e) {
    var t = e.target.closest('button'); if (!t) return;
    if (t.hasAttribute('data-mode')) { state.g.mode = t.getAttribute('data-mode'); renderAll(); return; }
    if (t.hasAttribute('data-fuel')) { state.current.fuel = t.getAttribute('data-fuel'); renderCurrent(); update(); return; }
    var o = findOpt(t);
    if (o && t.getAttribute('data-act') === 'remove') { state.options = state.options.filter(function (x) { return x !== o; }); renderOptions(); update(); return; }
    if (o && t.hasAttribute('data-pay')) { o.payment = t.getAttribute('data-pay'); renderOptions(); update(); return; }
    if (o && t.hasAttribute('data-type')) {
      var type = t.getAttribute('data-type'); if (type === o.type) return;
      var fresh = customOption(type); fresh.uid = o.uid;
      if (type !== 'ride' && o.type !== 'ride') { fresh.payment = o.payment; fresh.downPct = o.downPct; fresh.ratePct = o.ratePct; fresh.tenureYears = o.tenureYears; }
      state.options[state.options.indexOf(o)] = fresh; renderOptions(); update(); return;
    }
  }
  function onChange(e) {
    if (!e.target.classList.contains('preset')) return;
    var o = findOpt(e.target), id = e.target.value;
    if (!id) { o.preset = ''; return; }
    var fresh = fromPreset(id); fresh.uid = o.uid;
    if (fresh.type !== 'ride' && o.type !== 'ride') { fresh.payment = o.payment; fresh.downPct = o.downPct; fresh.ratePct = o.ratePct; fresh.tenureYears = o.tenureYears; }
    state.options[state.options.indexOf(o)] = fresh; renderOptions(); update();
  }

  function bind() {
    document.addEventListener('input', onInput);
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    $('#btn-add').addEventListener('click', function () {
      if (state.options.length >= MAX_OPTIONS) return;
      var used = state.options.map(function (o) { return o.preset; });
      var pick = PRESETS.cars.filter(function (c) { return used.indexOf(c.id) < 0; })[0];
      state.options.push(pick ? fromPreset(pick.id) : customOption('petrol')); renderOptions(); update();
    });
    $('#btn-reset').addEventListener('click', function () {
      history.replaceState(null, '', location.pathname); state = defaultState(); renderAll(); toast('Back to the starting example');
    });
    $('#btn-share').addEventListener('click', function () {
      var link = shareLink();
      history.replaceState(null, '', link);
      if (navigator.clipboard) navigator.clipboard.writeText(link).then(function () { toast('Link copied'); }, function () { toast('Link is in the address bar'); });
      else toast('Link is in the address bar');
    });
  }

  function start(data) {
    PRESETS = data || PRESETS;
    var loaded = load();
    state = loaded && loaded.g && loaded.options ? loaded : defaultState();
    state.g = Object.assign({}, C.DEFAULT_GLOBALS, state.g);
    bind(); renderAll();
  }

  fetch('data/presets.json').then(function (r) { return r.json(); }).then(start).catch(function () {
    document.querySelector('main').insertAdjacentHTML('afterbegin', '<p class="warn-load">Could not load car presets (data/presets.json). If you opened this file directly, serve the folder instead, for example: <code>python3 -m http.server</code></p>');
    start(null);
  });
})();
