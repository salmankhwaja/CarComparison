/* Tiny dependency-free SVG charts: stacked horizontal bars and multi-line charts. */
(function (root) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, cls, anchor) {
    var t = el('text', { x: x, y: y, class: cls || 'ch-label', 'text-anchor': anchor || 'start' }, parent);
    t.textContent = s; return t;
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
    var n = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
    return n * p;
  }
  function ticks(min, max, count) {
    var step = niceMax((max - min) / count), out = [];
    for (var v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(v);
    return out;
  }

  /** rows: [{label, segments:[{key, value}]}], cats: [{key, label, color}] */
  function stackedBars(container, rows, cats, fmt) {
    container.innerHTML = '';
    var W = 760, labelW = 190, rowH = 38, gap = 14, top = 8, H = top + rows.length * (rowH + gap) + 30;
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img' }, container);
    var max = niceMax(Math.max.apply(null, rows.map(function (r) {
      return r.segments.reduce(function (s, x) { return s + Math.max(0, x.value); }, 0);
    }).concat([1])));
    var plotW = W - labelW - 70;
    ticks(0, max, 4).forEach(function (v) {
      var x = labelW + v / max * plotW;
      el('line', { x1: x, x2: x, y1: top - 4, y2: H - 26, class: 'ch-grid' }, svg);
      txt(svg, x, H - 8, fmt(v), 'ch-axis', 'middle');
    });
    rows.forEach(function (r, i) {
      var y = top + i * (rowH + gap), x = labelW, total = 0;
      var lab = r.label.length > 24 ? r.label.slice(0, 23) + '…' : r.label;
      el('title', {}, txt(svg, labelW - 12, y + rowH / 2 + 5, lab, 'ch-rowlabel', 'end')).textContent = r.label;
      r.segments.forEach(function (s) {
        if (s.value <= 0) return;
        var c = cats.filter(function (k) { return k.key === s.key; })[0];
        var w = s.value / max * plotW;
        var rect = el('rect', { x: x, y: y, width: Math.max(0, w - 1.5), height: rowH, rx: 3, fill: c.color, class: 'ch-seg' }, svg);
        el('title', {}, rect).textContent = r.label + ' · ' + c.label + ': ' + fmt(s.value) + ' a month';
        x += w; total += s.value;
      });
      txt(svg, x + 8, y + rowH / 2 + 5, fmt(total), 'ch-total');
    });
    return svg;
  }

  /** series: [{name, color, ys:[]}], xs: [], opts: {xLabel, marker, fmtY, fmtX, dash} */
  function lines(container, xs, series, opts) {
    container.innerHTML = '';
    opts = opts || {};
    var W = 760, H = 340, L = 74, R = 16, T = 14, B = 44;
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img' }, container);
    var all = [];
    series.forEach(function (s) { all = all.concat(s.ys); });
    var minY = Math.min(0, Math.min.apply(null, all)), maxY = niceMax(Math.max.apply(null, all.concat([1])));
    if (minY < 0) minY = -niceMax(-minY);
    var x0 = xs[0], x1 = xs[xs.length - 1];
    function sx(x) { return L + (x - x0) / (x1 - x0 || 1) * (W - L - R); }
    function sy(y) { return T + (maxY - y) / (maxY - minY || 1) * (H - T - B); }
    ticks(minY, maxY, 5).forEach(function (v) {
      el('line', { x1: L, x2: W - R, y1: sy(v), y2: sy(v), class: v === 0 ? 'ch-zero' : 'ch-grid' }, svg);
      txt(svg, L - 8, sy(v) + 4, opts.fmtY(v), 'ch-axis', 'end');
    });
    ticks(x0, x1, 6).forEach(function (v) {
      txt(svg, sx(v), H - B + 18, opts.fmtX ? opts.fmtX(v) : String(v), 'ch-axis', 'middle');
    });
    if (opts.xLabel) txt(svg, (L + W - R) / 2, H - 4, opts.xLabel, 'ch-axis ch-xlabel', 'middle');
    if (opts.marker != null && opts.marker >= x0 && opts.marker <= x1) {
      var mx = sx(opts.marker);
      el('line', { x1: mx, x2: mx, y1: T, y2: H - B, class: 'ch-marker' }, svg);
      txt(svg, mx + 6, T + 12, opts.markerLabel || 'you', 'ch-markerlabel');
    }
    series.forEach(function (s) {
      var d = s.ys.map(function (y, i) { return (i ? 'L' : 'M') + sx(xs[i]).toFixed(1) + ' ' + sy(y).toFixed(1); }).join(' ');
      el('path', { d: d, fill: 'none', stroke: s.color, 'stroke-width': 2.5, 'stroke-linejoin': 'round',
                   'stroke-dasharray': s.dash ? '6 5' : undefined, class: 'ch-line' }, svg);
    });
    // hover readout
    var guide = el('line', { y1: T, y2: H - B, class: 'ch-guide', visibility: 'hidden' }, svg);
    var tip = document.createElement('div'); tip.className = 'ch-tip'; container.appendChild(tip);
    var hit = el('rect', { x: L, y: T, width: W - L - R, height: H - T - B, fill: 'transparent' }, svg);
    function move(ev) {
      var pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
      var p = pt.matrixTransform(svg.getScreenCTM().inverse());
      var i = Math.round((p.x - L) / (W - L - R) * (xs.length - 1));
      i = Math.max(0, Math.min(xs.length - 1, i));
      var gx = sx(xs[i]);
      guide.setAttribute('x1', gx); guide.setAttribute('x2', gx); guide.setAttribute('visibility', 'visible');
      var rows = series.map(function (s) { return { s: s, v: s.ys[i] }; }).sort(function (a, b) { return a.v - b.v; });
      tip.innerHTML = '<b>' + (opts.fmtX ? opts.fmtX(xs[i]) : xs[i]) + (opts.tipX || '') + '</b>' +
        rows.map(function (r) { return '<div><i style="background:' + r.s.color + '"></i>' + r.s.name + '<span>' + opts.fmtY(r.v) + '</span></div>'; }).join('');
      tip.style.display = 'block';
      var rect = container.getBoundingClientRect();
      var left = (gx / W) * rect.width;
      tip.style.left = Math.min(rect.width - tip.offsetWidth - 4, Math.max(4, left + 12)) + 'px';
    }
    hit.addEventListener('mousemove', move);
    hit.addEventListener('touchstart', function (e) { move(e.touches[0]); }, { passive: true });
    hit.addEventListener('mouseleave', function () { tip.style.display = 'none'; guide.setAttribute('visibility', 'hidden'); });
    return svg;
  }

  root.MiniCharts = { stackedBars: stackedBars, lines: lines };
})(this);
