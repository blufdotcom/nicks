'use strict';

const DATA = 'data/';
const N = 4;
const OVERSCAN = 4;
const DEBOUNCE = 120;

const $ = (id) => document.getElementById(id);
const ui = {
  total: $('total'), q: $('q'), clear: $('clear'),
  indexView: $('indexView'), letters: $('letters').tBodies[0],
  gridView: $('gridView'), back: $('back'), title: $('gridTitle'),
  count: $('gridCount'), status: $('gridStatus'), empty: $('empty'),
  viewport: $('viewport'), canvas: $('canvas'), rows: $('rows')
};

const nf = new Intl.NumberFormat('es-AR');
const escRe = /[.*+?^${}()|[\]\\]/g;

let idx = null;
const cache = new Map();
let items = null;
let run = 0;
let timer = 0;

function loadSource(file) {
  let p = cache.get(file);
  if (!p) {
    p = fetch(DATA + file)
      .then((r) => {
        if (!r.ok) throw new Error(file + ' -> HTTP ' + r.status);
        return r.json();
      });
    cache.set(file, p);
  }
  return p;
}

const total = () => (Array.isArray(items) ? items.length : items.length / N);
const wordAt = (i) => (Array.isArray(items) ? items[i] : items.substr(i * N, N));
const countLabel = (n) => nf.format(n) + (n === 1 ? ' palabra' : ' palabras');

function compile(query) {
  const raw = query.trim().toLowerCase();
  if (!raw) return { raw, empty: true };

  for (const ch of raw) {
    if (!/[a-z0-9_.*]/.test(ch)) {
      return { raw, error: 'El caracter «' + ch + '» no se puede buscar.' };
    }
  }
  if (raw.length > N) return { raw, error: 'Maximo 4 caracteres.' };

  let src = '';
  for (const ch of raw) {
    if (ch === '.') src += '.';
    else if (ch === '*') src += '.*';
    else src += ch.replace(escRe, '\\$&');
  }

  const wild = /[.*]/.test(raw);
  let first = null;
  if (!wild) {
    const k = N - raw.length;
    src = '.{0,' + k + '}' + src + '.{0,' + k + '}';
    if (k === 0) first = raw[0];
  } else if (!raw.includes('*')) {
    if (src.length > N) return { raw, error: 'Maximo 4 caracteres.' };
    src += '.'.repeat(N - src.length);
    if (raw[0] !== '.' && raw[0] !== '*') first = raw[0];
  }

  let lit = '';
  let run_ = '';
  for (const ch of raw) {
    if (ch === '.' || ch === '*') run_ = '';
    else if ((run_ += ch).length > lit.length) lit = run_;
  }

  return { raw, re: new RegExp('^' + src + '$'), first, lit, sub: !wild && raw.length < N };
}

function filterWords(text, re, lit, sub) {
  const out = [];
  const hit = sub ? (w) => w.indexOf(lit) !== -1 : (w) => re.test(w);

  if (!lit) {
    for (let i = 0; i < text.length; i += N) {
      const w = text.substr(i, N);
      if (hit(w)) out.push(w);
    }
    return out;
  }

  let p = text.indexOf(lit);
  let last = -1;
  while (p !== -1) {
    const start = p - (p % N);
    if (start !== last) {
      last = start;
      const w = text.substr(start, N);
      if (hit(w)) out.push(w);
    }
    p = text.indexOf(lit, p + 1);
  }
  return out;
}

let probe = null;
function cellSize() {
  if (!probe || !probe.isConnected) {
    probe = document.createElement('div');
    probe.className = 'cell';
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden';
  }
  ui.rows.appendChild(probe);
  const r = probe.getBoundingClientRect();
  probe.remove();
  return { w: r.width, h: r.height };
}

let ticking = false;
function paintRows() {
  const { w, h } = cellSize();
  const n = total();
  const cols = Math.max(1, Math.floor(ui.viewport.clientWidth / w));
  const rows = Math.ceil(n / cols);
  ui.canvas.style.height = rows * h + 'px';

  const top = ui.viewport.scrollTop;
  let first = Math.max(0, Math.floor(top / h) - OVERSCAN);
  const last = Math.min(rows - 1, Math.floor((top + ui.viewport.clientHeight) / h) + OVERSCAN);
  if (first > last) first = 0;

  const frag = document.createDocumentFragment();
  for (let r = first; r <= last; r++) {
    const row = document.createElement('div');
    row.className = 'row';
    row.style.top = r * h + 'px';
    row.style.width = cols * w + 'px';
    const end = Math.min(n, r * cols + cols);
    for (let i = r * cols; i < end; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.textContent = wordAt(i);
      row.appendChild(cell);
    }
    frag.appendChild(row);
  }
  ui.rows.replaceChildren(frag);
}

ui.viewport.addEventListener('scroll', () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => { ticking = false; paintRows(); });
}, { passive: true });

