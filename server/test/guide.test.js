import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bestMatches, tokens } from '../src/guideMatch.js';

const pages = [
  {
    url: 'http://shop.test/',
    title: 'Home',
    headings: ['Welcome'],
    links: [{ text: 'Help', href: 'http://shop.test/help' }],
    controls: [],
    excerpt: 'Shop the latest arrivals',
  },
  {
    url: 'http://shop.test/help',
    title: 'Help',
    headings: ['Help'],
    links: [{ text: 'Returns', href: 'http://shop.test/help/returns' }],
    controls: [],
    excerpt: 'Orders and support',
  },
  {
    url: 'http://shop.test/help/returns',
    title: 'Returns',
    headings: ['Returns and exchanges'],
    links: [],
    controls: ['Start a return'],
    excerpt: 'Bring items back within 30 days',
  },
];

describe('guide matching', () => {
  it('sends a returns question to the returns page and the clicks that get there', () => {
    const matches = bestMatches('where is the returns policy', pages, 'http://shop.test/', 3);
    assert.equal(matches[0].url, 'http://shop.test/help/returns');
    assert.deepEqual(
      matches[0].steps.map((step) => step.label),
      ['Help', 'Returns'],
    );
  });

  it('sends a specific store question only to the page that mentions that store', () => {
    const site = [
      {
        url: 'http://localhost:5174/',
        title: 'Northline · Home',
        headings: ['Train in what moves with you'],
        links: [
          { text: 'Shop', href: 'http://localhost:5174/shop.html' },
          { text: 'Stores', href: 'http://localhost:5174/stores.html' },
        ],
        controls: [],
        excerpt: 'Shop Stores Help Shop the Align Tight',
      },
      {
        url: 'http://localhost:5174/shop.html',
        title: 'Northline · Shop',
        headings: ['Shop'],
        links: [{ text: 'Shop', href: 'http://localhost:5174/shop.html' }],
        controls: [],
        excerpt: 'Shop Align Tight',
      },
      {
        url: 'http://localhost:5174/stores.html',
        title: 'Northline · Stores',
        headings: ['Stores', 'State Street', 'Abbot Kinney'],
        links: [{ text: 'Stores', href: 'http://localhost:5174/stores.html' }],
        controls: [],
        excerpt: 'State Street Santa Barbara 10am–7pm',
      },
    ];
    const matches = bestMatches('trying to go to state street shop', site, 'http://localhost:5174/', 3);
    assert.deepEqual(matches.map((match) => match.url), ['http://localhost:5174/stores.html']);

    const hours = bestMatches('i want to see state street hours', site, 'http://localhost:5174/', 3);
    assert.deepEqual(hours.map((match) => match.url), ['http://localhost:5174/stores.html']);
  });
});

describe('singular and plural count as the same word', () => {
  it('cuts plural endings, but leaves words that only look plural', () => {
    assert.deepEqual(tokens('Returns & exchanges'), ['return', 'exchange']);
    assert.deepEqual(tokens('stores cards fees policies boxes watches glasses'), ['store', 'card', 'fee', 'policy', 'box', 'watch', 'glass']);
    assert.deepEqual(tokens('status address bus this gas'), ['status', 'address', 'bus', 'gas']);
  });

  const lulu = [
    { url: 'http://lulu.test/', title: 'Home', headings: ['Feel grounded'], links: [], controls: [], excerpt: 'Women Men Stores Help' },
    { url: 'http://lulu.test/returns.html', title: 'Returns', headings: ['Returns & exchanges'], links: [], controls: [], excerpt: 'Unworn items can be returned' },
    { url: 'http://lulu.test/stores.html', title: 'Stores', headings: ['Stores', 'State Street'], links: [], controls: [], excerpt: 'Hours: 10am–7pm daily' },
    { url: 'http://lulu.test/help.html', title: 'Help', headings: ['Help'], links: [], controls: [], excerpt: 'Size guide · Store hours' },
  ];

  it('"exchange" finds the page that says "exchanges"', () => {
    assert.equal(bestMatches('exchange', lulu, 'http://lulu.test/', 3)[0]?.url, 'http://lulu.test/returns.html');
  });

  it('"store near me" puts the Stores page first', () => {
    assert.equal(bestMatches('store near me', lulu, 'http://lulu.test/', 3)[0]?.url, 'http://lulu.test/stores.html');
  });

  it('hours questions still work with plural and singular words', () => {
    assert.equal(bestMatches('when does state street close', lulu, 'http://lulu.test/', 3)[0]?.url, 'http://lulu.test/stores.html');
    assert.equal(bestMatches('store hours', lulu, 'http://lulu.test/', 3)[0]?.url, 'http://lulu.test/stores.html');
    // "closes" is an hours word; after making words singular it must still count as one ("close").
    assert.ok(bestMatches('when does it closes', lulu, 'http://lulu.test/', 3).some((m) => m.url === 'http://lulu.test/stores.html'));
  });
});

// Fake 2-number embeddings. A page made with similarity s to the question [1, 0] gets [s, sqrt(1 - s^2)],
// so its similarity to [1, 0] is exactly s.
const QUESTION = [1, 0];
const near = (s) => [s, Math.sqrt(1 - s * s)];
const air = (path, title, { embedding = null, headings = [title], excerpt = '', links = [] } = {}) => ({
  url: `http://air.test${path}`,
  title,
  headings,
  links,
  controls: [],
  excerpt,
  embedding,
});
const urls = (matches) => matches.map((match) => new URL(match.url).pathname);

