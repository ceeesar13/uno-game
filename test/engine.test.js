// Deterministic engine tests. Run with `node --test` (no dependencies, no build).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COLORS,
  createDeck,
  createInitialState,
  isValidPlay,
  canPlayWildDrawFour,
  getValidPlays,
  topOfDiscard,
  playCard,
  chooseColor,
  drawForCurrent,
  passTurn,
  absorbPending,
  runCpuTurn,
  buildOpponents,
  replay,
  snapshot,
  shuffleDeck,
  hashSeed,
} from '../engine.js';

const CONFIG = (seed, rules) => ({
  humanName: 'Test',
  opponents: buildOpponents(3),
  seed,
  rules,
});

// A deterministic auto-player so we can drive a whole game to completion the
// same way every time. Picks the first legal move; handles colour selection,
// stacked penalties and the draw-then-play rule.
function autoStep(state) {
  if (state.phase === 'game-over') return state;

  if (state.phase === 'color-selection') {
    // Choose the colour the player holds most of (stable, deterministic).
    const hand = state.players[state.pendingPlayer].hand;
    const counts = { red: 0, blue: 0, green: 0, yellow: 0 };
    for (const c of hand) if (c.color) counts[c.color] += 1;
    const color = COLORS.reduce((b, c) => (counts[c] > counts[b] ? c : b), 'red');
    return chooseColor(state, color);
  }

  const idx = state.currentPlayer;

  if (state.pendingDraw > 0) {
    const stackable = getValidPlays(state, idx);
    if (stackable.length) return playCard(state, idx, stackable[0].id);
    return absorbPending(state);
  }

  const valid = getValidPlays(state, idx);
  if (valid.length) return playCard(state, idx, valid[0].id);

  if (!state.hasDrawn) return drawForCurrent(state);

  // Just drew — play the drawn card if legal, else pass.
  const afterDraw = getValidPlays(state, idx);
  const hand = state.players[idx].hand;
  const last = hand[hand.length - 1];
  if (afterDraw.some((c) => c.id === last.id)) return playCard(state, idx, last.id);
  return passTurn(state);
}

function playToEnd(config, maxSteps = 5000) {
  let state = createInitialState(config);
  let steps = 0;
  while (state.phase !== 'game-over' && steps < maxSteps) {
    state = autoStep(state);
    steps++;
  }
  return { state, steps };
}

test('deck has the standard 108 cards', () => {
  const deck = createDeck();
  assert.equal(deck.length, 108);
  assert.equal(deck.filter((c) => c.type === 'wild').length, 4);
  assert.equal(deck.filter((c) => c.type === 'wild-draw-four').length, 4);
  assert.equal(deck.filter((c) => c.type === 'number' && c.value === 0).length, 4);
});

test('shuffle is a pure permutation driven by the seed', () => {
  const deck = createDeck();
  const a = shuffleDeck(deck, hashSeed('abc'));
  const b = shuffleDeck(deck, hashSeed('abc'));
  assert.deepEqual(a.deck.map((c) => c.id), b.deck.map((c) => c.id));
  assert.equal(a.deck.length, deck.length);
  // same multiset, different order
  assert.deepEqual([...a.deck.map((c) => c.id)].sort(), [...deck.map((c) => c.id)].sort());
});

test('same seed produces an identical initial deal', () => {
  const s1 = createInitialState(CONFIG('seed-42'));
  const s2 = createInitialState(CONFIG('seed-42'));
  assert.deepEqual(snapshot(s1), snapshot(s2));
});

test('different seeds usually deal differently', () => {
  const a = snapshot(createInitialState(CONFIG('seed-A')));
  const b = snapshot(createInitialState(CONFIG('seed-B')));
  assert.notDeepEqual(a, b);
});

test('the first discard is always a number card', () => {
  for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
    const s = createInitialState(CONFIG(seed));
    assert.equal(topOfDiscard(s).type, 'number');
  }
});

test('isValidPlay respects colour, value, symbol and wilds', () => {
  const top = { id: 't', color: 'red', type: 'number', value: 5 };
  assert.equal(isValidPlay({ color: 'red', type: 'number', value: 9 }, 'red', top), true); // colour
  assert.equal(isValidPlay({ color: 'blue', type: 'number', value: 5 }, 'red', top), true); // value
  assert.equal(isValidPlay({ color: 'blue', type: 'number', value: 3 }, 'red', top), false);
  assert.equal(isValidPlay({ color: null, type: 'wild', value: null }, 'red', top), true);
  const skipTop = { id: 't', color: 'red', type: 'skip', value: null };
  assert.equal(isValidPlay({ color: 'blue', type: 'skip', value: null }, 'red', skipTop), true); // symbol
});

