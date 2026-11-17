/**
 * Turns texts into embeddings (lists of numbers that capture meaning) with OpenAI.
 * Returns null when no API key is configured, so the guide falls back to keyword search.
 * `embed` throws on an error or timeout; callers catch it and use keywords only.
 */
export function createEmbedder({
  apiKey,
  model = 'text-embedding-3-small',
  baseUrl = 'https://api.openai.com/v1',
  timeoutMs = 2_000,
  fetchImpl = fetch,
} = {}) {
  if (!apiKey) return null;
  return {
    model,
    /** One request for all texts; the result is in the same order as `texts`. */
    async embed(texts) {
      const res = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/embeddings`, {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: texts }),
      });
      if (!res.ok) throw new Error(`OpenAI responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const { data } = await res.json();
      return [...data].sort((a, b) => a.index - b.index).map((item) => item.embedding);
    },
  };
}
