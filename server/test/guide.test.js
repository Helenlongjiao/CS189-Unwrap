import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bestMatches } from '../src/guideMatch.js';

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
