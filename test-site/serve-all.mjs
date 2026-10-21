// Starts every demo site and crawls them into the page index.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sites = [
  { port: 5173, root: 'test-site/public', name: 'Skyline Air' },
  { port: 5174, root: 'test-site/northline', name: 'Northline' },
  { port: 5175, root: 'test-site/harbor', name: 'Harbor Credit Union' },
  { port: 5176, root: 'test-site/westbridge', name: 'Westbridge University' },
  { port: 5177, root: 'test-site/linden', name: 'Linden Clinic' },
];

const kids = sites.map((site) =>
  spawn(process.execPath, [path.join(repo, 'test-site/server.mjs')], {
    cwd: repo,
    env: {
      ...process.env,
      TEST_SITE_PORT: String(site.port),
      TEST_SITE_ROOT: path.join(repo, site.root),
      TEST_SITE_NAME: site.name,
    },
    stdio: 'inherit',
  }),
);

async function ready(port) {
  for (let i = 0; i < 25; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/`);
      if (res.ok) return;
    } catch {
      /* still booting */
    }
    await delay(200);
  }
  throw new Error(`site on port ${port} did not start`);
}

await Promise.all(sites.map((site) => ready(site.port)));
const crawl = spawn(process.execPath, [path.join(repo, 'server/src/crawl.js'), ...sites.map((site) => `http://localhost:${site.port}`)], {
  cwd: repo,
  stdio: 'inherit',
});
kids.push(crawl);

const stop = () => {
  for (const kid of kids) kid.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
