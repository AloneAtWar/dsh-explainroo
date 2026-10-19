import { describe, expect, it } from 'vitest';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const root = resolve('skills/explainroo/app');
const script = await import(pathToFileURL(root + '/src/script.js').href);
const refs = await import(pathToFileURL(root + '/src/references.js').href);
const project = await import(pathToFileURL(root + '/src/project.js').href);

describe('Chinese names are real keys, without a display-name map', () => {
  it('parses Chinese and mixed scene/cue names and resolves exact cue times', () => {
    const result = script.parseScript('## 开场介绍\n[#认识账户] 认识账户。\n\n## 字段_v2\n[#字段2] 展开。', {language:'zh'});
    expect(result.scenes.map((s: any) => s.id)).toEqual(['开场介绍','字段_v2']);
    const units = result.scenes[0].units;
    expect(script.resolveMarks(units, units.map((u: any) => u.type === 'word' ? {start:1.25,end:1.5} : null))).toEqual({'认识账户':1.25});
    expect(project.normalizeConfig({cover:'开场介绍@end'}).cover).toBe('开场介绍@end');
  });
  it('keeps English projects compatible and rejects duplicate or unsafe names', () => {
    expect(script.parseScript('## intro\n[#a] Hello.').scenes[0].id).toBe('intro');
    for (const text of ['## ../场景\n内容','## 开场\n[#出现]甲[#出现]乙','## 开场\n内容\n## 开场\n内容','## cafe\u0301\n内容']) expect(() => script.parseScript(text)).toThrow();
  });
  it('checks helper arguments across imports and reports missing cue/file location', () => {
    const sources = {'scenes.js':'import {draw} from "./parts/draw.js"; export default {开场(s){draw(s,"#不存在");}};', 'parts/draw.js':'export function draw(s, at){s.text("文字", {at});}'};
    const report = refs.analyzeReferences('## 开场\n[#出现] 内容', sources);
    expect(report.ok).toBe(false); expect(report.issues[0]).toMatchObject({code:'missing-marker',scene:'开场'});
    expect(report.issues[0].file).toBe('scenes.js');
  });
  it('renames exact timing references, retaining colors, visible text and other scenes', () => {
    const sources = {'scenes.js':'const cue = "#a"; export default {intro(s){s.text("a", {at:cue,color:"#abc"});s.mark("a");}, next(s){s.text("下一场",{at:"#a"});}};'};
    const result = refs.renameReferences('## intro\n[#a] 原文\n## next\n[#a] 下一场', sources, {kind:'marker',sceneId:'intro',from:'a',to:'展示账户'});
    expect(result.script).toContain('[#展示账户] 原文'); expect(result.script).toContain('[#a] 下一场');
    expect(result.sources['scenes.js']).toContain('"#展示账户"'); expect(result.sources['scenes.js']).toContain('s.mark("展示账户")');
    expect(result.sources['scenes.js']).toContain('color:"#abc"'); expect(result.sources['scenes.js']).toContain('s.text("a"');
    expect(refs.analyzeReferences(result.script,result.sources).ok).toBe(true);
  });
  it('renames an imported scene key, not its function body or unrelated identifiers', () => {
    const sources = {'scenes.js':'import {draw} from "./draw.js"; const scenes={intro:draw}; export default scenes;', 'draw.js':'export function draw(s){s.text("intro",{at:"#a"});}'};
    const result = refs.renameReferences('## intro\n[#a] 内容',sources,{kind:'scene',sceneId:'intro',to:'开场介绍'});
    expect(result.script).toContain('## 开场介绍'); expect(result.sources['scenes.js']).toContain('"开场介绍":draw');
    expect(result.sources['draw.js']).toBe(sources['draw.js']);
  });
  it('rejects shared cue constants and unresolved dynamic scene definitions', () => {
    const sources = {'scenes.js':'function draw(s){s.text("字",{at:"#a"})} export default {intro(s){draw(s)},next(s){draw(s)}}'};
    expect(() => refs.renameReferences('## intro\n[#a] 一\n## next\n[#a] 二',sources,{kind:'marker',sceneId:'intro',from:'a',to:'新触发点'})).toThrow('共享');
    expect(refs.analyzeReferences('## intro\n内容',{'scenes.js':'export default makeScenes()'}).ok).toBe(false);
  });
  it('accepts numeric offsets from cues but rejects dynamically built cue names', () => {
    const source='## 开场\n[#出现] 内容';
    expect(refs.analyzeReferences(source,{'scenes.js':'export default {开场(s){s.text("字",{at:s.time("#出现")+0.5})}}'}).ok).toBe(true);
    expect(refs.analyzeReferences(source,{'scenes.js':'export default {开场(s){s.text("字",{at:"#"+s.id})}}'}).ok).toBe(false);
    expect(refs.analyzeReferences(source,{'scenes.js':'export default {开场(s){s.text("字",{at:getCue()})}}'}).ok).toBe(false);
  });
  it('rewrites the timing use of a shared constant without changing display text', () => {
    const sources={'scenes.js':'const cue="#a";export default {intro(s){s.text(cue,{at:cue})},next(s){s.text("二",{at:cue})}}'};
    const result=refs.renameReferences('## intro\n[#a]一\n## next\n[#a]二',sources,{kind:'marker',sceneId:'intro',from:'a',to:'新名'});
    expect(result.sources['scenes.js']).toContain('const cue="#a"'); expect(result.sources['scenes.js']).toContain('s.text(cue,{at:"#新名"})');
    expect(result.sources['scenes.js']).toContain('s.text("二",{at:cue})');
  });
  it('checks and renames cues in static array/destructuring loops', () => {
    const source='## 开场\n[#第一步]甲[#第二步]乙';
    const sources={'scenes.js':'export default {开场(s){const rows=[["甲","#第一步"],["乙","#第二步"]];rows.forEach(([text,at])=>s.text(text,{at}));const cards=[{at:"#第一步"}];cards.forEach(c=>s.box("卡片",{at:c.at}));}}'};
    const result=refs.renameReferences(source,sources,{kind:'marker',sceneId:'开场',from:'第一步',to:'账户出现'});
    expect(result.sources['scenes.js']).not.toContain('#第一步'); expect(result.sources['scenes.js']).toContain('#第二步');
    expect(refs.analyzeReferences(result.script,result.sources).ok).toBe(true);
  });
});
