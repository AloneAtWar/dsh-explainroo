export interface Identities { scenes: Record<string, string>; markers: Record<string, string> }
export const emptyIdentities = (): Identities => ({ scenes: {}, markers: {} });
export function originalScene(id: string, identities: Identities): string { return identities.scenes[id] ?? id; }
export function originalCue(value: number | string, identities: Identities): number | string {
  return typeof value === 'string' && value.startsWith('#') ? '#' + (identities.markers[value.slice(1)] ?? value.slice(1)) : value;
}
export function engineCue(value: number | string, identities: Identities): number | string {
  if (typeof value !== 'string' || !value.startsWith('#')) return value;
  const encoded = Object.entries(identities.markers).find(([, original]) => original === value.slice(1));
  return '#' + (encoded?.[0] ?? value.slice(1));
}
