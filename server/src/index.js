import 'dotenv/config';
import { createApp } from './app.js';
import { createPool } from './db.js';
import { migrate } from './migrate.js';

const port = Number(process.env.PORT) || 4000;
const pool = createPool();

await migrate(pool);
const server = createApp({ pool }).listen(port, () => {
  console.log(`pulse server listening on http://localhost:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => pool.end().then(() => process.exit(0))));
}