new ResizeObserver(paintRows).observe(ui.viewport);

function showIndex() {
  run++;
  items = null;
  ui.gridView.hidden = true;
  ui.indexView.hidden = false;
  ui.viewport.scrollTop = 0;
}

function showGrid({ title, list, note, reset, loading }) {
  items = list;
  ui.indexView.hidden = true;
  ui.gridView.hidden = false;
  ui.title.textContent = title;
  ui.count.textContent = countLabel(total());
  ui.status.textContent = note || '';
  ui.viewport.hidden = total() === 0 && !loading;

  const showNote = !loading && total() === 0 && note;
  ui.empty.hidden = !showNote;
  if (showNote) ui.empty.innerHTML = note;

  if (reset) ui.viewport.scrollTop = 0;
  paintRows();
}

async function show({ title, source, re, lit, sub, onEmpty, reset }) {
  const my = ++run;
  showGrid({ title, list: [], reset: reset, loading: true, note: 'cargando…' });

  let text;
  try {
    text = await loadSource(source);
  } catch (err) {
    if (my !== run) return;
    showGrid({ title, list: [], note: 'No se pudo cargar data/: ' + escapeHtml(err.message) });
    return;
  }
  if (my !== run) return;

  if (re === null) { showGrid({ title, list: text }); return; }

  const hits = filterWords(text, re, lit, sub);
  if (hits.length === 0) showGrid({ title, list: [], note: onEmpty });
  else showGrid({ title, list: hits });
}

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function search() {
  if (!idx) return;
  const spec = compile(ui.q.value);
  ui.clear.hidden = ui.q.value === '';

  if (spec.empty) { showIndex(); return; }
  if (spec.error) {
    showGrid({ title: spec.raw, list: [], note: escapeHtml(spec.error) + '<br>Solo se admiten letras, numeros, <code>_</code>, <code>.</code> y <code>*</code>.' });
    return;
  }
  if (spec.first && !idx.letters[spec.first]) {
    showGrid({ title: spec.raw, list: [], note: 'Ninguna palabra empieza por «' + escapeHtml(spec.first) + '».' });
    return;
  }

  show({
    source: spec.first ? spec.first + '.json' : 'all.json',
    re: spec.re,
    lit: spec.lit,
    sub: spec.sub,
    title: spec.raw,
    reset: true,
    onEmpty: 'Sin resultados para <b>' + escapeHtml(spec.raw) + '</b>.<br>Proba con menos caracteres o mas puntos.'
  });
}

ui.q.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(search, DEBOUNCE);
});

ui.q.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { ui.q.value = ''; search(); }
});

ui.clear.addEventListener('click', () => {
  ui.q.value = '';
  ui.q.focus();
  search();
});

ui.back.addEventListener('click', () => {
  ui.q.value = '';
  showIndex();
});

function openLetter(ch) {
  const title = ch === '_' ? '_…' : ch.toUpperCase() + '…';
  if (!idx.letters[ch]) {
    showGrid({ title, list: [], note: 'Ninguna palabra empieza por «' + escapeHtml(ch) + '».' });
    return;
  }
  show({ source: ch + '.json', re: null, title, onEmpty: 'Ninguna palabra empieza por «' + escapeHtml(ch) + '».' });
}

const PER_ROW = 8;

function buildIndex() {
  const frag = document.createDocumentFragment();
  let tr = null;

  [...idx.alphabet].forEach((ch, i) => {
    if (i % PER_ROW === 0) {
      tr = document.createElement('tr');
      frag.appendChild(tr);
    }
    const n = idx.letters[ch];
    const td = document.createElement('td');
    const btn = document.createElement('button');
    btn.type = 'button';
    if (n === 0) btn.className = 'zero';
    const label = document.createElement('span');
    label.className = ch === '_' ? 'ch underscore' : 'ch';
    label.textContent = ch;
    const num = document.createElement('span');
    num.className = 'n';
    num.textContent = nf.format(n);
    btn.append(label, num);
    btn.addEventListener('click', () => openLetter(ch));
    td.appendChild(btn);
    tr.appendChild(td);
  });

  ui.letters.replaceChildren(frag);
}

fetch(DATA + 'index.json')
  .then((r) => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  })
  .then((data) => {
    idx = data;
    ui.total.textContent = countLabel(data.total) + ' de ' + data.length + ' caracteres';
    buildIndex();
    ui.q.focus();
    if (ui.q.value) search();
  })
  .catch((err) => {
    ui.total.textContent = 'sin datos';
    ui.indexView.innerHTML =
      '<p class="empty">No se pudo leer <code>data/index.json</code> (' + escapeHtml(err.message) + ').<br>' +
      'La pagina necesita un servidor local:<br><br>' +
      '<code>python3 serve.py</code><br><br>y abrir ' +
      '<code>http://localhost:8000</code></p>';
  });
