import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { defaults } from '../src/config.ts';
import { Projects } from '../src/host/projects.ts';
import { engineModules, findEngine } from '../src/host/engine.ts';
const engineRoot = findEngine({...defaults(), engineRoot:''});
describe('transactional scene and cue renaming', () => {
  let root:string; let folder:string; let projects:Projects;
  beforeEach(async () => {
    root=await mkdtemp(join(tmpdir(),'explainroo-rename-')); folder=join(root,'video'); await mkdir(folder);
    await writeFile(join(folder,'video.json'), JSON.stringify({language:'zh',cover:'intro@end',voice:{provider:'mimo',id:'冰糖'}}));
    await writeFile(join(folder,'script.md'),'## intro\n[#a] 第一场。\n## next\n[#b] 第二场。\n');
    await writeFile(join(folder,'scenes.js'),'export default {intro(s){s.text("账户",{id:"账户",at:"#a"})},next(s){s.text("下一场",{at:"#b"})}};');
    projects=new Projects({...defaults(),libraryRoot:root,engineRoot,dataDir:join(root,'state')});
  });
  afterEach(async () => { await rm(root,{recursive:true,force:true}); });
  it('updates drawing keys, cover, notes and overrides, then restores all files through undo/redo', async () => {
    let initial=await projects.get('video'); initial=await projects.save({id:'video',revision:initial.revision,sceneId:'intro',note:'构图说明',elementId:'账户',element:{kind:'text',baseText:'账户',patch:{x:200,at:'#a'}}});
    const originalJS=await readFile(join(folder,'scenes.js'),'utf8'); const originalConfig=await readFile(join(folder,'video.json'),'utf8');
    const renamed=await projects.rename({id:'video',revision:initial.revision,sceneId:'intro',kind:'scene',to:'开场介绍'});
    expect(renamed.scenes[0].id).toBe('开场介绍'); expect(renamed.studio.scenes.开场介绍.note).toBe('构图说明');
    expect(renamed.studio.scenes.开场介绍.elements.账户.patch.x).toBe(200); expect(renamed.studio.scenes.intro).toBeUndefined();
    expect(JSON.parse(await readFile(join(folder,'video.json'),'utf8')).cover).toBe('开场介绍@end');
    const undo=await projects.history('video','undo',renamed.revision); expect(undo.scenes[0].id).toBe('intro');
    expect(await readFile(join(folder,'scenes.js'),'utf8')).toBe(originalJS); expect(await readFile(join(folder,'video.json'),'utf8')).toBe(originalConfig);
    const redo=await projects.history('video','redo',undo.revision); expect(redo.scenes[0].id).toBe('开场介绍'); expect((await projects.validate('video')).ok).toBe(true);
  });
  it('preserves valid cached audio and timing metadata when renaming a cue, including undo', async () => {
    const engine=await engineModules(engineRoot); const project=engine.loadProject(folder); const scene=project.script.scenes[0];
    const chunks=engine.speechChunks(scene.units,{language:'zh',sentenceGap:project.config.sentenceGap,paragraphGap:project.config.paragraphGap,pace:project.config.pace});
    const metadata={hash:engine.sceneHash(scene,chunks,project.config),id:'intro',duration:1,words:[],chunks:[],marks:{a:0.2}};
    await mkdir(join(folder,'build/voice'),{recursive:true}); const audio=Buffer.from('unchanged-audio-fixture');
    await writeFile(join(folder,'build/voice/intro.wav'),audio); await writeFile(join(folder,'build/voice/intro.json'),JSON.stringify(metadata));
    const initial=await projects.get('video'); expect(initial.scenes[0].cached).toBe(true);
    const next=await projects.rename({id:'video',revision:initial.revision,sceneId:'intro',kind:'marker',from:'a',to:'认识账户'});
    expect(next.scenes[0].cached).toBe(true); expect(next.scenes[0].raw).toContain('[#认识账户]');
    expect(await readFile(join(folder,'build/voice/intro.wav'))).toEqual(audio);
    expect(JSON.parse(await readFile(join(folder,'build/voice/intro.json'),'utf8')).marks).toEqual({'认识账户':0.2});
    const undo=await projects.history('video','undo',next.revision); expect(undo.scenes[0].cached).toBe(true); expect(JSON.parse(await readFile(join(folder,'build/voice/intro.json'),'utf8')).marks).toEqual({a:0.2});
    const sceneRename=await projects.rename({id:'video',revision:undo.revision,sceneId:'intro',kind:'scene',to:'中文场景'});
    expect(sceneRename.scenes[0].cached).toBe(true); expect(await readFile(join(folder,'build/voice/中文场景.wav'))).toEqual(audio);
  });
  it('blocks collisions, stale requests and locked scenes without changing project files', async () => {
    const initial=await projects.get('video');
    await expect(projects.rename({id:'video',revision:initial.revision,sceneId:'intro',kind:'scene',to:'next'})).rejects.toThrow('已存在');
    expect((await projects.get('video')).revision).toBe(initial.revision);
    const locked=await projects.save({id:'video',revision:initial.revision,sceneId:'intro',locked:true});
    await expect(projects.rename({id:'video',revision:initial.revision,sceneId:'intro',kind:'scene',to:'中文'})).rejects.toThrow('其他窗口');
    await expect(projects.rename({id:'video',revision:locked.revision,sceneId:'intro',kind:'scene',to:'中文',origin:'ai'})).rejects.toThrow('锁定');
  });
  it('does not overwrite drawing code edited externally after a rename during undo', async () => {
    const initial=await projects.get('video'); await projects.rename({id:'video',revision:initial.revision,sceneId:'intro',kind:'scene',to:'中文'});
    const file=join(folder,'scenes.js'); const external=(await readFile(file,'utf8'))+'\n// 外部新修改\n'; await writeFile(file,external);
    const current=await projects.get('video'); await expect(projects.history('video','undo',current.revision)).rejects.toThrow('其他窗口');
    expect(await readFile(file,'utf8')).toBe(external); expect((await projects.get('video')).scenes[0].id).toBe('中文');
  });
  it('includes imported submodules in revision conflict detection', async () => {
    await mkdir(join(folder,'parts')); await writeFile(join(folder,'parts/draw.js'),'export function draw(s){s.text("字",{at:"#a"})}');
    await writeFile(join(folder,'scenes.js'),'import {draw} from "./parts/draw.js";export default {intro:draw,next(s){s.text("二",{at:"#b"})}}');
    const initial=await projects.get('video'); await writeFile(join(folder,'parts/draw.js'),'export function draw(s){s.text("外部新内容",{at:"#a"})}');
    await expect(projects.rename({id:'video',revision:initial.revision,sceneId:'intro',kind:'scene',to:'新场景'})).rejects.toThrow('其他窗口');
  });
});
