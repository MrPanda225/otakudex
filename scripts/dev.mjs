// Starts the API server (restarts on change) and the Vite dev server together; Ctrl+C stops both.
// Node and Vite are launched directly, not through npm, so a stop signal reaches the real processes.
import { spawn } from 'node:child_process';

const processes = [
  { name: 'api', args: ['--watch-path=server', '--watch-path=shared', 'server/main.ts'] },
  { name: 'web', args: ['node_modules/vite/bin/vite.js'] },
];

const children = processes.map(({ name, args }) => {
  const child = spawn(process.execPath, args, { stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    console.log(`[${name}] stopped (${signal ?? `code ${code}`})`);
    stopAll();
  });
  return child;
});

function stopAll() {
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
}

process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
