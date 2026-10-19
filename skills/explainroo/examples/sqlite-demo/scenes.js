// Feed revision: show only the current command/result in 40px type.
// SQL is unchanged; the STRICT statement and error wrap at spaces.
// Earlier terminal history is deliberately omitted.
// An unofficial SQLite demo, drawn with the UI kit (s.ui) on a dark teal
// stage. No logo: the name is plain text. Every line in the terminal comes
// from a real interactive run of the official sqlite3 3.53.4 for Linux in a
// 76 column terminal on 2026-10-03: the banner, the continuation prompts
// ("(x1...>" inside the parentheses), the STRICT error, the box tables and
// the backup. The CLI prints no colors, so the terminal text has one color;
// the bands, rings and cards are part of the video. Only the "$ " shell
// prompt is not printed by SQLite. The bakery, its orders, the names and the
// pickup times are example data written for this video.

const K = {
  win: '#081a22',
  bar: '#06141b',
  line: '#1b3a48',
  text: '#dce9ef',
  dim: '#86a1ae',
  faint: '#2a4756',
  blue: '#56b9ea',
  red: '#ff7d70',
  green: '#5ed68f',
  white: '#eef6fa',
  ink: '#0a2531',
  soft: '#4d6875',
  acc: '#0f6f9e',
  err: '#c23b2e',
  ok: '#16794a',
};
const MONO = 'JetBrains Mono';
const SIZE = 40;
const ROW = 48;
const TRACK = 0.01;

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, p) => a + (b - a) * p;

function rr(s, x, y, w, h, r, fill, stroke, lw = 1.5) {
  const c = s.ctx;
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = lw;
    c.stroke();
  }
}

// Draws fn with an extra alpha, moved down by dy.
function alpha(s, a, fn, dy = 0) {
  if (a <= 0.002) return;
  s.ctx.save();
  s.ctx.globalAlpha *= clamp(a);
  s.ctx.translate(0, dy);
  fn();
  s.ctx.restore();
}

let CW = 0;
const cw = (u) => CW || (CW = u.measure('MMMMMMMMMM', SIZE, 400, MONO, false, TRACK) / 10);

// The stage: dark teal with a soft blue light from the top, and the headline.
function stage(s, title, o = {}) {
  const u = s.ui;
  u.backdrop();
  const c = s.ctx;
  c.save();
  c.setTransform(s.engine.scale, 0, 0, s.engine.scale, 0, 0);
  const glow = c.createRadialGradient(960, -300, 100, 960, -300, 1450);
  glow.addColorStop(0, 'rgba(86, 185, 234, 0.18)');
  glow.addColorStop(1, 'rgba(86, 185, 234, 0)');
  c.fillStyle = glow;
  c.fillRect(0, 0, 1920, 1080);
  c.restore();
  if (title) u.headline(title, s.W / 2, 150, { size: 70, at: o.at ?? 0.15, out: o.out });
  return u;
}

const ry = (gr, r) => gr.top + r * ROW + ROW / 2;
const cx = (u, gr, col) => gr.left + col * cw(u);

// Box drawing characters, drawn as lines so they join like in a terminal:
// [left, right, up, down, round]; 2 is a double line.
const BOXCH = {
  '─': [1, 1, 0, 0], '═': [2, 2, 0, 0], '│': [0, 0, 1, 1],
  '╭': [0, 1, 0, 1, 1], '╮': [1, 0, 0, 1, 1], '╰': [0, 1, 1, 0, 1], '╯': [1, 0, 1, 0, 1],
  '┬': [1, 1, 0, 1], '┴': [1, 1, 1, 0], '┼': [1, 1, 1, 1],
  '╞': [0, 2, 1, 1], '╡': [2, 0, 1, 1], '╪': [2, 2, 1, 1],
};

