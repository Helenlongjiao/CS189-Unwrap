// Boots Postgres-backed API, then every demo site, then crawls those sites into the page index.
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const port = Number(process.env.PORT) || 4000;
let stopping = false;

async function waitForDb() {
  for (let attempt = 1; attempt <= 30; attempt++) {
    const client = new pg.Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      await client.query('select 1');
      await client.end();
      return;
    } catch (err) {
      try {
        await client.end();
      } catch {
        /* connection never opened */
      }
      if (attempt === 30) throw new Error(`database not ready: ${err.message}`);
      await delay(1000);
    }
  }
}

function run(args) {
  const child = spawn(process.execPath, args, { stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    if (stopping || signal) return;
    shutdown(code ?? 1);
  });
  return child;
}

const kids = [];

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const kid of kids) kid.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

await waitForDb();
kids.push(run(['server/src/index.js']));

let healthy = false;
for (let attempt = 1; attempt <= 40 && !stopping; attempt++) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    if (res.ok) {
      healthy = true;
      break;
    }
  } catch {
    /* still booting */
  }
  await delay(250);
}

if (!healthy) {
  if (!stopping) {
    console.error('API did not become healthy');
    shutdown(1);
  }
  await delay(1000);
  process.exit(1);
}

kids.push(run(['test-site/serve-all.mjs']));

console.log('');
console.log('Pulse is up. Open a demo (each page loads the embed from port 4000):');
console.log('  Skyline Air            http://localhost:5173');
console.log('  Northline              http://localhost:5174');
console.log('  Harbor Credit Union    http://localhost:5175');
console.log('  Westbridge University  http://localhost:5176');
console.log('  Linden Clinic          http://localhost:5177');
console.log(`  API                    http://localhost:${port}/health`);
console.log('');
