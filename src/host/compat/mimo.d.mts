export const MIMO_MODEL: string;
export const MIMO_DEFAULT_HOST: string;
export const MIMO_VOICES: string[];
export function mimoHost(host?: string): string;
export function buildMimoBody(text: string, options: { voice: string; model?: string; style?: string }): any;
export function extractMimoAudio(response: any): Buffer;
export function mimoSynthesize(options: { dir: string; text: string; voice: string; model?: string; host?: string; style?: string; speed?: number; build?: string }): Promise<{ audio: Float32Array; sampling_rate: number }>;