test('wild draw four is illegal while holding the active colour', () => {
  const hand = [{ color: 'red', type: 'number', value: 1 }, { color: null, type: 'wild-draw-four' }];
  assert.equal(canPlayWildDrawFour(hand, 'red'), false);
  assert.equal(canPlayWildDrawFour(hand, 'blue'), true);
});

test('a full auto-played game is deterministic for a seed', () => {
  const first = playToEnd(CONFIG('game-seed-1'));
  const second = playToEnd(CONFIG('game-seed-1'));
  assert.equal(first.state.phase, 'game-over');
  assert.equal(first.steps, second.steps);
  assert.deepEqual(snapshot(first.state), snapshot(second.state));
  assert.equal(first.state.winner, second.state.winner);
});

test('replaying the recorded move log reproduces the exact final state', () => {
  const { state } = playToEnd(CONFIG('replay-seed-7'));
  const replayed = replay(CONFIG('replay-seed-7'), state.log);
  assert.deepEqual(snapshot(replayed), snapshot(state));
  assert.equal(replayed.winner, state.winner);
});

test('replay holds across several seeds', () => {
  for (const seed of ['x1', 'x2', 'x3', 'x4', 'x5']) {
    const { state } = playToEnd(CONFIG(seed));
    const replayed = replay(CONFIG(seed), state.log);
    assert.deepEqual(snapshot(replayed), snapshot(state), `seed ${seed} failed replay`);
  }
});

test('history records a start event and grows with play', () => {
  const s0 = createInitialState(CONFIG('hist-1'));
  assert.equal(s0.history[0].type, 'start');
  const { state } = playToEnd(CONFIG('hist-1'));
  assert.ok(state.history.some((e) => e.type === 'play'));
  assert.ok(state.history.some((e) => e.type === 'win'));
});

test('draw-two makes the next player draw and lose the turn (classic rules)', () => {
  // Construct a controlled state.
  let s = createInitialState(CONFIG('effect-1'));
  s = {
    ...s,
    currentColor: 'red',
    discardPile: [{ id: 'top', color: 'red', type: 'number', value: 3 }],
    players: s.players.map((p, i) =>
      i === 0 ? { ...p, hand: [{ id: 'd2', color: 'red', type: 'draw-two', value: null }, { id: 'k', color: 'red', type: 'number', value: 1 }] } : p
    ),
  };
  const before = s.players[1].hand.length;
  const next = playCard(s, 0, 'd2');
  assert.equal(next.players[1].hand.length, before + 2);
  assert.equal(next.currentPlayer, 2); // player 1 was skipped
});

test('stacking house rule accumulates draw penalties', () => {
  let s = createInitialState(CONFIG('stack-1', { stacking: true }));
  s = {
    ...s,
    currentColor: 'red',
    currentPlayer: 0,
    discardPile: [{ id: 'top', color: 'red', type: 'number', value: 3 }],
    players: s.players.map((p, i) => {
      if (i === 0) return { ...p, hand: [{ id: 'a2', color: 'red', type: 'draw-two', value: null }, { id: 'x', color: 'red', type: 'number', value: 1 }] };
      if (i === 1) return { ...p, hand: [{ id: 'b2', color: 'blue', type: 'draw-two', value: null }, { id: 'y', color: 'green', type: 'number', value: 4 }] };
      return p;
    }),
  };
  const afterFirst = playCard(s, 0, 'a2');
  assert.equal(afterFirst.pendingDraw, 2);
  assert.equal(afterFirst.currentPlayer, 1);
  // Player 1 stacks their own +2.
  const afterStack = playCard(afterFirst, 1, 'b2');
  assert.equal(afterStack.pendingDraw, 4);
  assert.equal(afterStack.currentPlayer, 2);
  // Player 2 has no +2 → absorbs 4 and is skipped.
  const before2 = afterStack.players[2].hand.length;
  const absorbed = absorbPending(afterStack);
  assert.equal(absorbed.players[2].hand.length, before2 + 4);
  assert.equal(absorbed.pendingDraw, 0);
});

test('every auto game terminates within a sane step budget', () => {
  for (const seed of ['t1', 't2', 't3', 't4', 't5', 't6']) {
    const { state, steps } = playToEnd(CONFIG(seed));
    assert.equal(state.phase, 'game-over', `seed ${seed} did not finish`);
    assert.ok(steps < 5000);
  }
});

test('drawToMatch keeps drawing until a play exists then plays it', () => {
  const { state } = playToEnd(CONFIG('dtm-1', { drawToMatch: true }));
  assert.equal(state.phase, 'game-over');
});
