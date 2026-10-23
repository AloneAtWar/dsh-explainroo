import type { RenameRequest, StudioState, ValidationReport } from '../../shared/types.ts';
export interface Analysis { ok: boolean; issues: ValidationReport['issues']; script?: any; definitions: Map<string, any>; references: any[]; modules: Map<string, any> }
export function analyzeReferences(source: string, sources: Record<string, string>, options?: { language?: string; studio?: StudioState; config?: any }): Analysis;
export function renameReferences(source: string, sources: Record<string, string>, request: Pick<RenameRequest, 'kind' | 'sceneId' | 'from' | 'to'>, options?: { language?: string; studio?: StudioState; config?: any }): { script: string; sources: Record<string, string> };
export function readProjectModules(folder: string): Record<string, string>;
export function compatibleSources(source: string, sources: Record<string, string>, identities: { scenes: Record<string, string>; markers: Record<string, string> }, options?: { language?: string; studio?: StudioState; config?: any }): Record<string, string>;
export function validateProjectReferences(folder: string): ValidationReport;
export function versionImports(source: string, version: string): string;