function boxChar(s, ch, x, y, w, color) {
  const [l, r, up, dn, round] = BOXCH[ch];
  const c = s.ctx;
  const xm = x + w / 2;
  const y0 = y - ROW / 2;
  const y1 = y + ROW / 2;
  c.save();
  c.strokeStyle = color;
  c.lineWidth = 1.8;
  c.lineCap = 'butt';
  c.beginPath();
  if (round) {
    const hx = l ? x : x + w;
    const vy = up ? y0 : y1;
    c.moveTo(hx, y);
    c.arcTo(xm, y, xm, vy, w * 0.45);
    c.lineTo(xm, vy);
  } else {
    if (up || dn) {
      c.moveTo(xm, up ? y0 : y);
      c.lineTo(xm, dn ? y1 : y);
    }
    const h = (dy, a, b) => {
      c.moveTo(a, y + dy);
      c.lineTo(b, y + dy);
    };
    if (l === 1) h(0, x, xm);
    if (r === 1) h(0, xm, x + w);
    if (l === 2) {
      h(-3, x, xm);
      h(3, x, xm);
    }
    if (r === 2) {
      h(-3, xm, x + w);
      h(3, xm, x + w);
    }
  }
  c.stroke();
  c.restore();
}

// One terminal line: text runs in the monospace font, box characters as lines.
function line(s, u, gr, t, i, color = K.text) {
  const y = ry(gr, i);
  let run = '';
  let start = 0;
  const flush = () => {
    // A little letter spacing keeps the font from joining -> and >> into one sign.
    if (run.trim()) u.text(run, cx(u, gr, start), y + 1, { size: SIZE, font: MONO, color, tracking: TRACK });
    run = '';
  };
  [...t].forEach((ch, k) => {
    if (BOXCH[ch]) {
      flush();
      boxChar(s, ch, cx(u, gr, k), y, cw(u), color);
    } else {
      if (!run) start = k;
      run += ch;
    }
  });
  flush();
}

// A white document with a folded corner.
function doc(s, u, x, y, w, h, o = {}) {
  const c = s.ctx;
  const r = 18;
  const f = o.fold ?? 38;
  const path = () => {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - f, y);
    c.lineTo(x + w, y + f);
    c.lineTo(x + w, y + h - r);
    c.arcTo(x + w, y + h, x + w - r, y + h, r);
    c.lineTo(x + r, y + h);
    c.arcTo(x, y + h, x, y + h - r, r);
    c.lineTo(x, y + r);
    c.arcTo(x, y, x + r, y, r);
    c.closePath();
  };
  c.save();
  c.shadowColor = 'rgba(0, 0, 0, 0.35)';
  c.shadowBlur = 50 * u.k;
  c.shadowOffsetY = 18 * u.k;
  path();
  c.fillStyle = '#ffffff';
  c.fill();
  c.restore();
  c.beginPath();
  c.moveTo(x + w - f, y);
  c.lineTo(x + w - f, y + f - 6);
  c.arcTo(x + w - f, y + f, x + w - f + 6, y + f, 6);
  c.lineTo(x + w, y + f);
  c.closePath();
  c.fillStyle = '#cfe2eb';
  c.fill();
}

const P = 'sqlite> ';
const C = '   ...> ';
const IN = '(x1...> ';
const join = (lines) => lines.map(([p, t]) => p + t);
const flat = (rows) => rows.map((r) => (typeof r === 'string' ? r : r.t));
const BANNER = ['SQLite version 3.53.4 2026-07-24 19:02:57', 'Enter ".help" for usage hints.'];
const CREATE = [
  [P, 'CREATE TABLE orders('],
  [IN, '  id INTEGER PRIMARY KEY,'],
  [IN, '  item TEXT,'],
  [IN, '  qty INTEGER,'],
  [IN, '  info TEXT'],
  [IN, ') STRICT;'],
];
const SELECT1 = [[P, 'SELECT id, item, qty FROM orders;']];
const TABLE1 = [
  '╭────┬───────────┬─────╮',
  '│ id │   item    │ qty │',
  '╞════╪═══════════╪═════╡',
  { t: '│  1 │ Bread     │   2 │', id: 't1' },
  { t: '│  2 │ Croissant │   6 │', id: 't1' },
  { t: '│  3 │ Bagel     │   4 │', id: 't1' },
  { t: '│  4 │ Bread     │   1 │', id: 't1' },
  '╰────┴───────────┴─────╯',
];
const SELECT2 = [
  [P, "SELECT item, info ->> 'name' AS name FROM orders"],
  [C, "WHERE info ->> 'pickup' = '08:00';"],
];
const TABLE2 = [
  '╭───────┬──────╮',
  '│ item  │ name │',
  '╞═══════╪══════╡',
  { t: '│ Bread │ Ana  │', id: 't2' },
  { t: '│ Bagel │ Cleo │', id: 't2' },
  '╰───────┴──────╯',
];
const SELECT3 = [
  [P, 'SELECT id, item, qty,'],
  [C, '  sum(qty) OVER (ORDER BY id) AS running'],
  [C, 'FROM orders;'],
];
const TABLE3 = [
  '╭────┬───────────┬─────┬─────────╮',
  '│ id │   item    │ qty │ running │',
  '╞════╪═══════════╪═════╪═════════╡',
  { t: '│  1 │ Bread     │   2 │       2 │', id: 't3' },
  { t: '│  2 │ Croissant │   6 │       8 │', id: 't3' },
  { t: '│  3 │ Bagel     │   4 │      12 │', id: 't3' },
  { t: '│  4 │ Bread     │   1 │      13 │', id: 't3' },
  '╰────┴───────────┴─────┴─────────╯',
];
const TABLE4 = ['╭──────────╮', '│ count(*) │', '╞══════════╡', { t: '│        4 │', id: 't4' }, '╰──────────╯'];


