// Tests for the pure half of the draw animation: which deck->seat flights a
// batch of fresh engine events should produce. DOM flight itself is browser-only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { drawFlightsFor } from '../anim.js';

test('a draw event produces one single-card flight to that player', () => {
  assert.deepEqual(
    drawFlightsFor([{ type: 'draw', player: 2 }]),
    [{ player: 2, count: 1 }]
  );
});

test('a penalty event produces a flight with the full penalty count', () => {
  assert.deepEqual(
    drawFlightsFor([{ type: 'penalty', player: 1, count: 4, cause: 'wild-draw-four' }]),
    [{ player: 1, count: 4 }]
  );
});

test('non-draw events produce no flights', () => {
  assert.deepEqual(
    drawFlightsFor([
      { type: 'play', player: 0, card: { type: 'number' } },
      { type: 'reverse' },
      { type: 'pass', player: 1 },
      { type: 'reshuffle' },
    ]),
    []
  );
});

test('consecutive draws by the same player coalesce into one flight (draw-to-match)', () => {
  assert.deepEqual(
    drawFlightsFor([
      { type: 'draw', player: 0 },
      { type: 'draw', player: 0 },
      { type: 'draw', player: 0 },
    ]),
    [{ player: 0, count: 3 }]
  );
});

test('draws by different players stay separate flights', () => {
  assert.deepEqual(
    drawFlightsFor([
      { type: 'draw', player: 1 },
      { type: 'draw', player: 2 },
    ]),
    [{ player: 1, count: 1 }, { player: 2, count: 1 }]
  );
});

test('a mixed batch keeps order: victim penalty then the next player draws', () => {
  assert.deepEqual(
    drawFlightsFor([
      { type: 'play', player: 0, card: { type: 'draw-two' } },
      { type: 'penalty', player: 1, count: 2, cause: 'draw-two' },
      { type: 'draw', player: 2 },
    ]),
    [{ player: 1, count: 2 }, { player: 2, count: 1 }]
  );
});

// ---- Pile visuals: deck thickness + messy discard stack ----

import { deckDepth, underStack } from '../anim.js';

test('deck depth grows with remaining cards and is clamped', () => {
  assert.equal(deckDepth(0), 0);
  assert.equal(deckDepth(1), 1);
  assert.ok(deckDepth(40) > deckDepth(10));
  assert.equal(deckDepth(108), 8);
  assert.equal(deckDepth(500), 8);
});

test('underStack returns the cards under the top, most recent last', () => {
  const pile = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const under = underStack(pile, 2);
  assert.deepEqual(under.map((u) => u.card.id), ['b', 'c']);
});

test('underStack rotation is deterministic per card id', () => {
  const pile = [{ id: 'c10' }, { id: 'c25' }, { id: 'c99' }];
  const first = underStack(pile, 2);
  const again = underStack(pile, 2);
  assert.deepEqual(first, again);
  for (const u of first) {
    assert.ok(typeof u.rot === 'number');
    assert.ok(u.rot >= -14 && u.rot <= 14);
  }
});

test('underStack of a single-card pile is empty', () => {
  assert.deepEqual(underStack([{ id: 'only' }], 3), []);
});
