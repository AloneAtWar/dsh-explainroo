import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stableProject, writeProjectTransaction } from '../src/host/transaction.ts';
describe('recoverable project writes', () => {
  it('recovers an interrupted multi-file rename before exposing the project', async () => {
    const root=await mkdtemp(join(tmpdir(),'explainroo-journal-'));
    try {
      await mkdir(join(root,'.explainroo')); await writeFile(join(root,'script.md'),'new'); await writeFile(join(root,'scenes.js'),'old-js');
      const entry=(name:string,before:string,after:string)=>({name,before:Buffer.from(before).toString('base64'),after:Buffer.from(after).toString('base64')});
      await writeFile(join(root,'.explainroo/pending-edit.json'),JSON.stringify({version:1,entries:[entry('script.md','old','new'),entry('scenes.js','old-js','new-js')]}));
      await stableProject(root); expect(await readFile(join(root,'script.md'),'utf8')).toBe('old'); expect(await readFile(join(root,'scenes.js'),'utf8')).toBe('old-js');
      await expect(readFile(join(root,'.explainroo/pending-edit.json'))).rejects.toThrow();
    } finally { await rm(root,{recursive:true,force:true}); }
  });
  it('rejects unsafe paths and stale expected content before writing anything', async () => {
    const root=await mkdtemp(join(tmpdir(),'explainroo-journal-'));
    try {
      await writeFile(join(root,'script.md'),'old');
      await expect(writeProjectTransaction(root,{'script.md':'new','../scenes.js':'bad'})).rejects.toThrow();
      await expect(writeProjectTransaction(root,{'script.md':'new'},{'script.md':'stale'})).rejects.toThrow('其他窗口');
      expect(await readFile(join(root,'script.md'),'utf8')).toBe('old');
    } finally { await rm(root,{recursive:true,force:true}); }
  });
});
