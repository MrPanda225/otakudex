import { describe, expect, it } from 'vitest';
import {
  applyDuelAnswer,
  computeScore,
  maxDuels,
  nextOpponentIndex,
  startInsertionSearch,
  tierOfScore,
  type DuelAnswer,
} from '../shared/ranking.ts';

/** Plays a whole search against a list ordered best to worst, using `isBetter(opponentIndex)`. */
function playSearch(size: number, answerFor: (opponentIndex: number) => DuelAnswer) {
  let search = startInsertionSearch(size);
  let duels = 0;
  for (let opponent = nextOpponentIndex(search); opponent !== null; opponent = nextOpponentIndex(search)) {
    search = applyDuelAnswer(search, opponent, answerFor(opponent));
    duels += 1;
  }
  return { insertionIndex: search.low, duels };
}

describe('binary insertion search', () => {
  it('needs no duel for an empty bucket and puts the entry first', () => {
    expect(playSearch(0, () => 'better')).toEqual({ insertionIndex: 0, duels: 0 });
  });

  it('finds every possible insertion index within the duel limit', () => {
    for (let size = 0; size <= 40; size += 1) {
      for (let target = 0; target <= size; target += 1) {
        // The new entry belongs at `target`: it beats every opponent at index >= target.
        const { insertionIndex, duels } = playSearch(size, (opponent) =>
          opponent >= target ? 'better' : 'worse',
        );
        expect(insertionIndex).toBe(target);
        expect(duels).toBeLessThanOrEqual(maxDuels(size));
      }
    }
  });

  it('places a tie directly below the opponent', () => {
    const { insertionIndex } = playSearch(5, () => 'tie');
    expect(insertionIndex).toBe(3); // first opponent is index 2; a tie lands at 2 + 1
  });

  it('matches the documented example: 5 ranked entries need at most 3 duels', () => {
    expect(maxDuels(5)).toBe(3);
    expect(maxDuels(0)).toBe(0);
    expect(maxDuels(1)).toBe(1);
  });
});

describe('score and tier', () => {
  it('gives the top of the range to the best entry and the bottom to the worst', () => {
    expect(computeScore('loved', 0, 4)).toBe(100);
    expect(computeScore('loved', 3, 4)).toBe(70);
    expect(computeScore('liked', 0, 3)).toBe(69);
    expect(computeScore('liked', 2, 3)).toBe(40);
    expect(computeScore('meh', 0, 2)).toBe(39);
    expect(computeScore('meh', 1, 2)).toBe(0);
  });

  it('gives a lone entry the top of its range', () => {
    expect(computeScore('loved', 0, 1)).toBe(100);
    expect(computeScore('meh', 0, 1)).toBe(39);
  });

  it('keeps scores strictly ordered within a bucket of up to 31 entries', () => {
    const scores = Array.from({ length: 31 }, (_, index) => computeScore('loved', index, 31));
    for (let index = 1; index < scores.length; index += 1) {
      expect(scores[index]!).toBeLessThanOrEqual(scores[index - 1]!);
    }
  });

  it('derives tiers from the documented thresholds', () => {
    expect(tierOfScore(100)).toBe('S');
    expect(tierOfScore(90)).toBe('S');
    expect(tierOfScore(89)).toBe('A');
    expect(tierOfScore(75)).toBe('A');
    expect(tierOfScore(74)).toBe('B');
    expect(tierOfScore(60)).toBe('B');
    expect(tierOfScore(59)).toBe('C');
    expect(tierOfScore(40)).toBe('C');
    expect(tierOfScore(39)).toBe('D');
    expect(tierOfScore(0)).toBe('D');
  });
});
