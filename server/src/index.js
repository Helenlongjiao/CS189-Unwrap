import './env.js';
import { createSurveyGenerator } from './ai.js';
import { createApp } from './app.js';
import { createPool } from './db.js';
import { createEmbedder } from './embeddings.js';
import { migrate } from './migrate.js';

const port = Number(process.env.PORT) || 4000;
const pool = createPool();
const surveyGenerator = createSurveyGenerator({ apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || undefined, baseUrl: process.env.OPENAI_BASE_URL || undefined });
// Guide meaning search. Keeps the 2-second default timeout so a visitor never waits long.
const embedder = createEmbedder({ apiKey: process.env.OPENAI_API_KEY, baseUrl: process.env.OPENAI_BASE_URL || undefined });

await migrate(pool);
const server = createApp({ pool, surveyGenerator, embedder }).listen(port, () => {
  console.log(`pulse server listening on http://localhost:${port}`);
  console.log(surveyGenerator ? `AI surveys on (${surveyGenerator.model})` : 'AI surveys off: set OPENAI_API_KEY in server/.env');
  console.log(embedder ? `Guide meaning search on (${embedder.model})` : 'Guide meaning search off: keyword search only');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => pool.end().then(() => process.exit(0))));
}
