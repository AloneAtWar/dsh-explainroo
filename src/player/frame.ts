import type { EditableElement, ElementOverride, StudioState } from '../shared/types.ts';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const view = document.getElementById('view') as HTMLDivElement;
const selection = document.getElementById('selection') as HTMLDivElement;
const errorBox = document.getElementById('error') as HTMLDivElement;
const channel = new URLSearchParams(location.search).get('channel') ?? '';
const runtimeUrl = '/engine/runtime.js';
let runtime: any;
let engine: any;
let state: any;
let time = 0;
let playing = false;
let startedAt = 0;
let elements: EditableElement[] = [];
let selected: string | null = null;
let sceneId = '';
let collecting = true;
let lastReport = 0;
let loading = false;
let audioScene: string | null = null;
const audio = new Audio();
audio.preload = 'auto';
const studio = { state: { version: 1, revision: 0, stage: 'visual', scenes: {} } as StudioState, report: (id: string, list: EditableElement[]) => { if (collecting) { sceneId = id; elements = list; } } };
(globalThis as any).__explainrooStudio = studio;
function send(type: string, data: unknown): void { parent.postMessage({ source: 'explainroo-frame', channel, type, data }, '*'); }
function error(message: string): void { errorBox.textContent = message; errorBox.style.display = message ? 'block' : 'none'; if (message) send('error', message); }
function publish(): void { send('frame', { time, playing, sceneId, elements, selected }); }
function fit(): void {
  if (!engine) return;
  const scale = Math.min(innerWidth / engine.W, innerHeight / engine.H);
  view.style.width = `${engine.W * scale}px`; view.style.height = `${engine.H * scale}px`;
  canvas.style.width = '100%'; canvas.style.height = '100%';
  outline();
}
function outline(): void {
  const element = elements.find(item => item.id === selected && item.visible);
  if (!element || !engine) { selection.style.display = 'none'; return; }
  selection.style.display = 'block';
  selection.style.left = `${element.screen.x / engine.W * 100}%`; selection.style.top = `${element.screen.y / engine.H * 100}%`;
  selection.style.width = `${element.screen.w / engine.W * 100}%`; selection.style.height = `${element.screen.h / engine.H * 100}%`;
}
function draw(): void {
  if (!engine) return;
  try { collecting = true; engine.renderFrame(Math.max(0, Math.min(time, state.timeline.duration - 1 / state.config.fps))); outline(); error(''); }
  catch (cause) { error(cause instanceof Error ? cause.message : String(cause)); }
}
function syncAudio(force = false): void {
  const scene = state?.timeline.scenes.find((item: any) => time >= item.start && time < item.start + item.dur);
  const voice = scene?.voice;
  const relative = voice ? time - voice.start : -1;
  if (!voice || relative < 0 || relative >= voice.dur || !playing) { audio.pause(); if (!voice) audioScene = null; return; }
  if (audioScene !== scene.id || force) {
    if (audioScene !== scene.id) audio.src = '/project/' + voice.url;
    audioScene = scene.id; audio.currentTime = Math.max(0, relative);
    void audio.play().catch(() => send('audio-blocked', true));
  } else if (audio.paused) { audio.currentTime = relative; void audio.play().catch(() => send('audio-blocked', true)); }
}
function seek(value: number): void {
  time = Math.max(0, Math.min(value, state?.timeline.duration ?? 0)); startedAt = performance.now() / 1000 - time;
  syncAudio(true); draw(); publish();
}
function setPlaying(value: boolean): void {
  playing = value; if (time >= state.timeline.duration) time = 0;
  startedAt = performance.now() / 1000 - time; syncAudio(true); publish();
}
async function thumbnails(): Promise<void> {
  const thumbnail = document.createElement('canvas'); thumbnail.width = 256; thumbnail.height = Math.round(256 * engine.H / engine.W);
  const ctx = thumbnail.getContext('2d')!;
  const images: Record<string, string> = {};
  collecting = false;
  for (const scene of state.timeline.scenes) {
    try { engine.renderFrame(scene.start + scene.dur - 1 / state.config.fps); ctx.drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height); images[scene.id] = thumbnail.toDataURL('image/jpeg', 0.7); }
    catch { /* A broken scene is surfaced when selected; other thumbnails remain useful. */ }
  }
  collecting = true; draw(); send('thumbnails', images);
}
async function load(): Promise<void> {
  if (loading) return; loading = true;
  try {
    runtime ??= await import(/* @vite-ignore */ runtimeUrl);
    const fresh = await runtime.fetchState();
    studio.state = fresh.studio;
    const result = await runtime.boot({ canvas, scale: Math.min(1, 1280 / fresh.config.width), version: fresh.version });
    engine?.clipFrames?.close(); engine = result.engine; state = result.state;
    engine.onClipFrame = draw;
    time = Math.min(time, state.timeline.duration); startedAt = performance.now() / 1000 - time;
    fit(); draw(); send('ready', { duration: state.timeline.duration }); publish();
    await thumbnails();
  } catch (cause) { error(cause instanceof Error ? cause.message : String(cause)); }
  finally { loading = false; }
}
window.addEventListener('message', event => {
  if (event.source !== parent || event.data?.source !== 'explainroo-workbench' || event.data.channel !== channel) return;
  const { type, data } = event.data;
  if (type === 'seek') seek(Number(data));
  if (type === 'play') setPlaying(!playing);
  if (type === 'select') { selected = data; draw(); publish(); }
  if (type === 'state') { studio.state = data; draw(); publish(); }
  if (type === 'reload') void load();
});
let drag: { startX: number; startY: number; element: EditableElement; override: ElementOverride } | null = null;
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  if (!engine || playing) return;
  const bounds = canvas.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width * engine.W;
  const y = (event.clientY - bounds.top) / bounds.height * engine.H;
  const found = [...elements].reverse().find(item => item.visible && x >= item.screen.x && x <= item.screen.x + item.screen.w && y >= item.screen.y && y <= item.screen.y + item.screen.h);
  selected = found?.id ?? null; outline(); publish();
  if (!found || studio.state.scenes[sceneId]?.locked) return;
  drag = { startX: x, startY: y, element: found, override: structuredClone(studio.state.scenes[sceneId]?.elements[found.id] ?? { kind: found.kind, baseText: found.baseText, patch: {} }) };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', event => {
  if (!drag) return;
  const bounds = canvas.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width * engine.W;
  const y = (event.clientY - bounds.top) / bounds.height * engine.H;
  const zoom = Math.max(0.01, Math.abs(drag.element.screen.w / drag.element.w));
  drag.override.patch.x = Math.round(drag.element.x + (x - drag.startX) / zoom);
  drag.override.patch.y = Math.round(drag.element.y + (y - drag.startY) / zoom);
  const scene = studio.state.scenes[sceneId] ??= { locked: false, note: '', elements: {} };
  scene.elements[drag.element.id] = drag.override; draw();
});
canvas.addEventListener('pointerup', () => {
  if (drag && (drag.override.patch.x !== undefined || drag.override.patch.y !== undefined)) send('edit', { sceneId, elementId: drag.element.id, element: drag.override });
  drag = null; publish();
});
canvas.addEventListener('pointercancel', () => { drag = null; });
window.addEventListener('contextmenu', event => {
  event.preventDefault();
  if (!engine || !sceneId) return;
  const bounds = canvas.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width * engine.W; const y = (event.clientY - bounds.top) / bounds.height * engine.H;
  const found = [...elements].reverse().find(item => item.visible && x >= item.screen.x && x <= item.screen.x + item.screen.w && y >= item.screen.y && y <= item.screen.y + item.screen.h);
  send('context', { sceneId, x: event.clientX, y: event.clientY, ...(found ? { element: { id: found.id, kind: found.kind, baseText: found.baseText } } : {}) });
});
window.addEventListener('resize', fit);
window.addEventListener('keydown', event => { if (event.key === ' ') { event.preventDefault(); setPlaying(!playing); } if (event.key === 'ArrowRight') seek(time + 1); if (event.key === 'ArrowLeft') seek(time - 1); });
function tick(): void {
  if (playing && engine) { time = performance.now() / 1000 - startedAt; if (time >= state.timeline.duration) { time = state.timeline.duration; playing = false; audio.pause(); } syncAudio(); draw(); if (performance.now() - lastReport > 150) { publish(); lastReport = performance.now(); } }
  requestAnimationFrame(tick);
}
void load(); tick();
setInterval(async () => {
  if (loading) return;
  try { const current = await runtime?.fetchState(); if (current && current.version !== state?.version) await load(); }
  catch { error('预览连接已断开，请刷新项目。'); }
}, 2000);
