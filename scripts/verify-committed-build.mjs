import { execFileSync } from 'node:child_process';

const changes = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', 'lib'], { encoding: 'utf8' });
if (changes.trim()) {
  console.error('The committed plugin build is stale. Run npm run check and commit every change under lib/.\n' + changes);
  process.exitCode = 1;
} else {
  console.log('The committed plugin build matches the rebuilt runtime.');
}