// Feed-sized shots: only the current command and result, in 40px type.
// SQL and output are unchanged; long lines wrap at their existing spaces.
function focused(s, title, lines, highlight = []) {
  const u = stage(s, title);
  u.card(90, 250, 1740, 690, { r: 20, fill: K.win, border: false, lift: 0 });
  lines.forEach((text, i) => {
    const y = 302 + i * 48;
    if (highlight.includes(i)) rr(s, 116, y - 24, 1688, 48, 8, '#163b4c');
    line(s, u, { left: 130, top: 278 }, text, i, text.startsWith('Error') || text.startsWith('INTEGER column') ? K.red : K.text);
  });
  return u;
}

export default {
  hook(s) {
    const fl = s.time('#file');
    const sv = s.time('#server');
    const up = s.p(fl - 0.55, 0.65, 'inOut');
    const u = stage(s, null);
    // The name as plain text from the first frame (the cover).
    u.eyebrow('Unofficial demo', 960, lerp(330, 152, up), { align: 'center', size: 36 });
    u.text('SQLite', 960, lerp(452, 236, up), { size: lerp(170, 110, up), weight: 700, color: K.white, align: 'center', tracking: lerp(-4, -2, up) });
    u.headline('An embedded *SQL database engine*', 960, lerp(612, 352, up), { size: lerp(66, 50, up), at: s.time('#name') + 0.4 });
    // One file holds it all.
    const FX = 430;
    const FY = 430;
    const FW = 620;
    const FH = 400;
    u.pop(fl - 0.1, FX + FW / 2, FY + FH / 2, () => {
      doc(s, u, FX, FY, FW, FH);
      u.icon('database', FX + 62, FY + 66, 38, K.acc, 2.2);
      u.text('bakery.db', FX + 102, FY + 67, { size: 44, font: MONO, color: K.ink, tracking: TRACK });
      s.ctx.fillStyle = '#e1ecf1';
      s.ctx.fillRect(FX + 36, FY + 120, FW - 72, 2);
    }, { sfx: 'pop' });
    [
      ['table', 'tables', s.cue('Tables') + 0.25],
      ['list-ordered', 'indexes', s.cue('indexes')],
      ['eye', 'views', s.cue('views')],
    ].forEach(([icon, label, at], i) => {
      const yy = FY + 182 + i * 72;
      u.pop(at, FX + 170, yy, () => {
        u.icon(icon, FX + 74, yy, 32, K.acc, 2.2);
        u.text(label, FX + 116, yy + 1, { size: 44, weight: 600, color: K.ink });
      }, { sfx: 'tick' });
    });
    // No server next to it.
    const SX = 1150;
    const SY = 430;
    const SW = 340;
    const SH = 400;
    u.pop(sv - 0.1, SX + SW / 2, SY + SH / 2, () => {
      const c = s.ctx;
      c.save();
      c.setLineDash([12, 10]);
      rr(s, SX, SY, SW, SH, 22, 'rgba(255, 255, 255, 0.04)', K.dim, 2);
      c.restore();
      u.icon('server', SX + SW / 2, SY + 165, 120, '#9fb7c3', 2);
      u.text('no server process', SX + SW / 2, SY + 330, { size: 44, weight: 600, color: K.white, align: 'center' });
    }, { sfx: 'pop' });
    const strike = s.p(sv + 0.45, 0.35, 'out');
    if (strike > 0) {
      const c = s.ctx;
      c.save();
      c.strokeStyle = K.red;
      c.lineWidth = 9;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(SX + 80, SY + 255);
      c.lineTo(SX + 80 + (SW - 160) * strike, SY + 255 - 180 * strike);
      c.stroke();
      c.restore();
    }
    s.sfx('thud', sv + 0.45, { gain: 0.3 });
  },

  open(s) {
    const u = focused(s, 'Open a *database file*', [
      '$ sqlite3 bakery.db', '', ...BANNER, '', 'sqlite> ',
    ], [0]);
    if (s.t >= s.time('#new')) u.text('New file: bakery.db', 130, 830, { size: 44, color: K.blue });
  },

  strict(s) {
    const error = s.t >= s.time('#error');
    const lines = error ? [
      'sqlite> INSERT INTO orders(item, qty)',
      "   ...> VALUES ('Bread', 'a dozen');", '',
      'Error near line 7: cannot store TEXT value in',
      'INTEGER column orders.qty',
    ] : [...join(CREATE)];
    focused(s, '*STRICT* tables', lines, error ? [3, 4] : [5]);
  },

  box(s) {
    const selected = s.t >= s.time('#select');
    const lines = selected ? [
      ...join(SELECT1), '', ...flat(TABLE1),
    ] : [
      'Four example orders', '',
      'id   item        qty',
      ' 1   Bread         2',
      ' 2   Croissant     6',
      ' 3   Bagel         4',
      ' 4   Bread         1',
    ];
    focused(s, 'Results in a *box*', lines, selected && s.t >= s.time('#right') ? [5, 6, 7, 8] : []);
  },

  json(s) {
    const query = s.t >= s.time('#arrow');
    const lines = query ? [
      ...join(SELECT2), '', ...flat(TABLE2),
    ] : [
      'info TEXT', '',
      '{"name":"Ana","pickup":"08:00"}', '',
      '{"name":"Cleo","pickup":"08:00"}',
    ];
    focused(s, '*JSON* as text', lines, query ? [0, 1] : [2, 4]);
  },

  window(s) {
    focused(s, 'A *running total*', [
      ...join(SELECT3), '', ...flat(TABLE3),
    ], [1]);
  },

  backup(s) {
    const copied = s.t >= s.time('#copy');
    focused(s, 'Copy it with *.backup*', [
      'sqlite> .backup bakery-copy.db', '',
      ...(copied ? [
        'sqlite> .open bakery-copy.db',
        'sqlite> SELECT count(*) FROM orders;', '', ...flat(TABLE4),
      ] : ['bakery.db  →  bakery-copy.db']),
    ], [0]);
  },

  outro(s) {
    const also = s.time('#also');
    const point = s.time('#point');
    const made = s.time('#made');
    const end = made - 0.3;
    const u = stage(s, 'Make a video like *this one*', { out: end, at: also - 0.1 });
    const lines = [
      'Make a short video about [your topic].',
      'Use explainroo:',
      'https://github.com/vincentsch/explainroo',
      'Read AGENTS.md and follow the steps.',
    ];
    const typed = u.typed(lines.join(' '), point + 0.2, 80, { gain: 0.16 });
    u.pop(also + 0.4, 960, 560, () => {
      rr(s, 90, 300, 1740, 440, 18, K.win, K.line);
      u.text('your coding agent', 130, 352, { size: 40, weight: 600, color: K.dim });
      let used = 0;
      lines.forEach((l, i) => {
        const n = clamp(typed.length - used, 0, l.length);
        if (n > 0) u.text(l.slice(0, n), 130, 440 + i * 72, { size: 40, font: MONO, color: K.text, tracking: TRACK });
        used += l.length + 1;
      });
    }, { sfx: 'pop' });
    s.sfx('chime', made, { gain: 0.5 });
    const p = u.wipe(end, { color: K.white });
    if (p > 0) {
      u.over(() =>
        alpha(s, s.p(end + 0.35, 0.5, 'out'), () => {
          u.text('SQLite', 960, 430, { size: 120, weight: 700, color: '#05222e', align: 'center', tracking: -2 });
          u.text('Unofficial demo made with explainroo', 960, 560, { size: 40, weight: 600, color: '#05222e', align: 'center' });
          u.text('Not affiliated with SQLite', 960, 612, { size: 40, color: '#4d6875', align: 'center' });
        }),
      );
    }
  },
};
