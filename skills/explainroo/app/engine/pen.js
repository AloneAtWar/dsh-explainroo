// Draws shapes either crisp (clean looks) or hand-drawn with rough.js
// (paper, chalk, blueprint), with a draw-on reveal for strokes and fills.
import { rectD, ellipseD, polyD, splitSubpaths, pathLength } from './pathdata.js';
import { withAlpha, hashStr, mulberry32, parseColor } from './util.js';

export class Pen {
  constructor({ rough, theme }) {
    this.gen = rough.generator();
    this.theme = theme;
    this.cache = new Map();
    this.patterns = new Map();
    this.seedOffset = 0;
  }

  // spec: { kind: 'rect', w, h, r } | { kind: 'ellipse', w, h } | { kind: 'poly', points, close }
  //     | { kind: 'path', d }
  // style: { stroke, width, fill, fillStyle, dashed, seed, roughness, shadow, glow }
  // prog: { stroke, fill } in 0..1
  draw(ctx, spec, style, prog = { stroke: 1, fill: 1 }) {
    const rough = style.rough ?? this.theme.stroke.rough;
    if (rough) this.drawRough(ctx, spec, style, prog);
    else this.drawClean(ctx, spec, style, prog);
  }

  specD(spec) {
    switch (spec.kind) {
      case 'rect': return rectD(spec.w, spec.h, spec.r || 0);
      case 'ellipse': return ellipseD(spec.w, spec.h);
      case 'poly': return polyD(spec.points, spec.close);
      case 'path': return spec.d;
      default: throw new Error(`unknown shape kind ${spec.kind}`);
    }
  }

  prepared(d) {
    const key = 'c|' + d;
    let v = this.cache.get(key);
    if (!v) {
      const subs = splitSubpaths(d).map((sd) => ({ p2d: new Path2D(sd), len: pathLength(sd) }));
      v = { full: new Path2D(d), subs, total: subs.reduce((a, s) => a + s.len, 0) };
      this.remember(key, v);
    }
    return v;
  }

  remember(key, v) {
    if (this.cache.size > 4000) this.cache.clear();
    this.cache.set(key, v);
  }

  strokeStyleFor(color) {
    if (this.theme.stroke.texture === 'chalk') return this.chalkPattern(color);
    return color;
  }

