export function asciiName(name: string, marker?: boolean): string;
export function encodeScript(source: string): { script: string; identities: { scenes: Record<string, string>; markers: Record<string, string> } };
export function parseScript(source: string, options?: { language?: string }): any;
