// A product demo for Unspar, drawn with the UI kit (s.ui). The screens are
// rebuilt from the real app's wording and look; brand colors, fonts and the
// logo come from "brand" and "fonts" in video.json.

// Background and drifting cards, then the camera, then the scene's headline,
// so the headline moves with the camera like everything else.
function stage(s, title, o = {}) {
  const u = s.ui;
  u.backdrop();
  u.floaters();
  if (o.camera) s.camera(o.camera);
  if (title) u.headline(title, s.W / 2, 178, { size: 84, at: o.at ?? 0.15 });
  return u;
}

export default {
  hook(s) {
    const u = stage(s, null, { camera: [{ at: 0.2, zoom: 1.05, dur: s.dur, ease: 'linear' }] });
    // The logo starts big in the middle and moves up when the voice goes on.
    const up = s.p('#writes', 0.9, 'inOut');
    const grow = s.p(0.1, 0.9, 'outBack');
    s.ctx.save();
    s.ctx.globalAlpha = s.clamp(s.p(0.1, 0.45, 'out'));
    u.logo(960, s.lerp(540, 300, up), s.lerp(620, 380, up) * s.lerp(0.86, 1, grow));
    s.ctx.restore();
    u.headline("*Content that doesn't* read like AI.", 960, 610, { size: 116, at: s.time('#writes') + 0.35 });
    const chips = [
      { label: 'Blog posts', icon: 'newspaper', at: '#blog', x: 770, w: 210 },
      { label: 'Guides', icon: 'book-open', at: '#guides', x: 1000, w: 170 },
    ];
    for (const ch of chips) {
      u.pop(ch.at, ch.x + ch.w / 2, 735, () => {
        u.card(ch.x, 705, ch.w, 60, { r: 30, lift: 0.5 });
        u.icon(ch.icon, ch.x + 36, 735, 26, u.colors.accent, 2.2);
        u.text(ch.label, ch.x + 60, 736, { size: 23, weight: 600 });
      }, { sfx: 'pop' });
    }
  },

  brief(s) {
    const px = 410;
    const py = 270;
    const site = s.time('#site');
    const pick = s.time('#pick');
    const topic = s.time('#topic');
    const ideas = s.time('#ideas');
    const chosen = pick + 1.0;
    const u = stage(s, 'Tell it what to write about', {
      camera: [
        { at: site - 0.9, x: px + 470, y: py + 330, zoom: 1.3, dur: 0.9 },
        { at: pick - 0.65, x: px + 700, y: py + 390, zoom: 1.3, dur: 0.7 },
        { at: topic - 0.6, x: px + 560, y: py + 440, zoom: 1.24, dur: 0.7 },
        { at: ideas - 0.7, x: px + 760, y: py + 500, zoom: 1.32, dur: 0.7 },
        { at: ideas + 1.2, x: 960, y: 540, zoom: 1, dur: 1 },
      ],
    });
    let rows = [];
    u.panel(px, py, 1100, 600, { at: 0.3 }, () => {
      u.icon('sparkles', px + 66, py + 62, 24, u.colors.accent, 2);
      u.eyebrow('First article', px + 88, py + 63);
      u.text('Tell us what you have', px + 56, py + 118, { size: 38, weight: 700 });
      u.para('Share a site, a goal, or both. We will suggest a first article and queue it with the normal generation workflow.', px + 56, py + 150, 980, { size: 21, color: u.colors.muted });
      u.input(px + 56, py + 296, 560, 62, {
        label: 'Website URL',
        placeholder: 'https://example.com',
        value: u.typed('https://example.com', site + 0.15, 26),
        focus: s.t >= site ? 1 - s.p(pick, 0.2) : 0,
        caret: true,
      });
      u.input(px + 56, py + 430, 988, 62, {
        label: 'Topic or goal',
        placeholder: 'e.g. teach small SaaS teams how to write a launch plan',
        value: u.typed('home baking for beginners', topic + 0.15, 24),
        focus: s.t >= topic ? 1 - s.p(ideas, 0.2) : 0,
        caret: true,
      });
      const loading = s.t >= ideas + 0.12;
      const label = !loading ? 'Get article ideas' : s.t < ideas + 1.5 ? 'Looking at your site...' : 'Drafting first ideas...';
      const bw = loading ? 340 : 280;
      u.button(label, px + 1044 - bw, py + 516, bw, 60, { press: u.press(ideas), loading, icon: loading ? null : 'sparkles' });
      // The dropdown goes last, so its open menu covers the fields below.
      rows = u.select(px + 640, py + 296, 404, 62, {
        label: 'What do you want to create?',
        value: s.t >= chosen ? 'Website articles or blog posts' : '',
        placeholder: 'Choose one',
        open: s.t < pick ? 0 : s.t < chosen + 0.1 ? s.p(pick, 0.3) : 1 - s.p(chosen + 0.1, 0.25),
        options: ['Website articles or blog posts', 'Social media content', 'Email newsletters', 'Something else'],
        hover: s.t >= pick + 0.55 && s.t < chosen + 0.1 ? 0 : -1,
        selected: s.t >= chosen ? 0 : -1,
        size: 20,
      });
    });
    u.cursor([
      { at: '#tell', x: 1560, y: 960 },
      { at: site - 0.75, x: px + 330, y: py + 330 },
      { at: site, click: true },
      { at: pick - 0.6, x: px + 870, y: py + 330 },
      { at: pick, click: true },
      // Point past the end of the option's text, not on it.
      { at: pick + 0.35, x: px + 1016, y: (rows[0] ?? py + 405) + 6, dur: 0.5 },
      { at: chosen, click: true },
      { at: topic - 0.6, x: px + 420, y: py + 462 },
      { at: topic, click: true },
      { at: ideas - 0.7, x: px + 900, y: py + 548 },
      { at: ideas, click: true },
    ]);
  },

  ideas(s) {
    const px = 430;
    const py = 250;
    const choose = s.time('#choose');
    const u = stage(s, 'Pick one of its ideas', { at: 0.1, camera: [{ at: choose - 0.8, x: 960, y: 560, zoom: 1.08, dur: 1.2 }] });
    const ideas = [
      ['Your first sourdough loaf, step by step', 'A beginner guide with a simple timeline'],
      ['Why bread goes stale and how to slow it down', 'The science, explained in plain words'],
      ['Five easy bakes for your first weekend', 'One short recipe for each bake'],
    ];
    u.panel(px, py, 1060, 660, { at: 0.05, from: 0.98 }, () => {
      u.icon('sparkles', px + 66, py + 62, 24, u.colors.accent, 2);
      u.eyebrow('First article', px + 88, py + 63);
      u.text('Tell us what you have', px + 56, py + 116, { size: 36, weight: 700 });
      ideas.forEach(([title, sub], i) => {
        const y = py + 170 + i * 118;
        const sel = i === 0 ? s.p(choose, 0.3) : 0;
        u.panel(px + 56, y, 948, 100, { at: s.time('#list') + i * 0.18, r: 14, shadow: false, lift: 0, from: 1, rise: 24, fill: sel > 0 ? u.colors.accentTint : '#ffffff', border: sel > 0.5 ? u.colors.accent : u.colors.line, borderWidth: 1.5 + sel, sfx: i === 0 ? 'blip' : null }, () => {
          u.radio(px + 100, y + 50, sel);
          u.text(title, px + 136, y + 36, { size: 25, weight: 600 });
          u.text(sub, px + 136, y + 70, { size: 20, color: u.colors.muted });
        });
      });
      s.ctx.save();
      s.ctx.globalAlpha *= s.p(s.time('#list') + 0.7, 0.4, 'out');
      u.button('Try a different topic', px + 480, py + 560, 260, 60, { variant: 'secondary' });
      u.button('Queue first article', px + 754, py + 560, 250, 60);
      s.ctx.restore();
    });
    u.cursor([
      { at: 0.3, x: 1350, y: 900 },
      { at: choose - 0.7, x: px + 900, y: py + 226 },
      { at: choose, click: true },
    ]);
  },

  price(s) {
    const u = stage(s, 'You see the price first', { at: 0.1, camera: [{ at: 0.1, zoom: 1.04, dur: 3, ease: 'out' }] });
    const px = 560;
    const py = 250;
    const price = s.time('#price');
    const queue = s.time('#queue');
    u.panel(px, py, 800, 640, { at: price }, () => {
      u.text('Estimated credits', px + 56, py + 70, { size: 34, weight: 700 });
      u.text('Credits are reserved before generation starts.', px + 56, py + 114, { size: 21, color: u.colors.muted });
      u.text('Run tier', px + 56, py + 178, { size: 20, weight: 600 });
      // The tier comes from the job; this one is Standard.
      const on = s.p(price + 0.7, 0.35, 'out');
      [['Quick', 1], ['Standard', 5], ['Advanced', 15], ['Flagship', 40]].forEach(([name, credits], i) => {
        const x = px + 56 + i * 176;
        const sel = i === 1 ? on : 0;
        u.card(x, py + 206, 160, 104, { r: 14, shadow: false, fill: sel > 0 ? u.colors.accentTint : '#ffffff', border: sel > 0.5 ? u.colors.accent : u.colors.line, borderWidth: 1.5 + sel * 1.5 });
        u.text(name, x + 22, py + 242, { size: 22, weight: 600, color: sel > 0.5 ? u.colors.accent : u.colors.text });
        u.text(`${credits} credit${credits === 1 ? '' : 's'}`, x + 22, py + 278, { size: 19, color: u.colors.muted });
      });
      s.ctx.fillStyle = u.colors.line;
      s.ctx.fillRect(px + 56, py + 350, 688, 1.5);
      u.text('Credit charge', px + 56, py + 398, { size: 22, color: u.colors.soft });
      u.text(`${u.count(5, price + 0.8, 0.8)} credits`, px + 744, py + 398, { size: 26, weight: 700, align: 'right' });
      u.text('Available Credits', px + 56, py + 452, { size: 22, color: u.colors.soft });
      u.text('120', px + 744, py + 452, { size: 26, weight: 700, align: 'right' });
      u.button('Queue first article', px + 56, py + 530, 688, 64, { press: u.press(queue) });
    });
    u.toast('Your first article is queued.', { at: queue + 0.35, y: 930 });
    u.cursor([
      { at: price + 0.4, x: 1500, y: 900 },
      { at: queue - 0.75, x: 960, y: py + 562 },
      { at: queue, click: true },
    ], { out: queue + 1.2 });
  },

  agents(s) {
    const u = stage(s, 'Its agents do the work', { at: 0.1, camera: [{ at: 0.2, zoom: 1.05, dur: s.dur, ease: 'linear' }] });
    const agents = s.time('#agents');
    const done = s.voice.end + 0.15;
    u.panel(410, 250, 1100, 130, { at: 0.2 }, () => {
      u.card(446, 279, 72, 72, { r: 16, shadow: false, border: false, fill: u.colors.accentTint });
      u.icon('file-text', 482, 315, 34, u.colors.accent, 2);
      u.text('Your first sourdough loaf, step by step', 548, 300, { size: 27, weight: 600 });
      u.text('My First Project  ·  Standard', 548, 336, { size: 20, color: u.colors.muted });
      if (s.t < agents) u.pill('Queued for Generation', 1474, 315, 'blue', { align: 'right' });
      else if (s.t < done) u.pill('Generating', 1474, 315, 'yellow', { align: 'right', dot: true, pulse: true });
      else u.pop(done, 1404, 315, () => u.pill('Completed', 1474, 315, 'green', { align: 'right', dot: true }), { from: 0.8, sfx: 'chime' });
    });
    // Research, writing and fact check light up as the voice names them.
    const steps = [
      { title: 'Research', sub: 'Looks up the topic', icon: 'search', at: '#research' },
      { title: 'Writing', sub: 'Writes in your voice', icon: 'pen-line', at: '#write' },
      { title: 'Fact check', sub: 'Checks the facts', icon: 'shield-check', at: '#check' },
    ];
    const W = 330;
    const gap = 55;
    const x0 = 960 - (W * 3 + gap * 2) / 2;
    const y = 470;
    const fill = s.t < s.time('#write') ? 0 : s.t < s.time('#check') ? 0.5 * s.p('#write', 0.6) : 0.5 + 0.5 * s.p('#check', 0.6);
    s.ctx.fillStyle = u.colors.line;
    s.ctx.fillRect(x0 + W / 2, y + 90, W * 2 + gap * 2, 4);
    s.ctx.fillStyle = u.colors.accent;
    s.ctx.fillRect(x0 + W / 2, y + 90, (W * 2 + gap * 2) * fill, 4);
    steps.forEach((st, i) => {
      const x = x0 + i * (W + gap);
      const start = s.time(st.at);
      const end = i < 2 ? s.time(steps[i + 1].at) : done;
      const active = s.t >= start ? s.p(start, 0.35, 'out') : 0;
      const finished = s.t >= end;
      u.panel(x, y, W, 330, { at: agents + 0.1 + i * 0.12, lift: 0.7 + active * 0.5, border: active > 0.5 ? u.colors.accent : u.colors.line, borderWidth: 1.5 + active * 1.5, sfx: i === 0 ? 'pop' : null }, () => {
        s.ctx.beginPath();
        s.ctx.arc(x + W / 2, y + 92, 44, 0, Math.PI * 2);
        s.ctx.fillStyle = active > 0.5 ? u.colors.accent : u.colors.accentTint;
        s.ctx.fill();
        u.icon(finished ? 'check' : st.icon, x + W / 2, y + 92, 40, active > 0.5 ? '#ffffff' : u.colors.accent, 2.2);
        u.text(st.title, x + W / 2, y + 176, { size: 28, weight: 700, align: 'center' });
        u.text(st.sub, x + W / 2, y + 214, { size: 21, color: u.colors.muted, align: 'center' });
        if (finished) u.pill('Done', x + W / 2, y + 276, 'green', { align: 'center' });
        else if (active > 0) {
          u.spinner(x + W / 2 - 60, y + 276, 11);
          u.text('Working', x + W / 2 - 38, y + 277, { size: 19, weight: 600, color: u.colors.accent });
        }
      });
      if (s.t >= start) s.sfx('pop', start);
    });
  },

  voice(s) {
    const px = 410;
    const py = 250;
    const formal = s.time('#formal');
    const rhythm = s.time('#rhythm');
    const create = s.voice.end - 0.1;
    const u = stage(s, 'In your voice', {
      at: 0.1,
      camera: [
        { at: formal - 0.7, x: 900, y: 520, zoom: 1.12, dur: 0.8 },
        { at: rhythm - 0.6, x: 960, y: 580, zoom: 1.12, dur: 0.7 },
        { at: s.voice.end - 0.9, x: 1080, y: 560, zoom: 1.08, dur: 0.8 },
      ],
    });
    // Lay the chips out with room for the check mark of the one that gets picked.
    const row = (labels, y, pick) => {
      let x = px + 56;
      return labels.map((label, i) => {
        const r = { label, x, y, w: u.chipWidth(label, { size: 21 }, i === pick) };
        x += r.w + 14;
        return r;
      });
    };
    const f = row(['Casual', 'Conversational', 'Professional', 'Formal', 'Academic'], py + 262, 1);
    const r = row(['Short and Punchy', 'Mixed', 'Measured', 'Long and Layered'], py + 420, 1);
    u.panel(px, py, 1100, 610, { at: '#voice' }, () => {
      u.eyebrow('Voice profile', px + 56, py + 62);
      u.text('Friendly and clear', px + 56, py + 114, { size: 38, weight: 700 });
      u.text('Formality', px + 56, py + 200, { size: 23, weight: 600 });
      f.forEach((ch, i) => u.chip(ch.label, ch.x, ch.y, { size: 21, selected: i === 1 ? s.p(formal, 0.3) : 0 }));
      u.text('Sentence rhythm', px + 56, py + 358, { size: 23, weight: 600 });
      r.forEach((ch, i) => u.chip(ch.label, ch.x, ch.y, { size: 21, selected: i === 1 ? s.p(rhythm, 0.3) : 0 }));
      u.button('Create voice', px + 824, py + 520, 220, 60, { press: u.press(create) });
    });
    u.cursor([
      { at: s.time('#voice') + 0.3, x: 1500, y: 900 },
      { at: formal - 0.65, x: f[1].x + f[1].w / 2, y: f[1].y + 4 },
      { at: formal, click: true },
      { at: rhythm - 0.6, x: r[1].x + r[1].w / 2, y: r[1].y + 4 },
      { at: rhythm, click: true },
      { at: create - 0.7, x: px + 934, y: py + 552 },
      { at: create, click: true },
    ]);
  },

  publish(s) {
    const pub = s.time('#publish');
    const live = s.time('#live');
    const send = pub + 1.25;
    const u = stage(s, 'You read it, Unspar publishes it', {
      at: 0.1,
      camera: [
        { at: 0, x: 900, y: 560, zoom: 1.02 },
        { at: live - 0.5, x: 1020, y: 560, zoom: 1.04, dur: 1 },
      ],
    });
    // The finished article.
    const ax = 220;
    const ay = 260;
    u.panel(ax, ay, 860, 640, { at: 0.2 }, () => {
      u.text('Preview', ax + 48, ay + 52, { size: 20, weight: 600, color: u.colors.accent });
      s.ctx.fillStyle = u.colors.accent;
      s.ctx.fillRect(ax + 48, ay + 72, 74, 3);
      u.text('Markdown', ax + 146, ay + 52, { size: 20, weight: 500, color: u.colors.muted });
      s.ctx.fillStyle = u.colors.line;
      s.ctx.fillRect(ax + 32, ay + 75, 796, 1.5);
      u.pill('Completed', ax + 600, ay + 50, 'green', { align: 'right', dot: true });
      u.button('Publish', ax + 640, ay + 22, 180, 56, { press: u.press(pub), icon: 'send' });
      u.text('Your first sourdough loaf,', ax + 48, ay + 140, { size: 40, weight: 700 });
      u.text('step by step', ax + 48, ay + 190, { size: 40, weight: 700 });
      u.lines(ax + 48, ay + 240, 760, 5, { gap: 26, h: 11 });
      u.text('What you need', ax + 48, ay + 400, { size: 26, weight: 700 });
      u.lines(ax + 48, ay + 436, 760, 5, { gap: 26, h: 11, seed: 3 });
    });
    // The publish dialog, closed again after "Publish now".
    const mx = 330;
    const my = 380;
    u.modal(mx, my, 640, 350, { at: pub + 0.15, out: send + 0.2 }, () => {
      u.text('Publish', mx + 40, my + 52, { size: 30, weight: 700 });
      u.select(mx + 40, my + 130, 560, 60, { label: 'Outlet', value: 'Bakery blog  ·  WordPress', size: 20 });
      u.text('Publish timing', mx + 40, my + 226, { size: 19, weight: 600 });
      u.chip('Now', mx + 40, my + 270, { size: 19, selected: 1 });
      u.chip('Tomorrow morning, 08:00', mx + 160, my + 270, { size: 19 });
      u.button('Publish now', mx + 420, my + 284, 180, 52, { press: u.press(send), size: 20 });
    });
    // The post on the site.
    const bx = 1130;
    const by = 300;
    u.browser(bx, by, 620, 560, { at: send + 0.35, rise: 60, url: 'example.com/blog/first-sourdough-loaf' }, (x, y) => {
      u.text('BAKERY BLOG', x + 40, y + 46, { size: 16, weight: 700, color: u.colors.faint, tracking: 2 });
      const tp = s.p(send + 0.7, 0.6, 'out');
      s.ctx.save();
      s.ctx.globalAlpha *= tp;
      s.ctx.translate(0, (1 - tp) * 16);
      u.text('Your first sourdough', x + 40, y + 100, { size: 36, font: 'headline' });
      u.text('loaf, step by step', x + 40, y + 144, { size: 36, font: 'headline' });
      u.lines(x + 40, y + 190, 540, 8, { gap: 26, h: 10, seed: 5 });
      s.ctx.restore();
    });
    if (s.t >= send + 0.7) s.sfx('sparkle', send + 0.7, { gain: 0.6 });
    // WordPress and Ghost.
    [['WordPress', 1290], ['Ghost', 1470]].forEach(([name, x], i) => {
      const w = u.measure(name, 21, 600) + 40;
      u.pop(live + 0.15 + i * 0.35, x + w / 2, 925, () => {
        u.card(x, 900, w, 50, { r: 25, lift: 0.5 });
        u.text(name, x + 20, 926, { size: 21, weight: 600 });
      }, { sfx: 'pop' });
    });
    u.cursor([
      { at: 0.4, x: 1300, y: 860 },
      { at: pub - 0.7, x: ax + 740, y: ay + 50 },
      { at: pub, click: true },
      { at: pub + 0.4, x: mx + 578, y: my + 318, dur: 0.75 },
      { at: send, click: true },
    ], { out: send + 0.6 });
  },

  outro(s) {
    const u = s.ui;
    u.backdrop();
    // Brand color fills the frame, with white cards drifting on it.
    const p = u.wipe(0);
    s.ctx.save();
    s.ctx.globalAlpha = p;
    u.floaters({ tint: 'white', alpha: 0.35 });
    s.ctx.restore();
    const x = 510;
    const y = 250;
    u.panel(x, y, 900, 560, { at: 0.45, r: 32, lift: 2, border: false, from: 0.9 }, () => {
      u.logo(960, y + 120, 330);
      u.headline("*Content that doesn't* read like AI.", 960, y + 285, { size: 72, at: '#brand' });
      u.pop('#try', 960, y + 383, () => u.button('Try it for free', 810, y + 350, 300, 66, { size: 23 }), { from: 0.8 });
      if (s.t >= s.time('#try')) u.text('unspar.com', 960, y + 470, { size: 24, weight: 500, color: u.colors.muted, align: 'center', alpha: s.p('#try', 0.4, 'out') });
    });
  },
};
