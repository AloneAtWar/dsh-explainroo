interface Storage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const splitKey = 'dsh-explainroo:business-width:v1';
export const defaultWidth = 0.7;
export function fitWidth(ratio: number, width: number): number {
  const min = Math.max(0.25, Math.min(0.7, 280 / Math.max(1, width)));
  const max = Math.max(min, Math.min(0.7, 1 - 260 / Math.max(1, width)));
  return Math.max(min, Math.min(max, Number.isFinite(ratio) ? ratio : defaultWidth));
}
export function splitPreference(storage: Storage) {
  let preferred = defaultWidth;
  try { const raw = storage.getItem(splitKey); const value = raw === null ? NaN : Number(raw); if (Number.isFinite(value) && value >= 0.25 && value <= 0.7) preferred = value; } catch { /* private storage may be unavailable */ }
  return {
    get: () => preferred,
    save(value: number) { preferred = fitWidth(value, Infinity); try { storage.setItem(splitKey, String(preferred)); } catch { /* resizing still works without persistence */ } },
  };
}

/** Keep Desktop's conversation and panel mounted. Only adjust our own host pane.
 * Unknown host layouts gracefully keep the default layout without a handle. */
export function attachNativeSplit(root: HTMLElement, handle: HTMLElement, active: () => boolean, subscribe: (listener: () => void) => () => void, storage: Storage): () => void {
  const business = root.closest<HTMLElement>('.dshWbBusiness[data-embedded="true"][data-side="right"]');
  const body = business?.parentElement;
  if (!business || !body?.classList.contains('dshWbBody')) return () => {};
  const preference = splitPreference(storage);
  const original = business.style.getPropertyValue('width'); const priority = business.style.getPropertyPriority('width');
  let enabled = false; let pointer: number | null = null; let current = preference.get(); let applied = false;
  let lastPress: { time: number; x: number; y: number } | null = null;
  let grabOffset = 0; let resetting = false;
  const restore = () => { if (applied) { if (original) business.style.setProperty('width', original, priority); else business.style.removeProperty('width'); applied = false; } };
  const release = () => {
    const id = pointer; pointer = null; resetting = false; handle.removeAttribute('data-dragging'); root.removeAttribute('data-resizing');
    if (id !== null && handle.hasPointerCapture(id)) handle.releasePointerCapture(id);
  };
  const apply = (ratio: number) => {
    current = fitWidth(ratio, body.getBoundingClientRect().width);
    business.style.setProperty('width', `${current * 100}%`); applied = true;
    handle.setAttribute('aria-valuenow', String(Math.round((1 - current) * 100)));
    handle.setAttribute('aria-valuetext', `对话 ${Math.round((1 - current) * 100)}%，工作台 ${Math.round(current * 100)}%`);
  };
  const sync = () => {
    enabled = active() && getComputedStyle(body).flexDirection === 'row' && body.getBoundingClientRect().width >= 540;
    handle.hidden = !enabled;
    if (enabled) apply(pointer === null ? preference.get() : current);
    else { release(); restore(); }
  };
  const down = (event: PointerEvent) => {
    if (!enabled || event.button !== 0 || pointer !== null) return;
    const doublePress = lastPress !== null && event.timeStamp - lastPress.time < 500 && Math.abs(event.clientX - lastPress.x) < 5 && Math.abs(event.clientY - lastPress.y) < 5;
    lastPress = doublePress ? null : { time: event.timeStamp, x: event.clientX, y: event.clientY };
    grabOffset = event.clientX - business.getBoundingClientRect().left; resetting = doublePress;
    event.preventDefault(); pointer = event.pointerId; handle.setPointerCapture(pointer); handle.focus();
    handle.setAttribute('data-dragging', ''); root.setAttribute('data-resizing', '');
    // Pointer capture can suppress dblclick in Desktop's embedded Chromium.
    if (doublePress) { preference.save(defaultWidth); apply(defaultWidth); }
  };
  const move = (event: PointerEvent) => {
    if (!enabled || pointer !== event.pointerId || resetting) return;
    if (lastPress && (Math.abs(event.clientX - lastPress.x) >= 5 || Math.abs(event.clientY - lastPress.y) >= 5)) lastPress = null;
    const rect = body.getBoundingClientRect(); apply((rect.right - event.clientX + grabOffset) / rect.width);
  };
  const up = (event: PointerEvent) => { if (event.pointerId !== pointer) return; preference.save(current); release(); };
  const cancel = () => { release(); if (enabled) apply(preference.get()); };
  const reset = () => { if (!enabled) return; preference.save(defaultWidth); apply(defaultWidth); };
  const key = (event: KeyboardEvent) => {
    if (!enabled) return;
    const step = event.shiftKey ? 0.1 : 0.02;
    const next = event.key === 'ArrowLeft' ? current + step : event.key === 'ArrowRight' ? current - step : event.key === 'Home' ? 0.7 : event.key === 'End' ? 0.25 : event.key === 'Enter' ? defaultWidth : undefined;
    if (next === undefined) return;
    event.preventDefault(); apply(next); preference.save(current);
  };
  handle.addEventListener('pointerdown', down); handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', cancel); handle.addEventListener('lostpointercapture', cancel); handle.addEventListener('keydown', key); handle.addEventListener('dblclick', reset);
  const observer = new ResizeObserver(sync); observer.observe(body);
  const unsubscribe = subscribe(sync); sync();
  return () => {
    unsubscribe(); observer.disconnect(); enabled = false; release(); restore(); handle.hidden = true;
    handle.removeEventListener('pointerdown', down); handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', cancel); handle.removeEventListener('lostpointercapture', cancel); handle.removeEventListener('keydown', key); handle.removeEventListener('dblclick', reset);
  };
}
