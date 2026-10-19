import type { EditableElement, ElementOverride, StudioState } from './types.ts';

type Stage = Record<string, any>;
type Scenes = Record<string, (s: Stage) => unknown>;
const supported = new Set(['text', 'box', 'circle', 'icon', 'image']);

/** The same adapter runs in the preview and in a materialized export project. */
export function wrapScenes(source: Scenes, state: () => StudioState, report?: (scene: string, elements: EditableElement[]) => void): Scenes {
  return Object.fromEntries(Object.entries(source).map(([sceneId, draw]) => [sceneId, (s: Stage) => {
    const elements: EditableElement[] = [];
    const counts: Record<string, number> = {};
    const proxy = new Proxy(s, {
      get(target, key) {
        const value = Reflect.get(target, key, target);
        if (typeof value !== 'function') return value;
        if (!supported.has(String(key))) return value.bind(target);
        return (...args: any[]) => {
          const kind = String(key);
          const index = counts[kind] = (counts[kind] ?? 0) + 1;
          const optionIndex = kind === 'circle' ? 0 : 1;
          const original = { ...(args[optionIndex] ?? {}) };
          const baseText = String(kind === 'circle' ? original.label ?? '' : args[0] ?? '');
          const id = String(original.id ?? `${kind}:${index}`);
          const override: ElementOverride | undefined = state().scenes[sceneId]?.elements[id];
          // Auto ids remain safe when an agent changes the source's call order.
          const edit = override?.kind === kind && override.baseText === baseText ? override.patch : {};
          const { text, ...properties } = edit;
          const options = { ...original, ...properties };
          if (kind === 'circle' && (edit.w !== undefined || edit.h !== undefined)) options.r = Math.min(edit.w ?? edit.h!, edit.h ?? edit.w!) / 2;
          if (kind === 'icon' && (edit.w !== undefined || edit.h !== undefined)) options.size = edit.w ?? edit.h;
          if (kind === 'text' && edit.w !== undefined) options.maxWidth = edit.w;
          if (text !== undefined && kind !== 'image' && kind !== 'icon') {
            if (kind === 'circle') options.label = text;
            else args[0] = text;
          }
          args[optionIndex] = options;
          const result = value.apply(target, args);
          if (result && typeof result.x === 'number' && typeof result.w === 'number') {
            let at = 0;
            let out = Infinity;
            try { at = target.time(options.at ?? 0); if (options.out !== undefined) out = target.time(options.out); } catch { /* Invalid cues are also reported by the engine. */ }
            const scale = target.ctx.getTransform();
            const a = scale.transformPoint({ x: result.x - result.w / 2, y: result.y - result.h / 2 });
            const b = scale.transformPoint({ x: result.x + result.w / 2, y: result.y + result.h / 2 });
            const engineScale = target.engine.scale || 1;
            elements.push({
              id, kind, baseText, text: String(text ?? baseText), x: Number(options.x ?? result.x), y: Number(options.y ?? result.y),
              w: result.w, h: result.h, size: Number(options.size ?? 48), color: String(options.color ?? 'ink'),
              at: options.at ?? 0, ...(options.out !== undefined ? { out: options.out } : {}), enter: String(options.enter ?? 'fade'),
              visible: target.t >= at && target.t <= out,
              screen: { x: a.x / engineScale, y: a.y / engineScale, w: (b.x - a.x) / engineScale, h: (b.y - a.y) / engineScale },
            });
          }
          return result;
        };
      },
    });
    const result = draw(proxy);
    report?.(sceneId, elements);
    return result;
  }]));
}
