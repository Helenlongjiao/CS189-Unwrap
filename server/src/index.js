import './env.js';
import { createSurveyGenerator } from './ai.js';
import { createApp } from './app.js';
import { createPool } from './db.js';
import { migrate } from './migrate.js';

const port = Number(process.env.PORT) || 4000;
const pool = createPool();
const surveyGenerator = createSurveyGenerator({ apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || undefined });

await migrate(pool);
const server = createApp({ pool, surveyGenerator }).listen(port, () => {
  console.log(`pulse server listening on http://localhost:${port}`);
  console.log(surveyGenerator ? `AI surveys on (${surveyGenerator.model})` : 'AI surveys off: set OPENAI_API_KEY in server/.env');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => pool.end().then(() => process.exit(0))));
}
