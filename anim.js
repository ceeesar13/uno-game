// ==== DRAW-ANIMATION PLANNING ====
// Pure: given a batch of fresh engine history events, decide which
// deck-to-seat card flights to show. The DOM flight itself lives in game.js.

/**
 * Flights for a batch of events, in order:
 * - 'draw'    -> one card to that player (consecutive draws by the same player
 *                coalesce into one multi-card flight, e.g. draw-to-match)
 * - 'penalty' -> the full penalty count to the victim (+2 / +4 / stacks)
 * Returns [{ player, count }].
 */
export function drawFlightsFor(events) {
  const out = [];
  for (const e of events) {
    if (e.type === 'draw') {
      const last = out[out.length - 1];
      if (last && last.merge && last.player === e.player) {
        last.count += 1;
      } else {
        out.push({ player: e.player, count: 1, merge: true });
      }
    } else if (e.type === 'penalty') {
      out.push({ player: e.player, count: e.count, merge: false });
    }
  }
  return out.map(({ player, count }) => ({ player, count }));
}

/**
 * Visual thickness of the draw pile: 0 when empty, up to 8 stacked edges for a
 * full deck. One edge per ~14 cards keeps the change readable turn to turn.
 */
export function deckDepth(remaining) {
  if (remaining <= 0) return 0;
  return Math.max(1, Math.min(8, Math.ceil(remaining / 14)));
}

/**
 * The messy discard stack: up to `max` cards under the top one, oldest first.
 * Rotation is derived from each card's id so the pile is stable across
 * re-renders (a random angle would make it wiggle every turn).
 */
export function underStack(pile, max) {
  const under = pile.slice(Math.max(0, pile.length - 1 - max), pile.length - 1);
  return under.map((card) => {
    let h = 0;
    for (let i = 0; i < card.id.length; i++) h = (h * 31 + card.id.charCodeAt(i)) >>> 0;
    return { card, rot: (h % 29) - 14 };
  });
}
