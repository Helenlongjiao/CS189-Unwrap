import { describe, expect, it } from 'vitest';
import { DECAY_MS, Ledger, explainScore, patternFamily, pointsLeft, totalScore } from '../src/scoring';

describe('shared scoring', () => {
  it('names a family by the part of the id before the first number', () => {
    expect(patternFamily('hop-3-30s')).toBe('hop');
    expect(patternFamily('back-2-within-2s-30s')).toBe('back');
    expect(patternFamily('clicks')).toBe('clicks');
  });

  it('fades points linearly to zero', () => {
    const e = { id: 'x', weight: 40, at: 0 };
    expect(pointsLeft(e, 0)).toBe(40);
    expect(pointsLeft(e, DECAY_MS / 2)).toBe(20);
    expect(pointsLeft(e, DECAY_MS)).toBe(0);
    expect(pointsLeft(e, DECAY_MS * 3)).toBe(0);
  });

  it('honors a custom decay window', () => {
    expect(pointsLeft({ id: 'x', weight: 30, at: 0 }, 1500, 3000)).toBe(15);
  });

  it('counts one behavior seen at several windows once, at its strongest', () => {
    const now = 1000;
    const score = totalScore(
      [
        { id: 'hop-3-30s', weight: 14, at: now },
        { id: 'hop-4-45s', weight: 16, at: now },
        { id: 'revisit-3-60s', weight: 10, at: now },
      ],
      now,
    );
    expect(score).toBe(26);
  });

  it('lets damping evidence lower the total, but never below zero', () => {
    const now = 0;
    expect(totalScore([{ id: 'a', weight: 40, at: now }, { id: 'responded', weight: -30, at: now }], now)).toBe(10);
    expect(totalScore([{ id: 'a', weight: 10, at: now }, { id: 'responded', weight: -30, at: now }], now)).toBe(0);
  });

  it('explains which evidence produced the points, biggest first', () => {
    const { score, signals } = explainScore(
      [
        { id: 'small', weight: 5, at: 0 },
        { id: 'big', weight: 40, at: 0 },
        { id: 'damp', weight: -20, at: 0 },
      ],
      0,
    );
    expect(score).toBe(25);
    expect(signals).toEqual(['big:40', 'damp:-20', 'small:5']);
  });

  describe('Ledger', () => {
    it('remembers evidence across events and lets it fade', () => {
      const ledger = new Ledger(10_000);
      ledger.add('earlier-click', 20, 0);
      expect(ledger.score(0).score).toBe(20);
      expect(ledger.score(5_000).score).toBe(10);
      expect(ledger.score(10_000).score).toBe(0);
      expect(ledger.active(10_000)).toHaveLength(0);
    });

    it('adds this moment’s evidence without storing it', () => {
      const ledger = new Ledger();
      expect(ledger.score(0, [{ id: 'now', weight: 30, at: 0 }]).score).toBe(30);
      expect(ledger.score(0).score).toBe(0);
    });

    it('replaces remembered evidence that has the same id', () => {
      const ledger = new Ledger();
      ledger.add('burst', 15, 0);
      ledger.add('burst', 15, 1000);
      expect(ledger.active(1000)).toHaveLength(1);
    });
  });
});
