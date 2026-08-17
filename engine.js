// ==== ENGINE ====
// Pure game rules for N players (2-4). No DOM access lives here.
// Players are an ordered array; index 0 is always the human.
//
// Everything random is driven by a seeded PRNG whose state travels inside the
// game state, so the same seed + the same sequence of moves always reproduces
// the same final state. That is what makes replay and shareable challenges
// honest instead of decorative.
//
// Two logs are kept on the state:
//   - `history`: structured, human-readable events (for the on-screen log and
//     screen-reader announcements). The UI turns these into sentences.
//   - `log`: the canonical list of decisions (play / draw / pass / color). This
//     is what `replay()` consumes to rebuild a game deterministically.

/**
 * @typedef {'red'|'blue'|'green'|'yellow'} Color
 * @typedef {'number'|'skip'|'reverse'|'draw-two'|'wild'|'wild-draw-four'} CardType
 * @typedef {{ id:string, color:Color|null, type:CardType, value:number|null }} Card
 */

export const COLORS = ['red', 'blue', 'green', 'yellow'];

// ---- Seeded PRNG (mulberry32). State is a uint32 carried in game state. ----

/** Hash an arbitrary seed string into a uint32 starting state. */
export function hashSeed(str) {
  let h = 1779033703 ^ String(str).length;
  for (let i = 0; i < String(str).length; i++) {
    h = Math.imul(h ^ String(str).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^ (h >>> 16)) >>> 0;
}

/** Advance the PRNG. Returns { value in [0,1), state }. Pure. */
export function rngNext(state) {
  let s = state | 0;
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: s >>> 0 };
}

// ---- Deck ----

function createCard(id, color, type, value) {
  return { id, color, type, value };
}

export function createDeck() {
  const deck = [];
  let idCounter = 0;

  for (const color of COLORS) {
    deck.push(createCard(`c${idCounter++}`, color, 'number', 0));
    for (let n = 1; n <= 9; n++) {
      deck.push(createCard(`c${idCounter++}`, color, 'number', n));
      deck.push(createCard(`c${idCounter++}`, color, 'number', n));
    }
    for (let i = 0; i < 2; i++) {
      deck.push(createCard(`c${idCounter++}`, color, 'skip', null));
      deck.push(createCard(`c${idCounter++}`, color, 'reverse', null));
      deck.push(createCard(`c${idCounter++}`, color, 'draw-two', null));
    }
  }

  for (let i = 0; i < 4; i++) {
    deck.push(createCard(`c${idCounter++}`, null, 'wild', null));
    deck.push(createCard(`c${idCounter++}`, null, 'wild-draw-four', null));
  }

  return deck;
}