  chalkPattern(color) {
    let p = this.patterns.get(color);
    if (p) return p;
    const c = document.createElement('canvas');
    c.width = 192;
    c.height = 192;
    const g = c.getContext('2d');
    g.fillStyle = color;
    g.fillRect(0, 0, 192, 192);
    const rand = mulberry32(hashStr(color));
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(0,0,0,${0.25 + rand() * 0.75})`;
      const s = 0.6 + rand() * 1.8;
      g.fillRect(rand() * 192, rand() * 192, s, s);
    }
    p = g.createPattern(c, 'repeat');
    this.patterns.set(color, p);
    return p;
  }

  applyDash(ctx, style) {
    if (style.dashed) ctx.setLineDash(Array.isArray(style.dashed) ? style.dashed : [style.width * 3, style.width * 2.4]);
    else ctx.setLineDash([]);
  }

  // Strokes subpaths in order until `p` of the total length is drawn.
  reveal(ctx, prep, p, dash) {
    if (p <= 0) return;
    if (p >= 0.999) {
      if (dash) ctx.setLineDash(dash);
      for (const s of prep.subs) ctx.stroke(s.p2d);
      ctx.setLineDash([]);
      return;
    }
    let left = prep.total * p;
    for (const s of prep.subs) {
      if (left <= 0) break;
      if (left >= s.len) {
        if (dash) ctx.setLineDash(dash);
        ctx.stroke(s.p2d);
        left -= s.len;
      } else {
        ctx.setLineDash(dashUpTo(dash, left, s.len));
        ctx.stroke(s.p2d);
        break;
      }
    }
    ctx.setLineDash([]);
  }

  drawClean(ctx, spec, style, prog) {
    const d = this.specD(spec);
    const prep = this.prepared(d);
    const pf = prog.fill ?? 1;
    const ps = prog.stroke ?? 1;
    ctx.save();
    if (style.fill && style.fill !== 'none' && pf > 0) {
      const sh = style.shadow;
      if (sh) {
        ctx.shadowColor = sh.color;
        ctx.shadowBlur = sh.blur;
        ctx.shadowOffsetY = sh.y || 0;
      }
      ctx.fillStyle = pf < 1 ? withAlpha(style.fill, pf) : style.fill;
      if (spec.kind !== 'poly' || spec.close) ctx.fill(prep.full);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }
    if (style.stroke && style.stroke !== 'none' && style.width > 0 && ps > 0) {
      ctx.strokeStyle = this.strokeStyleFor(style.stroke);
      ctx.lineWidth = style.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (style.glow) {
        ctx.shadowColor = withAlpha(style.stroke, 0.65);
        ctx.shadowBlur = style.glow;
      }
      this.reveal(ctx, prep, ps, style.dashed ? dashPattern(style) : null);
    }
    ctx.restore();
  }

  drawRough(ctx, spec, style, prog) {
    const t = this.theme.stroke;
    const roughness = style.roughness ?? t.roughness;
    const fillStyle = style.fillStyle || t.fillStyle || 'solid';
    const hasFill = style.fill && style.fill !== 'none';
    const seed = ((style.seed ?? 1) + this.seedOffset) % 2147483647 || 1;
    const opts = {
      seed,
      roughness,
      bowing: t.bowing ?? 1,
      stroke: '#000',
      strokeWidth: style.width || t.width,
      fill: hasFill ? '#000' : undefined,
      fillStyle,
      hachureGap: style.hachureGap ?? t.hachureGap ?? 10,
      fillWeight: style.fillWeight ?? t.fillWeight ?? 2,
      hachureAngle: -41,
      preserveVertices: spec.kind === 'poly',
      disableMultiStroke: !!style.single,
      curveStepCount: 9,
    };
    const key = 'r|' + JSON.stringify([spec.kind, spec.w, spec.h, spec.r, spec.points, spec.close, spec.d, opts.seed, opts.roughness, opts.bowing, opts.fill, opts.fillStyle, opts.hachureGap, opts.disableMultiStroke, opts.preserveVertices]);
    let sets = this.cache.get(key);
    if (!sets) {
      let drawable;
      if (spec.kind === 'rect' && !spec.r) drawable = this.gen.rectangle(-spec.w / 2, -spec.h / 2, spec.w, spec.h, opts);
      else if (spec.kind === 'ellipse') drawable = this.gen.ellipse(0, 0, spec.w, spec.h, opts);
      else if (spec.kind === 'poly' && !spec.close) drawable = this.gen.linearPath(spec.points, opts);
      else if (spec.kind === 'poly' && spec.close) drawable = this.gen.polygon(spec.points, opts);
      else drawable = this.gen.path(this.specD(spec), opts);
      sets = drawable.sets.map((set) => {
        const d = this.gen.opsToPath(set, 2);
        const subs = splitSubpaths(d).map((sd) => ({ p2d: new Path2D(sd), len: pathLength(sd) }));
        return { type: set.type, full: new Path2D(d), subs, total: subs.reduce((a, s) => a + s.len, 0) };
      });
      this.remember(key, sets);
    }
    const pf = prog.fill ?? 1;
    const ps = prog.stroke ?? 1;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const set of sets) {
      if (set.type === 'fillPath' && hasFill && pf > 0) {
        if (style.shadow) {
          ctx.shadowColor = style.shadow.color;
          ctx.shadowBlur = style.shadow.blur;
          ctx.shadowOffsetY = style.shadow.y || 0;
        }
        ctx.fillStyle = withAlpha(style.fill, pf);
        ctx.fill(set.full);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      } else if (set.type === 'fillSketch' && hasFill && pf > 0) {
        ctx.strokeStyle = this.strokeStyleFor(style.fill);
        ctx.lineWidth = opts.fillWeight;
        this.reveal(ctx, set, pf, null);
      } else if (set.type === 'path' && style.stroke && style.stroke !== 'none' && ps > 0) {
        ctx.strokeStyle = this.strokeStyleFor(style.stroke);
        ctx.lineWidth = opts.strokeWidth;
        if (style.glow) {
          ctx.shadowColor = withAlpha(style.stroke, 0.6);
          ctx.shadowBlur = style.glow;
        }
        this.reveal(ctx, set, ps, style.dashed ? dashPattern(style) : null);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }
    }
    ctx.restore();
  }
}

function dashPattern(style) {
  return Array.isArray(style.dashed) ? style.dashed : [style.width * 3.2, style.width * 2.6];
}

// A dash array that shows only the first `visible` units of a subpath,
// keeping a dash pattern if one is set.
function dashUpTo(dash, visible, len) {
  if (!dash) return [visible, len + 1];
  const out = [];
  let acc = 0;
  let i = 0;
  while (acc < visible && out.length < 400) {
    const take = Math.min(dash[i % dash.length], visible - acc);
    out.push(take);
    acc += take;
    i++;
  }
  // Dash arrays alternate on, off, on, off. End with one long "off".
  if (out.length % 2 === 1) out.push(len + 1);
  else out.push(0, len + 1);
  return out;
}

export function isDark(color) {
  const p = parseColor(color);
  if (!p) return false;
  return (0.299 * p.r + 0.587 * p.g + 0.114 * p.b) / 255 < 0.5;
}