describe('guide matching with meaning search', () => {
  // The plan's example 1: "luggage" on a Southwest-like site. No page has the word.
  const luggageSite = [
    air('/', 'Home', { embedding: near(0.1), links: [{ text: 'Bags', href: 'http://air.test/bags.html' }] }),
    air('/bags.html', 'Bags', { embedding: near(0.62), excerpt: 'First two checked bags are free' }),
    air('/check-in.html', 'Check in', { embedding: near(0.41) }),
    air('/help.html', 'Help', { embedding: near(0.33) }),
    air('/seats.html', 'Boarding', { embedding: near(0.25) }),
    air('/checkout.html', 'Payment', { embedding: near(0.18) }),
  ];

  it('A1. finds pages by meaning when no page has the word, closest first', () => {
    assert.deepEqual(bestMatches('luggage', luggageSite, 'http://air.test/', 3), [], 'keywords alone find nothing');
    const matches = bestMatches('luggage', luggageSite, 'http://air.test/', 3, { queryEmbedding: QUESTION });
    assert.deepEqual(urls(matches), ['/bags.html', '/check-in.html', '/help.html']);
    assert.deepEqual(matches[0].steps.map((step) => step.label), ['Bags'], 'still shows the clicks to get there');
  });

  it('A1. gives pages found only by meaning their own reason line', () => {
    const [bags] = bestMatches('luggage', luggageSite, 'http://air.test/', 3, { queryEmbedding: QUESTION });
    assert.equal(bags.reason, 'Closest match on this site.');
  });

  it('A2. the cutoff removes pages below 0.3, so an unrelated question shows nothing', () => {
    const matches = bestMatches('luggage', luggageSite, 'http://air.test/', 6, { queryEmbedding: QUESTION });
    assert.deepEqual(urls(matches), ['/bags.html', '/check-in.html', '/help.html'], 'Boarding (0.25) and Payment (0.18) are removed');
    const unrelated = bestMatches('pet insurance', luggageSite, 'http://air.test/', 3, { queryEmbedding: [-1, 0] });
    assert.deepEqual(unrelated, []);
  });

  it('lets the quiz script try a different cutoff without changing the default', () => {
    const at = (minSimilarity) => urls(bestMatches('luggage', luggageSite, 'http://air.test/', 6, { queryEmbedding: QUESTION, minSimilarity }));
    assert.deepEqual(at(0.4), ['/bags.html', '/check-in.html']);
    assert.deepEqual(at(0.2), ['/bags.html', '/check-in.html', '/help.html', '/seats.html']);
    assert.deepEqual(at(undefined), ['/bags.html', '/check-in.html', '/help.html'], 'default is still 0.3');
  });

  it('A3. RRF puts a page that is high in both lists above a page that is #1 in only one', () => {
    const site = [
      // Keyword #1 (word in title), but unrelated by meaning.
      air('/refund-policy.html', 'Refund policy', { embedding: near(0) }),
      // Keyword #2 (word only in its text), and meaning #1.
      air('/returns.html', 'Returns', { embedding: near(0.9), excerpt: 'Start a refund here' }),
      // Not a keyword match; meaning #2.
      air('/orders.html', 'Orders', { embedding: near(0.7) }),
    ];
    assert.deepEqual(urls(bestMatches('refund', site, 'http://air.test/', 3)), ['/refund-policy.html', '/returns.html']);
    const matches = bestMatches('refund', site, 'http://air.test/', 3, { queryEmbedding: QUESTION });
    // Returns: 1/62 + 1/61 = 0.0325, Refund policy: 1/61 = 0.0164, Orders: 1/62 = 0.0161
    assert.deepEqual(urls(matches), ['/returns.html', '/refund-policy.html', '/orders.html']);
  });

  it('A4. exact words win a tie: the keyword #1 stays first when the lists disagree evenly', () => {
    const site = [
      air('/size-guide.html', 'Size guide', { embedding: near(0.8) }),
      air('/help.html', 'Help', { embedding: near(0.95), excerpt: 'Size guide, returns and store hours' }),
    ];
    // Keyword list: Size guide, Help. Meaning list: Help, Size guide. Both score 1/61 + 1/62.
    const matches = bestMatches('size guide', site, 'http://air.test/', 3, { queryEmbedding: QUESTION });
    assert.deepEqual(urls(matches), ['/size-guide.html', '/help.html']);
  });

  it('A5. with no question embedding, results are exactly the same as keyword search today', () => {
    const withEmbeddings = pages.map((page, i) => ({ ...page, embedding: near(0.5 + i / 10) }));
    for (const query of ['where is the returns policy', 'help', 'luggage']) {
      const today = bestMatches(query, pages, 'http://shop.test/', 3);
      assert.deepEqual(bestMatches(query, withEmbeddings, 'http://shop.test/', 3), today);
      assert.deepEqual(bestMatches(query, withEmbeddings, 'http://shop.test/', 3, { queryEmbedding: null }), today);
    }
  });

  it('A6. a page saved without an embedding is still found by keywords, and nothing crashes', () => {
    const site = [
      air('/returns.html', 'Returns', { embedding: null }),
      air('/help.html', 'Help', { embedding: near(0.9) }),
      air('/orders.html', 'Orders', { embedding: [] }),
    ];
    const matches = bestMatches('returns', site, 'http://air.test/', 3, { queryEmbedding: QUESTION });
    assert.deepEqual(urls(matches), ['/returns.html', '/help.html']);
    assert.notEqual(matches[0].reason, 'Closest match on this site.', 'a keyword match keeps its usual reason');
  });
});
