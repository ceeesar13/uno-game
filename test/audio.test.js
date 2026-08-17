// Tests for the pure half of the sound design: which sound plays for which
// game moment. Synthesis itself is browser-only and out of scope here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sfxForCard, snapshotOf, transitionSounds } from '../audio.js';

// ---- sfxForCard: card type -> sound name ----

test('number cards map to the base play snap', () => {
  assert.equal(sfxForCard({ type: 'number', color: 'red', value: 7 }), 'play');
});

test('each special card maps to its own sound', () => {
  assert.equal(sfxForCard({ type: 'draw-two', color: 'blue' }), 'drawTwo');
  assert.equal(sfxForCard({ type: 'wild-draw-four', color: null }), 'drawFour');
  assert.equal(sfxForCard({ type: 'skip', color: 'green' }), 'skip');
  assert.equal(sfxForCard({ type: 'reverse', color: 'yellow' }), 'reverse');
  assert.equal(sfxForCard({ type: 'wild', color: null }), 'wild');
});

// ---- transitionSounds: state snapshot deltas -> ambient/emotional cues ----

function snap(over) {
  return { phase: 'turn', currentPlayer: 1, winner: null, handCounts: [7, 7], ...over };
}

test('turn chime fires when the turn passes to the human', () => {
  const sounds = transitionSounds(snap({ currentPlayer: 2 }), snap({ currentPlayer: 0 }));
  assert.ok(sounds.includes('turn'));
});

test('no turn chime while the turn stays with bots', () => {
  const sounds = transitionSounds(snap({ currentPlayer: 1 }), snap({ currentPlayer: 2 }));
  assert.ok(!sounds.includes('turn'));
});

test('no turn chime when nothing changed', () => {
  assert.deepEqual(transitionSounds(snap({ currentPlayer: 0 }), snap({ currentPlayer: 0 })), []);
});

test('tension sting fires when any hand drops to exactly one card', () => {
  const sounds = transitionSounds(
    snap({ handCounts: [7, 2] }),
    snap({ handCounts: [7, 1] })
  );
  assert.ok(sounds.includes('tension'));
});

test('no tension sting when a hand grows back from one', () => {
  const sounds = transitionSounds(
    snap({ handCounts: [7, 1] }),
    snap({ handCounts: [7, 3] })
  );
  assert.ok(!sounds.includes('tension'));
});

test('human victory plays the win fanfare', () => {
  const sounds = transitionSounds(
    snap(),
    snap({ phase: 'game-over', winner: 0 })
  );
  assert.ok(sounds.includes('win'));
  assert.ok(!sounds.includes('lose'));
});

test('bot victory plays the lose cue', () => {
  const sounds = transitionSounds(
    snap(),
    snap({ phase: 'game-over', winner: 2 })
  );
  assert.ok(sounds.includes('lose'));
  assert.ok(!sounds.includes('win'));
});

test('game-over cue fires only on the transition, not on re-renders', () => {
  const over = snap({ phase: 'game-over', winner: 0 });
  assert.deepEqual(transitionSounds(over, over), []);
});

// ---- snapshotOf: reduce full engine state to what transitions need ----

test('snapshotOf captures phase, current player, winner, and hand sizes', () => {
  const state = {
    phase: 'turn',
    currentPlayer: 2,
    winner: null,
    players: [{ hand: [1, 2, 3] }, { hand: [1] }, { hand: [1, 2] }],
    deck: ['ignored'],
  };
  assert.deepEqual(snapshotOf(state), {
    phase: 'turn',
    currentPlayer: 2,
    winner: null,
    handCounts: [3, 1, 2],
  });
});
