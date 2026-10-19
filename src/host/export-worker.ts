import { mkdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { engineModules, previewData } from './engine.ts';

const [root, folder, action, original, workers = '2'] = process.argv.slice(2);
try {
  const engine = await engineModules(root);
  for (const key of ['MIMO_API_KEY', 'ELEVENLABS_API_KEY']) {
    const value = engine.findEnv(key, original, root);
    if (value) process.env[key] = value;
  }
  const data = await previewData(root, folder);
  const total = data.project.script.scenes.length;
  const voiced = new Set<string>(data.cached);
  const progress = (percent: number, phase: string) => process.stdout.write(`@explainroo-progress ${JSON.stringify({ progress: percent, phase })}\n`);
  const log = (line: string) => {
    if (/^rendering /.test(line)) progress(35, 'render');
    if (/^frames done/.test(line)) progress(95, 'render');
    const voice = /^voice (\S+):/.exec(line);
    if (voice) { voiced.add(voice[1]); progress(Math.round(35 * voiced.size / total), 'voice'); }
    const frames = /frames (\d+)\/(\d+)/.exec(line);
    if (frames) progress(35 + Math.round(60 * Number(frames[1]) / Number(frames[2])), 'render');
    process.stdout.write(line + '\n');
  };
  await mkdir(join(folder, 'out'), { recursive: true });
  if (action === 'sheet') {
    progress(15, 'sheet');
    await engine.ensureFonts(data.project.config.language, { log });
    const times = data.timeline.scenes.map((scene: any) => scene.start + Math.max(0, scene.dur - 0.12));
    const labels = data.timeline.scenes.map((scene: any) => scene.id);
    const file = join(folder, 'out', 'storyboard.jpg');
    await engine.withEngine(data.project, data.timeline, { scale: 0.5, log }, (page: any) => page.evaluate((options: any) => (window as any).explainroo.sheet(options), { times, labels, cols: Math.min(total, total > 20 ? 6 : total > 9 ? 5 : 4), thumb: data.timeline.width >= data.timeline.height ? 320 : 200, path: relative(folder, file).replaceAll('\\', '/') }));
    progress(100, 'finished');
  } else {
    progress(voiced.size === total ? 35 : Math.round(35 * voiced.size / total), voiced.size === total ? 'render' : 'voice');
    await engine.render(data.project, { workers: Number(workers), out: join(folder, 'out', 'video.mp4'), log });
    progress(100, 'finished');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
}
