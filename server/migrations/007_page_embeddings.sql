-- Meaning-search vector for each crawled page (OpenAI text-embedding-3-small, 1,536 numbers).
-- Null until the crawler embeds the page, or when no OpenAI key is set; the guide then uses keywords only.
-- Sites have at most 40 pages, so the server compares vectors in code and pgvector isn't needed.
alter table page_index add column if not exists embedding real[];
