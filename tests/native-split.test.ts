import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachNativeSplit, defaultWidth, fitWidth, splitKey, splitPreference } from '../src/client/native-split.ts';

afterEach(() => vi.unstubAllGlobals());

describe('native conversation split preferences', () => {
  it('keeps both panels usable as the window narrows and preserves wide-window proportions', () => {
    expect(fitWidth(0.55, 1200)).toBe(0.55);
    expect(fitWidth(0.7, 600) * 600).toBeLessThanOrEqual(340);
    expect(fitWidth(0.25, 600) * 600).toBeGreaterThanOrEqual(280);
    expect(fitWidth(NaN, 1200)).toBe(defaultWidth); expect(fitWidth(10, 1200)).toBe(0.7);
  });
  it('remembers the user preference across reopening without persisting a temporary narrow-window clamp', () => {
    const values = new Map<string, string>(); const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const preference = splitPreference(storage); preference.save(0.62);
    expect(fitWidth(preference.get(), 600)).toBeLessThan(0.62);
    expect(splitPreference(storage).get()).toBe(0.62); expect(fitWidth(preference.get(), 1400)).toBe(0.62); expect(values.has(splitKey)).toBe(true);
  });
  it('recovers from corrupt or inaccessible storage and still supports resizing and reset', () => {
    for (const value of ['', 'NaN', '1.5', '-1', 'null', '{}']) expect(splitPreference({ getItem: () => value, setItem() {} }).get()).toBe(defaultWidth);
    const preference = splitPreference({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } });
    preference.save(0.5); expect(preference.get()).toBe(0.5); preference.save(defaultWidth); expect(preference.get()).toBe(defaultWidth);
  });
  it('restores host styles when switching workbenches and removes its observers and input handlers on unload', () => {
    const properties = new Map([['width', '61%']]); const attributes = new Map<string, string>();
    const body = { classList: { contains: (name: string) => name === 'dshWbBody' }, getBoundingClientRect: () => ({ width: 1000, right: 1200 }) };
    const business = { parentElement: body, getBoundingClientRect: () => ({ left: 1200 - Number.parseFloat(properties.get('width')!) * 10 }), style: { getPropertyValue: (key: string) => properties.get(key) ?? '', getPropertyPriority: () => '', setProperty: (key: string, value: string) => { properties.set(key, value); }, removeProperty: (key: string) => properties.delete(key) } };
    const root = { closest: () => business, removeAttribute() {}, setAttribute() {} };
    let captured: number | null = null;
    const handle = Object.assign(new EventTarget(), { hidden: true, setAttribute: (key: string, value: string) => { attributes.set(key, value); }, removeAttribute: (key: string) => attributes.delete(key), hasPointerCapture: (id: number) => captured === id, setPointerCapture: (id: number) => { captured = id; }, releasePointerCapture: () => { captured = null; }, focus() {} });
    const disconnect = vi.fn(); const unsubscribe = vi.fn(); let listener = () => {}; let active = true;
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect = disconnect; }); vi.stubGlobal('getComputedStyle', () => ({ flexDirection: 'row' }));
    const storage = { getItem: () => '0.5', setItem: vi.fn() };
    const dispose = attachNativeSplit(root as any, handle as any, () => active, next => { listener = next; return unsubscribe; }, storage);
    expect(properties.get('width')).toBe('50%'); expect(handle.hidden).toBe(false);
    const event = Object.assign(new Event('keydown', { cancelable: true }), { key: 'ArrowRight', shiftKey: false }); handle.dispatchEvent(event);
    expect(properties.get('width')).toBe('48%'); expect(event.defaultPrevented).toBe(true); expect(storage.setItem).toHaveBeenCalledWith(splitKey, '0.48');
    active = false; listener(); expect(properties.get('width')).toBe('61%'); expect(handle.hidden).toBe(true);
    active = true; listener(); expect(properties.get('width')).toBe('48%');
    for (const time of [100, 250]) {
      const down = Object.assign(new Event('pointerdown', { cancelable: true }), { button: 0, pointerId: 1, clientX: 724, clientY: 100 });
      Object.defineProperty(down, 'timeStamp', { value: time }); handle.dispatchEvent(down);
      handle.dispatchEvent(Object.assign(new Event('pointermove'), { pointerId: 1, clientX: 724, clientY: 100 }));
      expect(properties.get('width')).toBe(time === 100 ? '48%' : '70%');
      handle.dispatchEvent(Object.assign(new Event('pointerup'), { pointerId: 1 }));
    }
    expect(properties.get('width')).toBe('70%'); expect(storage.setItem).toHaveBeenLastCalledWith(splitKey, '0.7');
    dispose();
    expect(properties.get('width')).toBe('61%'); expect(disconnect).toHaveBeenCalledOnce(); expect(unsubscribe).toHaveBeenCalledOnce();
    handle.dispatchEvent(Object.assign(new Event('keydown'), { key: 'ArrowLeft' })); expect(properties.get('width')).toBe('61%');
  });
});