/** Fisher–Yates using the seeded PRNG. Returns { deck, rngState }. Pure. */
export function shuffleDeck(deck, rngState) {
  const shuffled = [...deck];
  let s = rngState;
  for (let i = shuffled.length - 1; i > 0; i--) {
    const r = rngNext(s);
    s = r.state;
    const j = Math.floor(r.value * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return { deck: shuffled, rngState: s };
}

// Wilds may carry a chosen colour while on the discard pile. When they go back
// into the deck we must strip that colour, or they'd stay "coloured".
function stripWildColor(card) {
  if ((card.type === 'wild' || card.type === 'wild-draw-four') && card.color) {
    return { ...card, color: null };
  }
  return card;
}

function mod(n, m) {
  return ((n % m) + m) % m;
}

export function nextIndexFrom(idx, direction, count, steps) {
  return mod(idx + direction * steps, count);
}

function giveCards(players, idx, cards) {
  return players.map((p, i) => (i === idx ? { ...p, hand: [...p.hand, ...cards] } : p));
}

// ---- History / move logging (pure helpers) ----

function logEvent(state, event) {
  const seq = state.seq + 1;
  return { ...state, seq, history: [...state.history, { seq, ...event }] };
}

function logMove(state, move) {
  return { ...state, log: [...state.log, move] };
}

// ---- Initial state ----

/**
 * @param {{ humanName:string, opponents:Array, seed?:string, rules?:object }} config
 */
export function createInitialState(config) {
  const seed = config.seed != null ? String(config.seed) : String(hashSeed('' + Math.random()));
  const rules = normalizeRules(config.rules);

  let rngState = hashSeed(seed);
  let shuffled = shuffleDeck(createDeck(), rngState);
  let deck = shuffled.deck;
  rngState = shuffled.rngState;

  const players = [{ id: 'you', name: config.humanName, isHuman: true, hand: [] }];
  for (const opp of config.opponents) {
    players.push({ ...opp, isHuman: false, hand: [] });
  }

  for (const player of players) {
    player.hand = deck.splice(0, 7);
  }

  // First discard must be a number card. Re-shuffle (advancing the PRNG) until so.
  let firstCard = deck.pop();
  while (firstCard.type !== 'number') {
    deck.unshift(firstCard);
    const res = shuffleDeck(deck, rngState);
    deck = res.deck;
    rngState = res.rngState;
    firstCard = deck.pop();
  }

  const base = {
    seed,
    rngState,
    rules,
    deck,
    players,
    currentPlayer: 0,
    direction: 1,
    discardPile: [firstCard],
    currentColor: firstCard.color,
    phase: 'turn', // 'turn' | 'color-selection' | 'game-over'
    winner: null,
    hasDrawn: false,
    pendingCard: null,
    pendingPlayer: null,
    pendingDraw: 0, // accumulated draw count (stacking house rule)
    pendingDrawType: null, // 'draw-two' | 'wild-draw-four'
    history: [],
    log: [],
    seq: 0,
  };

  return logEvent(base, { type: 'start', color: firstCard.color, card: firstCard });
}

export function normalizeRules(rules) {
  return {
    drawToMatch: !!(rules && rules.drawToMatch),
    stacking: !!(rules && rules.stacking),
  };
}

// ---- Reading state ----

/** Official UNO scoring value of a hand: numbers at face value, action cards
 * 20, wilds 50. The round winner collects this from every opponent. */
export function handPoints(hand) {
  return hand.reduce((sum, card) => {
    if (card.type === 'number') return sum + card.value;
    if (card.type === 'wild' || card.type === 'wild-draw-four') return sum + 50;
    return sum + 20;
  }, 0);
}

export function topOfDiscard(state) {
  return state.discardPile[state.discardPile.length - 1];
}

export function isValidPlay(card, currentColor, topCard) {
  if (card.type === 'wild' || card.type === 'wild-draw-four') return true;
  if (card.color === currentColor) return true;
  if (card.type === 'number' && topCard.type === 'number' && card.value === topCard.value) return true;
  if (card.type !== 'number' && card.type === topCard.type) return true;
  return false;
}

export function canPlayWildDrawFour(hand, currentColor) {
  return !hand.some((c) => c.color === currentColor);
}

/**
 * Legal plays for a hand in the CURRENT state. Accounts for the stacking house
 * rule: while a draw penalty is pending, only a matching stackable card is legal.
 */
export function getValidPlays(state, playerIndex) {
  const hand = state.players[playerIndex].hand;
  const topCard = topOfDiscard(state);

  if (state.pendingDraw > 0) {
    // Only same-type draw cards may be stacked onto the pending penalty.
    return hand.filter((c) => c.type === state.pendingDrawType);
  }

  return hand.filter((card) => {
    if (card.type === 'wild-draw-four') return canPlayWildDrawFour(hand, state.currentColor);
    return isValidPlay(card, state.currentColor, topCard);
  });
}

// ---- Drawing (handles deck exhaustion + discard recycling) ----

function drawCards(state, count) {
  let { deck, discardPile } = state;
  let rngState = state.rngState;
  let recycled = false;
  const drawn = [];

  for (let i = 0; i < count; i++) {
    if (deck.length === 0) {
      const top = discardPile[discardPile.length - 1];
      const rest = discardPile.slice(0, -1).map(stripWildColor);
      const res = shuffleDeck(rest, rngState);
      deck = res.deck;
      rngState = res.rngState;
      discardPile = [top];
      recycled = true;
    }
    if (deck.length === 0) break;
    drawn.push(deck[deck.length - 1]);
    deck = deck.slice(0, -1);
  }

  return { drawn, deck, discardPile, rngState, recycled };
}

// ---- Turn effects ----

// Advance the turn, applying the played card's effect. Returns new state and
// records the structured events the effect produced.
function applyEffect(state, card, playerIndex) {
  const n = state.players.length;
  const dir = state.direction;
  const victim = nextIndexFrom(playerIndex, dir, n, 1);

  switch (card.type) {
    case 'skip': {
      const skipped = nextIndexFrom(playerIndex, dir, n, 1);
      let s = { ...state, currentPlayer: nextIndexFrom(playerIndex, dir, n, 2), hasDrawn: false };
      return logEvent(s, { type: 'skip', player: skipped });
    }

    case 'reverse': {
      if (n === 2) {
        const skipped = nextIndexFrom(playerIndex, dir, n, 1);
        let s = { ...state, currentPlayer: nextIndexFrom(playerIndex, dir, n, 2), hasDrawn: false };
        s = logEvent(s, { type: 'reverse' });
        return logEvent(s, { type: 'skip', player: skipped });
      }
      const newDir = -dir;
      let s = {
        ...state,
        direction: newDir,
        currentPlayer: nextIndexFrom(playerIndex, newDir, n, 1),
        hasDrawn: false,
      };
      return logEvent(s, { type: 'reverse' });
    }

    case 'draw-two':
    case 'wild-draw-four': {
      const amount = card.type === 'draw-two' ? 2 : 4;

      if (state.rules.stacking) {
        // Do not resolve yet: accumulate and pass the decision to the victim.
        let s = {
          ...state,
          pendingDraw: state.pendingDraw + amount,
          pendingDrawType: card.type,
          currentPlayer: victim,
          hasDrawn: false,
        };
        return logEvent(s, { type: 'stack', player: victim, total: s.pendingDraw, cardType: card.type });
      }

      const { drawn, deck, discardPile, rngState, recycled } = drawCards(state, amount);
      let s = {
        ...state,
        deck,
        discardPile,
        rngState,
        players: giveCards(state.players, victim, drawn),
        currentPlayer: nextIndexFrom(playerIndex, dir, n, 2),
        hasDrawn: false,
      };
      if (recycled) s = logEvent(s, { type: 'reshuffle' });
      s = logEvent(s, { type: 'penalty', player: victim, count: amount, cause: card.type });
      return logEvent(s, { type: 'skip', player: victim });
    }

    default:
      return { ...state, currentPlayer: nextIndexFrom(playerIndex, dir, n, 1), hasDrawn: false };
  }
}

function finalizePlay(state, card, playerIndex) {
  let next = {
    ...state,
    discardPile: [...state.discardPile, card],
    currentColor: card.color,
    pendingCard: null,
    pendingPlayer: null,
  };

  next = logEvent(next, { type: 'play', player: playerIndex, card, color: card.color });

  if (next.players[playerIndex].hand.length === 0) {
    next = { ...next, phase: 'game-over', winner: playerIndex };
    return logEvent(next, { type: 'win', player: playerIndex });
  }

  return applyEffect(next, card, playerIndex);
}

// ---- Public transitions (each records a canonical move for replay) ----

export function playCard(state, playerIndex, cardId) {
  const player = state.players[playerIndex];
  const card = player.hand.find((c) => c.id === cardId);
  const newHand = player.hand.filter((c) => c.id !== cardId);
  const players = state.players.map((p, i) => (i === playerIndex ? { ...p, hand: newHand } : p));
  let next = logMove({ ...state, players }, { kind: 'play', player: playerIndex, cardId });

  if (card.type === 'wild' || card.type === 'wild-draw-four') {
    return { ...next, pendingCard: card, pendingPlayer: playerIndex, phase: 'color-selection' };
  }

  return finalizePlay(next, card, playerIndex);
}

export function chooseColor(state, color) {
  const { pendingCard, pendingPlayer } = state;
  const cleared = logMove({ ...state, phase: 'turn' }, { kind: 'color', player: pendingPlayer, color });
  return finalizePlay(cleared, { ...pendingCard, color }, pendingPlayer);
}

// A player with a pending stacked penalty gives in: draw the whole stack and
// forfeit the turn. Only meaningful when rules.stacking is on.
export function absorbPending(state) {
  const idx = state.currentPlayer;
  const n = state.players.length;
  const total = state.pendingDraw;
  const { drawn, deck, discardPile, rngState, recycled } = drawCards(state, total);
  let s = {
    ...state,
    deck,
    discardPile,
    rngState,
    players: giveCards(state.players, idx, drawn),
    pendingDraw: 0,
    pendingDrawType: null,
    hasDrawn: false,
    currentPlayer: nextIndexFrom(idx, state.direction, n, 1),
  };
  s = logMove(s, { kind: 'absorb', player: idx });
  if (recycled) s = logEvent(s, { type: 'reshuffle' });
  return logEvent(s, { type: 'penalty', player: idx, count: total, cause: 'stack' });
}

export function drawForCurrent(state) {
  const idx = state.currentPlayer;
  const { drawn, deck, discardPile, rngState, recycled } = drawCards(state, 1);
  let s = { ...state, deck, discardPile, rngState, players: giveCards(state.players, idx, drawn), hasDrawn: true };
  s = logMove(s, { kind: 'draw', player: idx });
  if (recycled) s = logEvent(s, { type: 'reshuffle' });
  return logEvent(s, { type: 'draw', player: idx, count: 1 });
}

export function passTurn(state) {
  const n = state.players.length;
  let s = {
    ...state,
    currentPlayer: nextIndexFrom(state.currentPlayer, state.direction, n, 1),
    hasDrawn: false,
  };
  s = logMove(s, { kind: 'pass', player: state.currentPlayer });
  return logEvent(s, { type: 'pass', player: state.currentPlayer });
}

// ==== CPU STRATEGY (per personality style) ====
// The seeded PRNG is threaded through so bot choices are reproducible.

function chooseCpuColor(hand) {
  const counts = { red: 0, blue: 0, green: 0, yellow: 0 };
  for (const card of hand) {
    if (card.color) counts[card.color] += 1;
  }
  return Object.keys(counts).reduce((best, color) => (counts[color] > counts[best] ? color : best), 'red');
}

const SPECIAL_TYPES = ['skip', 'reverse', 'draw-two', 'wild-draw-four'];

// Score a candidate card given the CPU's play style. Higher = more preferred.
// `rand` is a deterministic [0,1) sample used only by the low-strategy style.
function scoreCardForStyle(card, style, state, playerIndex, rand) {
  const n = state.players.length;
  const nextIdx = nextIndexFrom(playerIndex, state.direction, n, 1);
  const nextLow = state.players[nextIdx].hand.length <= 2;

  if (style === 'easy') {
    // Plays with little strategy — essentially the luck of the draw.
    return rand;
  }

  if (style === 'aggressive') {
    if (card.type === 'draw-two' || card.type === 'wild-draw-four') return 10;
    if (card.type === 'skip' || card.type === 'reverse') return 8;
    if (card.type === 'number') return 2 + (card.value || 0) / 20;
    return 1; // plain wild — dump it
  }

  // expert: reserve wilds, hit players who are close to winning, keep the deck lean
  if (card.type === 'wild-draw-four') return nextLow ? 9 : 0.6;
  if (card.type === 'wild') return 0.5;
  if (SPECIAL_TYPES.includes(card.type)) return nextLow ? 9 : 4;
  return 5; // numbers preferred to conserve specials
}

// Returns { card, rngState }.
function chooseCpuCard(validPlays, state, playerIndex, style) {
  let rngState = state.rngState;
  let best = { card: null, score: -Infinity };
  for (const card of validPlays) {
    let rand = 0;
    if (style === 'easy') {
      const r = rngNext(rngState);
      rand = r.value;
      rngState = r.state;
    }
    const score = scoreCardForStyle(card, style, state, playerIndex, rand);
    if (score > best.score) best = { card, score };
  }
  return { card: best.card, rngState };
}

function playCpuCard(state, playerIndex, card) {
  let next = playCard(state, playerIndex, card.id);
  if (next.phase === 'color-selection') {
    next = chooseColor(next, chooseCpuColor(state.players[playerIndex].hand));
  }
  return next;
}

/**
 * Run the current CPU's whole turn. Returns { state, event } so the app can
 * animate and announce. event.kind: 'play' | 'draw-pass' | 'absorb'.
 */
export function runCpuTurn(state) {
  const idx = state.currentPlayer;
  const style = state.players[idx].style;

  // Facing a stacked penalty: stack a matching card if held, else absorb.
  if (state.pendingDraw > 0) {
    const stackable = getValidPlays(state, idx);
    if (stackable.length > 0) {
      const chosen = chooseCpuCard(stackable, { ...state }, idx, style);
      const withRng = { ...state, rngState: chosen.rngState };
      return { state: playCpuCard(withRng, idx, chosen.card), event: { kind: 'play', card: chosen.card, playerIndex: idx } };
    }
    return { state: absorbPending(state), event: { kind: 'absorb', playerIndex: idx, count: state.pendingDraw } };
  }

  const valid = getValidPlays(state, idx);

  if (valid.length === 0) {
    // Draw one (or, with drawToMatch, draw until playable), then play it if legal.
    let s = drawForCurrent(state);
    if (state.rules.drawToMatch) {
      let guard = 0;
      while (getValidPlays(s, idx).length === 0 && guard < 200) {
        s = { ...s, hasDrawn: false };
        s = drawForCurrent(s);
        guard++;
      }
    }
    const hand = s.players[idx].hand;
    const drawnCard = hand[hand.length - 1];
    const legal = drawnCard && (drawnCard.type === 'wild-draw-four'
      ? canPlayWildDrawFour(hand, s.currentColor)
      : isValidPlay(drawnCard, s.currentColor, topOfDiscard(s)));
    if (legal) {
      return { state: playCpuCard(s, idx, drawnCard), event: { kind: 'play', card: drawnCard, playerIndex: idx, drew: true } };
    }
    return { state: passTurn(s), event: { kind: 'draw-pass', playerIndex: idx } };
  }

  const chosen = chooseCpuCard(valid, state, idx, style);
  const withRng = { ...state, rngState: chosen.rngState };
  return { state: playCpuCard(withRng, idx, chosen.card), event: { kind: 'play', card: chosen.card, playerIndex: idx } };
}

// ==== PERSONALITIES (roster) ====

export const ROSTER = [
  { id: 'cpu-laura', name: 'Laura', initial: 'L', style: 'easy' },
  { id: 'cpu-santiago', name: 'Santiago', initial: 'S', style: 'aggressive' },
  { id: 'cpu-camila', name: 'Camila', initial: 'C', style: 'expert' },
];

export function buildOpponents(count) {
  return ROSTER.slice(0, count).map((p) => ({ ...p }));
}

// ==== REPLAY ====
// Rebuild a game from its seed + config + canonical move log, and return the
// final state. Applying the recorded decisions to a fresh seeded state must
// yield the exact same result — that is the fairness guarantee.

export function applyMove(state, move) {
  switch (move.kind) {
    case 'play': return playCard(state, move.player, move.cardId);
    case 'color': return chooseColor(state, move.color);
    case 'draw': return drawForCurrent(state);
    case 'pass': return passTurn(state);
    case 'absorb': return absorbPending(state);
    default: return state;
  }
}

/**
 * @param {{ humanName:string, opponents:Array, seed:string, rules?:object }} config
 * @param {Array} moves canonical move log (state.log)
 */
export function replay(config, moves) {
  let state = createInitialState(config);
  for (const move of moves) {
    state = applyMove(state, move);
  }
  return state;
}

// Strip functions/volatile fields so two states can be compared for equality.
export function snapshot(state) {
  return {
    players: state.players.map((p) => ({ id: p.id, hand: p.hand.map((c) => c.id) })),
    currentPlayer: state.currentPlayer,
    direction: state.direction,
    currentColor: state.currentColor,
    discard: state.discardPile.map((c) => c.id + ':' + (c.color || '')),
    phase: state.phase,
    winner: state.winner,
    rngState: state.rngState,
  };
}
