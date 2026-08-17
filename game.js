// ==== ENGINE ====
// Pure game rules for N players (2-4). No DOM access lives here.
// Players are an ordered array; index 0 is always the human.

const COLORS = ['red', 'blue', 'green', 'yellow'];

function createCard(id, color, type, value) {
  return { id, color, type, value };
}

function createDeck() {
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

function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function mod(n, m) {
  return ((n % m) + m) % m;
}

function nextIndexFrom(idx, direction, count, steps) {
  return mod(idx + direction * steps, count);
}

function giveCards(players, idx, cards) {
  return players.map((p, i) => (i === idx ? { ...p, hand: [...p.hand, ...cards] } : p));
}

// config: { humanName, opponents: [{ id, name, isHuman:false, personalityKey, style }] }
function createInitialState(config) {
  let deck = shuffleDeck(createDeck());

  const players = [{ id: 'you', name: config.humanName, isHuman: true, hand: [] }];
  for (const opp of config.opponents) {
    players.push({ ...opp, isHuman: false, hand: [] });
  }

  for (const player of players) {
    player.hand = deck.splice(0, 7);
  }

  let firstCard = deck.pop();
  while (firstCard.type !== 'number') {
    deck.unshift(firstCard);
    deck = shuffleDeck(deck);
    firstCard = deck.pop();
  }

  return {
    deck,
    players,
    currentPlayer: 0,
    direction: 1,
    discardPile: [firstCard],
    currentColor: firstCard.color,
    phase: 'turn', // 'turn' | 'color-selection' | 'game-over'
    winner: null, // player index
    hasDrawn: false,
    pendingCard: null,
    pendingPlayer: null,
  };
}

function topOfDiscard(state) {
  return state.discardPile[state.discardPile.length - 1];
}

function isValidPlay(card, currentColor, topCard) {
  if (card.type === 'wild' || card.type === 'wild-draw-four') return true;
  if (card.color === currentColor) return true;
  if (card.type === 'number' && topCard.type === 'number' && card.value === topCard.value) return true;
  if (card.type !== 'number' && card.type === topCard.type) return true;
  return false;
}

function canPlayWildDrawFour(hand, currentColor) {
  return !hand.some((c) => c.color === currentColor);
}

function getValidPlays(hand, currentColor, topCard) {
  return hand.filter((card) => {
    if (card.type === 'wild-draw-four') return canPlayWildDrawFour(hand, currentColor);
    return isValidPlay(card, currentColor, topCard);
  });
}

function drawCards(state, count) {
  let { deck, discardPile } = state;
  const drawn = [];

  for (let i = 0; i < count; i++) {
    if (deck.length === 0) {
      const top = discardPile[discardPile.length - 1];
      const rest = discardPile.slice(0, -1);
      deck = shuffleDeck(rest);
      discardPile = [top];
    }
    if (deck.length === 0) break;
    drawn.push(deck[deck.length - 1]);
    deck = deck.slice(0, -1);
  }

  return { drawn, deck, discardPile };
}

// Advance the turn, applying the played card's effect. Returns new state.
function applyEffect(state, card, playerIndex) {
  const n = state.players.length;
  const dir = state.direction;
  const victim = nextIndexFrom(playerIndex, dir, n, 1);

  switch (card.type) {
    case 'skip':
      return { ...state, currentPlayer: nextIndexFrom(playerIndex, dir, n, 2), hasDrawn: false };

    case 'reverse': {
      if (n === 2) {
        // With two players, reverse acts as skip (current player goes again).
        return { ...state, currentPlayer: nextIndexFrom(playerIndex, dir, n, 2), hasDrawn: false };
      }
      const newDir = -dir;
      return {
        ...state,
        direction: newDir,
        currentPlayer: nextIndexFrom(playerIndex, newDir, n, 1),
        hasDrawn: false,
      };
    }

    case 'draw-two': {
      const { drawn, deck, discardPile } = drawCards(state, 2);
      return {
        ...state,
        deck,
        discardPile,
        players: giveCards(state.players, victim, drawn),
        currentPlayer: nextIndexFrom(playerIndex, dir, n, 2),
        hasDrawn: false,
      };
    }

    case 'wild-draw-four': {
      const { drawn, deck, discardPile } = drawCards(state, 4);
      return {
        ...state,
        deck,
        discardPile,
        players: giveCards(state.players, victim, drawn),
        currentPlayer: nextIndexFrom(playerIndex, dir, n, 2),
        hasDrawn: false,
      };
    }

    default:
      return { ...state, currentPlayer: nextIndexFrom(playerIndex, dir, n, 1), hasDrawn: false };
  }
}

function finalizePlay(state, card, playerIndex) {
  const next = {
    ...state,
    discardPile: [...state.discardPile, card],
    currentColor: card.color,
  };

  if (next.players[playerIndex].hand.length === 0) {
    return { ...next, phase: 'game-over', winner: playerIndex };
  }

  return applyEffect(next, card, playerIndex);
}

function playCard(state, playerIndex, cardId) {
  const player = state.players[playerIndex];
  const card = player.hand.find((c) => c.id === cardId);
  const newHand = player.hand.filter((c) => c.id !== cardId);
  const players = state.players.map((p, i) => (i === playerIndex ? { ...p, hand: newHand } : p));
  const next = { ...state, players };

  if (card.type === 'wild' || card.type === 'wild-draw-four') {
    return { ...next, pendingCard: card, pendingPlayer: playerIndex, phase: 'color-selection' };
  }

  return finalizePlay(next, card, playerIndex);
}

function chooseColor(state, color) {
  const { pendingCard, pendingPlayer } = state;
  const cleared = { ...state, pendingCard: null, pendingPlayer: null, phase: 'turn' };
  return finalizePlay(cleared, { ...pendingCard, color }, pendingPlayer);
}

function drawForCurrent(state) {
  const idx = state.currentPlayer;
  const { drawn, deck, discardPile } = drawCards(state, 1);
  return { ...state, deck, discardPile, players: giveCards(state.players, idx, drawn), hasDrawn: true };
}

function passTurn(state) {
  const n = state.players.length;
  return {
    ...state,
    currentPlayer: nextIndexFrom(state.currentPlayer, state.direction, n, 1),
    hasDrawn: false,
  };
}

// ==== CPU STRATEGY (per personality style) ====

function chooseCpuColor(hand) {
  const counts = { red: 0, blue: 0, green: 0, yellow: 0 };
  for (const card of hand) {
    if (card.color) counts[card.color] += 1;
  }
  return Object.keys(counts).reduce((best, color) => (counts[color] > counts[best] ? color : best), 'red');
}

const SPECIAL_TYPES = ['skip', 'reverse', 'draw-two', 'wild-draw-four'];

// Score a candidate card given the CPU's play style. Higher = more preferred.
function scoreCardForStyle(card, style, state, playerIndex) {
  const n = state.players.length;
  const nextIdx = nextIndexFrom(playerIndex, state.direction, n, 1);
  const nextLow = state.players[nextIdx].hand.length <= 2;
  const isWild = card.type === 'wild' || card.type === 'wild-draw-four';

  if (style === 'easy') {
    // Plays with little strategy — essentially the luck of the draw.
    return Math.random();
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

function chooseCpuCard(validPlays, state, playerIndex, style) {
  return validPlays.reduce(
    (best, card) => {
      const score = scoreCardForStyle(card, style, state, playerIndex);
      return score > best.score ? { card, score } : best;
    },
    { card: null, score: -Infinity }
  ).card;
}

function playCpuCard(state, playerIndex, card) {
  let next = playCard(state, playerIndex, card.id);
  if (next.phase === 'color-selection') {
    next = chooseColor(next, chooseCpuColor(state.players[playerIndex].hand));
  }
  return next;
}

// Runs the current CPU's whole turn. Returns { state, event } so the app can
// animate and announce. event.kind: 'play' | 'draw-pass'.
function runCpuTurn(state) {
  const idx = state.currentPlayer;
  const style = state.players[idx].style;
  const valid = getValidPlays(state.players[idx].hand, state.currentColor, topOfDiscard(state));

  if (valid.length === 0) {
    // Official rule: draw one, then you may only play THAT card (if legal).
    const drawn = drawForCurrent(state);
    const hand = drawn.players[idx].hand;
    const drawnCard = hand[hand.length - 1];
    const legal = drawnCard && (drawnCard.type === 'wild-draw-four'
      ? canPlayWildDrawFour(hand, drawn.currentColor)
      : isValidPlay(drawnCard, drawn.currentColor, topOfDiscard(drawn)));
    if (legal) {
      return { state: playCpuCard(drawn, idx, drawnCard), event: { kind: 'play', card: drawnCard, playerIndex: idx, drew: true } };
    }
    return { state: passTurn(drawn), event: { kind: 'draw-pass', playerIndex: idx } };
  }

  const card = chooseCpuCard(valid, state, idx, style);
  return { state: playCpuCard(state, idx, card), event: { kind: 'play', card, playerIndex: idx } };
}

// ==== PERSONALITIES (roster) ====
// Human names, each with an inherent play style. A "Bot" badge marks them in
// the UI so they're never confused with real humans later.

const ROSTER = [
  { id: 'cpu-laura', name: 'Laura', initial: 'L', style: 'easy' },
  { id: 'cpu-santiago', name: 'Santiago', initial: 'S', style: 'aggressive' },
  { id: 'cpu-camila', name: 'Camila', initial: 'C', style: 'expert' },
];

function buildOpponents(count) {
  return ROSTER.slice(0, count).map((p) => ({ ...p }));
}

// ==== RENDER ====

const COLOR_NAMES = { red: 'Rojo', blue: 'Azul', green: 'Verde', yellow: 'Amarillo' };
const COLOR_VARS = {
  red: 'var(--uno-red)', blue: 'var(--uno-blue)',
  green: 'var(--uno-green)', yellow: 'var(--uno-yellow)',
};
const CARD_SYMBOLS = { skip: '⊘', reverse: '⇄', 'draw-two': '+2', 'wild-draw-four': '+4' };

function isWildCard(card) {
  return card.type === 'wild' || card.type === 'wild-draw-four';
}

function cardGlyph(card) {
  if (card.type === 'number') return String(card.value);
  return CARD_SYMBOLS[card.type] || '';
}

function cardAriaLabel(card) {
  const color = card.color ? COLOR_NAMES[card.color] : '';
  switch (card.type) {
    case 'number': return `${color} ${card.value}`;
    case 'skip': return `${color}, salto`;
    case 'reverse': return `${color}, reversa`;
    case 'draw-two': return `${color}, roba dos`;
    case 'wild': return 'Comodín, elige color';
    case 'wild-draw-four': return 'Comodín roba cuatro';
    default: return 'Carta';
  }
}

function buildCardElement(card, { faceUp }) {
  const el = document.createElement('div');
  el.className = 'card';

  if (!faceUp) {
    el.classList.add('card--back');
    const logo = document.createElement('span');
    logo.className = 'card__logo';
    logo.textContent = 'UNO';
    el.appendChild(logo);
    return el;
  }

  el.classList.add('card--' + (isWildCard(card) ? 'wild' : card.color));

  const oval = document.createElement('div');
  oval.className = 'card__oval';
  el.appendChild(oval);

  const glyph = cardGlyph(card);
  if (glyph) {
    const value = document.createElement('div');
    value.className = 'card__value';
    value.textContent = glyph;
    el.appendChild(value);

    const tl = document.createElement('span');
    tl.className = 'card__corner card__corner--tl';
    tl.textContent = glyph;
    el.appendChild(tl);

    const br = document.createElement('span');
    br.className = 'card__corner card__corner--br';
    br.textContent = glyph;
    el.appendChild(br);
  }

  return el;
}

function applyFanTransform(el, index, count, spread, drop) {
  const mid = (count - 1) / 2;
  const offset = index - mid;
  el.style.setProperty('--rot', (offset * spread).toFixed(2) + 'deg');
  el.style.setProperty('--ty', (Math.abs(offset) * drop).toFixed(1) + 'px');
}

// Seat placement around the table by opponent count. The human sits at the
// bottom; bots take the corners / top so it reads like a real table.
const SEATS = { 1: ['t'], 2: ['tl', 'tr'], 3: ['tl', 't', 'tr'] };

function renderCpuZones(state) {
  const arena = document.getElementById('arena');
  arena.querySelectorAll('.cpu-player').forEach((el) => el.remove());
  arena.classList.toggle('bot-active', state.currentPlayer !== 0 && state.phase !== 'game-over');

  const seats = SEATS[state.players.length - 1] || SEATS[3];

  for (let i = 1; i < state.players.length; i++) {
    const player = state.players[i];
    const zone = document.createElement('div');
    zone.className = 'cpu-player seat--' + seats[i - 1];
    zone.dataset.index = i;
    if (state.currentPlayer === i && state.phase !== 'game-over') zone.classList.add('cpu-player--active');
    if (thinkingIndex === i) zone.classList.add('cpu-player--thinking');

    if (bubbles[i]) {
      const bubble = document.createElement('div');
      bubble.className = 'speech-bubble';
      bubble.textContent = bubbles[i];
      zone.appendChild(bubble);
    }

    const head = document.createElement('div');
    head.className = 'cpu-player__head';
    head.innerHTML =
      `<span class="avatar">${player.initial}</span>` +
      `<span class="cpu-player__name">${player.name}</span>` +
      `<span class="bot-tag">Bot</span>` +
      `<span class="count-badge">${player.hand.length}</span>`;
    zone.appendChild(head);

    if (thinkingIndex === i) {
      const think = document.createElement('div');
      think.className = 'thinking';
      think.innerHTML = 'pensando<span class="banner__dots"></span>';
      zone.appendChild(think);
    }

    const fan = document.createElement('div');
    fan.className = 'fan fan--cpu';
    fan.setAttribute('aria-hidden', 'true');
    const m = player.hand.length;
    for (let k = 0; k < m; k++) {
      const el = buildCardElement(null, { faceUp: false });
      applyFanTransform(el, k, m, 2, 2);
      fan.appendChild(el);
    }
    zone.appendChild(fan);
    arena.appendChild(zone);
  }
}

function renderPlayerHand(state) {
  const human = state.players[0];
  const interactive = state.phase === 'turn' && state.currentPlayer === 0;

  const handEl = document.getElementById('player-hand');
  handEl.innerHTML = '';
  const n = human.hand.length;
  human.hand.forEach((card, i) => {
    const el = buildCardElement(card, { faceUp: true });
    applyFanTransform(el, i, n, 3, 3.5);
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', cardAriaLabel(card));
    el.tabIndex = interactive ? 0 : -1;
    if (!interactive) el.setAttribute('aria-disabled', 'true');
    el.addEventListener('click', () => handlePlayerAttempt(card.id));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handlePlayerAttempt(card.id);
      }
    });
    handEl.appendChild(el);
  });
  handEl.style.pointerEvents = interactive ? 'auto' : 'none';
}

function renderPiles(state) {
  const discardEl = document.getElementById('discard-pile');
  const top = topOfDiscard(state);
  discardEl.innerHTML = '';
  discardEl.appendChild(buildCardElement(top, { faceUp: true }));
  discardEl.setAttribute('aria-label', 'Carta en juego: ' + cardAriaLabel(top));

  const drawBtn = document.getElementById('draw-pile');
  const canDraw = state.phase === 'turn' && state.currentPlayer === 0 && !state.hasDrawn;
  drawBtn.disabled = !canDraw;
  drawBtn.setAttribute('aria-disabled', String(!canDraw));
}

// Animate the just-played card physically travelling from the player who
// played it to the centre discard, so the table feels real.
function flyCardToCenter(card, fromEl) {
  if (!fromEl) return;
  const discardEl = document.getElementById('discard-pile');
  const realCard = discardEl.querySelector('.card');
  const to = discardEl.getBoundingClientRect();
  const from = fromEl.getBoundingClientRect();

  if (realCard) realCard.style.visibility = 'hidden';

  const clone = buildCardElement(card, { faceUp: true });
  clone.classList.add('flying-card');
  clone.style.left = from.left + from.width / 2 + 'px';
  clone.style.top = from.top + from.height / 2 + 'px';
  document.body.appendChild(clone);

  requestAnimationFrame(() => {
    clone.style.left = to.left + to.width / 2 + 'px';
    clone.style.top = to.top + to.height / 2 + 'px';
    clone.classList.add('flying-card--landed');
  });

  setTimeout(() => {
    clone.remove();
    if (realCard) realCard.style.visibility = 'visible';
  }, 440);
}

function seatElement(playerIndex) {
  if (playerIndex === 0) return document.getElementById('player-hand');
  return document.querySelector(`.cpu-player[data-index="${playerIndex}"]`);
}

function currentName(state) {
  return state.players[state.currentPlayer].name;
}

function renderBanner(state) {
  const banner = document.getElementById('turn-banner');
  banner.className = 'banner';

  if (state.phase === 'turn') {
    if (state.currentPlayer === 0) {
      banner.classList.add('banner--you');
      banner.textContent = `Te toca, ${state.players[0].name}`;
    } else {
      banner.classList.add('banner--cpu');
      banner.innerHTML = `Juega ${currentName(state)}<span class="banner__dots"></span>`;
    }
  } else if (state.phase === 'color-selection') {
    if (state.pendingPlayer === 0) {
      banner.classList.add('banner--you');
      banner.textContent = 'Elige un color';
    } else {
      banner.classList.add('banner--cpu');
      banner.textContent = `${state.players[state.pendingPlayer].name} elige color…`;
    }
  } else {
    banner.textContent = '';
  }
}

function renderColorChip(state) {
  const chip = document.getElementById('color-chip');
  if (state.phase !== 'turn' || !state.currentColor) {
    chip.hidden = true;
    return;
  }
  chip.hidden = false;
  chip.querySelector('.chip__dot').style.background = COLOR_VARS[state.currentColor];
  document.getElementById('color-chip-name').textContent = COLOR_NAMES[state.currentColor];
}

function renderColorPicker(state) {
  document.getElementById('color-picker').hidden =
    !(state.phase === 'color-selection' && state.pendingPlayer === 0);
}

function renderPassButton(state) {
  document.getElementById('pass-btn').hidden =
    !(state.phase === 'turn' && state.currentPlayer === 0 && state.hasDrawn);
}

function renderPoints() {
  document.getElementById('points').textContent = roundPoints;
}

function renderScore() {
  document.getElementById('score-player-name').textContent = playerName;
  document.getElementById('score-player').textContent = scores.player;
  document.getElementById('score-cpu').textContent = scores.cpu;
  document.getElementById('player-label').textContent = playerName;
}

function renderGameOver(state) {
  const el = document.getElementById('game-over');
  el.hidden = state.phase !== 'game-over';
  if (state.phase !== 'game-over') return;

  const humanWon = state.winner === 0;
  if (!scored) {
    scores[humanWon ? 'player' : 'cpu'] += 1;
    scored = true;
    persist();
    renderScore();
  }

  document.getElementById('game-over-message').textContent = humanWon
    ? `¡Ganaste, ${playerName}!`
    : `Ganó ${state.players[state.winner].name}`;
  document.getElementById('game-over-score').textContent =
    `${playerName} ${scores.player} — ${scores.cpu} Bots · ${roundPoints} pts`;

  if (!gameOverFocused) {
    document.getElementById('play-again-btn').focus();
    gameOverFocused = true;
  }
}

function render(state) {
  renderCpuZones(state);
  renderPlayerHand(state);
  renderPiles(state);
  renderBanner(state);
  renderColorChip(state);
  renderColorPicker(state);
  renderPassButton(state);
  renderPoints();
  renderGameOver(state);
}

// ==== TOASTS ====

let toastTimer = null;

function showToast(message, kind) {
  const toast = document.getElementById('toast');
  toast.hidden = false;
  toast.textContent = message;
  toast.className = 'toast toast--show' + (kind ? ' toast--' + kind : '');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.className = 'toast' + (kind ? ' toast--' + kind : '');
  }, 1900);
}

// Announce a special/superpower card. `actor` is the player index. `state` is
// AFTER the play. Number cards stay silent.
function announcePlay(card, actorIndex, state) {
  const actor = state.players[actorIndex];
  const byHuman = actorIndex === 0;
  const who = byHuman ? 'Juegas' : `${actor.name} juega`;
  const nextIdx = nextIndexFrom(actorIndex, state.direction, state.players.length, 1);
  const victimName = state.players[nextIdx].isHuman ? 'tú' : state.players[nextIdx].name;

  switch (card.type) {
    case 'draw-two':
      showToast(`${who} +2 — ${cap(victimName)} roba 2`, 'special');
      break;
    case 'wild-draw-four':
      showToast(`${who} +4 — ${cap(victimName)} roba 4 (color: ${COLOR_NAMES[state.currentColor]})`, 'special');
      break;
    case 'skip':
      showToast(`${who} Salto — ${cap(victimName)} pierde el turno`, 'special');
      break;
    case 'reverse':
      showToast(`${who} Reversa — cambia el sentido`, 'special');
      break;
    case 'wild':
      showToast(`Color cambiado a ${COLOR_NAMES[state.currentColor]}`, 'special');
      break;
    default:
      break;
  }
}

function cap(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function invalidReason(state) {
  return `No puedes jugar esa carta: el color activo es ${COLOR_NAMES[state.currentColor]} y no coincide en número ni símbolo.`;
}

// ==== PERSONALITY REACTIONS ====
// In-character one-liners per play style. Shown occasionally so they add
// flavor without saturating. Keyed by the CPU's style.

const REACTIONS = {
  easy: { // Laura — warm, impulsive
    play: ['¡Uy, esta me sirve!', 'A ver qué tal…', '¡Me encanta esto!'],
    special: ['¡Ay, perdón!', '¡No era mi intención!', '¡Uy, qué nervios!'],
    hit: ['¡Ay, no!', 'Bueno, ni modo', '¡Oye, eso dolió!'],
    draw: ['Otra más, va', 'A robar entonces'],
    win: ['¡Gané! ¡Qué emoción!'],
    uno: ['¡Me queda una!'],
  },
  aggressive: { // Santiago — competitive, cutting
    play: ['Así se juega.', 'Sin piedad.', 'Voy con todo.'],
    special: ['Toma esto.', 'Nada personal.', 'Aguántate.'],
    hit: ['¿En serio?', 'Me la vas a pagar.', 'Ja, no me afecta.'],
    draw: ['Tsk. Robo.', 'Paso… por ahora.'],
    win: ['Obvio. Gané.'],
    uno: ['Una carta. Se acabó.'],
  },
  expert: { // Camila — calm, calculating
    play: ['Calculado.', 'Justo lo que necesitaba.', 'Previsible.'],
    special: ['Estaba en mis planes.', 'Lo tenía contemplado.', 'Ya lo verás.'],
    hit: ['Interesante decisión.', 'Lo esperaba.', 'No cambia nada.'],
    draw: ['Robo. Sin problema.', 'Ajusto el plan.'],
    win: ['Como estaba previsto.'],
    uno: ['Una carta. Todo bajo control.'],
  },
};

function pickReaction(player, kind) {
  const bank = REACTIONS[player.style];
  if (!bank) return null;
  const lines = bank[kind] || bank.play;
  if (!lines || !lines.length) return null;
  return lines[Math.floor(Math.random() * lines.length)];
}

// Show a speech bubble over a player's seat for a moment. Stored globally so
// it survives re-renders until it expires.
function showBubble(playerIndex, text) {
  bubbles[playerIndex] = text;
  render(state);
  setTimeout(() => {
    if (bubbles[playerIndex] === text) {
      delete bubbles[playerIndex];
      render(state);
    }
  }, 2000);
}

// Occasionally react in character to an event.
function maybeReact(playerIndex, kind, chance) {
  if (playerIndex === 0) return; // humans don't auto-react
  if (Math.random() > (chance == null ? 0.5 : chance)) return;
  const line = pickReaction(state.players[playerIndex], kind);
  if (line) showBubble(playerIndex, line);
}

// ==== APP STATE + PERSISTENCE ====

const START_POINTS = 100;
const PENALTY = 10;

let state = null;
let playerName = 'Jugador';
let scores = { player: 0, cpu: 0 };
let scored = false;
let prevDiscardId = null;
let roundPoints = START_POINTS;
let lastPlaySource = 'human';
let opponentCount = 1;
let thinkingIndex = null; // which bot is currently "thinking"
let bubbles = {}; // player index -> speech-bubble text
let drawnCardId = null; // after the human draws, only this card may be played
let lastFocused = null; // restore focus after a modal closes
let gameOverFocused = false;

// Bot-turn pacing: a deliberate think beat, then the play, so each bot
// turn reads as a moment instead of a blink.
const THINK_MS = 950;
const AFTER_MS = 750;

function loadPersisted() {
  try {
    const savedName = localStorage.getItem('uno.name');
    if (savedName) playerName = savedName;
    const savedScores = localStorage.getItem('uno.scores');
    if (savedScores) scores = JSON.parse(savedScores);
    const savedCount = localStorage.getItem('uno.opponents');
    if (savedCount) opponentCount = Math.min(3, Math.max(1, parseInt(savedCount, 10) || 1));
  } catch (e) {
    /* localStorage unavailable — play without persistence */
  }
}

function persist() {
  try {
    localStorage.setItem('uno.name', playerName);
    localStorage.setItem('uno.scores', JSON.stringify(scores));
    localStorage.setItem('uno.opponents', String(opponentCount));
  } catch (e) {
    /* ignore */
  }
}

// ==== BOOTSTRAP ====

function newRound() {
  state = createInitialState({ humanName: playerName, opponents: buildOpponents(opponentCount) });
  scored = false;
  roundPoints = START_POINTS;
  lastPlaySource = 'human';
  thinkingIndex = null;
  bubbles = {};
  drawnCardId = null;
  gameOverFocused = false;
  prevDiscardId = topOfDiscard(state).id;
  render(state);
}

function startGame() {
  renderScore();
  newRound();
  document.getElementById('start-screen').hidden = true;
  document.getElementById('game-screen').hidden = false;
}

function isBotTurn() {
  return state.phase === 'turn' && state.currentPlayer !== 0 && state.winner === null;
}

function scheduleCpuIfNeeded() {
  if (isBotTurn()) setTimeout(beginCpuThinking, AFTER_MS);
}

// Beat 1: spotlight the bot and show it "thinking".
function beginCpuThinking() {
  if (!isBotTurn()) return;
  thinkingIndex = state.currentPlayer;
  render(state);
  setTimeout(resolveCpuTurn, THINK_MS);
}

// Beat 2: the bot actually plays; fly the card in, narrate over its seat.
function resolveCpuTurn() {
  thinkingIndex = null;
  const result = runCpuTurn(state);
  lastPlaySource = 'cpu';
  const actorIndex = result.event.playerIndex;
  state = result.state;
  render(state);

  if (result.event.kind === 'play') {
    flyCardToCenter(topOfDiscard(state), seatElement(actorIndex));
  }
  narrateBotAction(result.event, actorIndex);

  if (isBotTurn()) setTimeout(beginCpuThinking, AFTER_MS);
}

function playLabel(card, state) {
  switch (card.type) {
    case 'number': return `${COLOR_NAMES[card.color]} ${card.value}`;
    case 'draw-two': return '+2';
    case 'skip': return 'Salto';
    case 'reverse': return 'Reversa';
    case 'wild': return `Comodín · ${COLOR_NAMES[state.currentColor]}`;
    case 'wild-draw-four': return `+4 · ${COLOR_NAMES[state.currentColor]}`;
    default: return '';
  }
}

// Every bot move gets a tooltip OVER that bot's seat (never central), so it's
// always clear who did what. Specials sometimes carry an in-character quip.
function narrateBotAction(event, actorIndex) {
  const actor = state.players[actorIndex];

  if (event.kind === 'draw-pass') {
    showBubble(actorIndex, 'Robo y paso');
    return;
  }

  let text = playLabel(event.card, state);
  if (event.card.type !== 'number' && Math.random() < 0.65) {
    const line = pickReaction(actor, 'special');
    if (line) text += ' · ' + line;
  }
  showBubble(actorIndex, text);
}

// The human may attempt ANY card. Judging legality is the player's job — an
// illegal attempt costs points and explains why, but never plays.
function handlePlayerAttempt(cardId) {
  if (state.phase !== 'turn' || state.currentPlayer !== 0) return;
  const card = state.players[0].hand.find((c) => c.id === cardId);
  if (!card) return;

  // After drawing, only the freshly drawn card may be played.
  if (state.hasDrawn && cardId !== drawnCardId) {
    showToast('Ya robaste: solo puedes jugar la carta robada, o pasar el turno.', 'bad');
    return;
  }

  // Wild Draw Four is only legal when you hold no card of the active colour.
  if (card.type === 'wild-draw-four' && !canPlayWildDrawFour(state.players[0].hand, state.currentColor)) {
    roundPoints = Math.max(0, roundPoints - PENALTY);
    renderPoints();
    showToast(`No puedes jugar +4: todavía tienes cartas ${COLOR_NAMES[state.currentColor]}. −${PENALTY} pts`, 'bad');
    return;
  }

  if (!isValidPlay(card, state.currentColor, topOfDiscard(state))) {
    roundPoints = Math.max(0, roundPoints - PENALTY);
    renderPoints();
    showToast(`${invalidReason(state)} −${PENALTY} pts`, 'bad');
    return;
  }

  const victimIdx = nextIndexFrom(0, state.direction, state.players.length, 1);

  lastPlaySource = 'human';
  state = playCard(state, 0, cardId);
  render(state);

  if (state.phase === 'color-selection') {
    // Move focus into the modal for keyboard + screen-reader users.
    lastFocused = document.activeElement;
    const firstColor = document.querySelector('#color-picker .color-btn');
    if (firstColor) firstColor.focus();
    return; // fly + announce after color chosen
  }
  flyCardToCenter(topOfDiscard(state), seatElement(0));
  if (card.type !== 'number') {
    announcePlay(card, 0, state);
    if (card.type === 'draw-two' || card.type === 'skip') maybeReact(victimIdx, 'hit', 0.8);
  }
  scheduleCpuIfNeeded();
}

function handleDrawClick() {
  if (state.phase !== 'turn' || state.currentPlayer !== 0 || state.hasDrawn) return;
  state = drawForCurrent(state);
  const hand = state.players[0].hand;
  drawnCardId = hand[hand.length - 1].id;
  render(state);
  showToast('Robaste una carta. Juégala si puedes o pasa el turno.', 'special');
}

function restoreFocus() {
  if (lastFocused && document.body.contains(lastFocused)) {
    lastFocused.focus();
  } else {
    const card = document.querySelector('#player-hand .card');
    if (card) card.focus();
  }
  lastFocused = null;
}

// Keep Tab focus inside an open modal.
function trapFocus(overlay) {
  if (!overlay) return;
  overlay.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || overlay.hidden) return;
    const items = overlay.querySelectorAll('button');
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

loadPersisted();

const nameInput = document.getElementById('name-input');
if (playerName && playerName !== 'Jugador') nameInput.value = playerName;

document.querySelectorAll('.opp-option').forEach((btn) => {
  if (parseInt(btn.dataset.count, 10) === opponentCount) btn.classList.add('opp-option--on');
  btn.addEventListener('click', () => {
    opponentCount = parseInt(btn.dataset.count, 10);
    document.querySelectorAll('.opp-option').forEach((b) => b.classList.toggle('opp-option--on', b === btn));
  });
});

document.getElementById('start-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const entered = nameInput.value.trim();
  playerName = entered || 'Jugador';
  persist();
  startGame();
});

document.getElementById('draw-pile').addEventListener('click', handleDrawClick);

document.getElementById('pass-btn').addEventListener('click', () => {
  if (state.phase !== 'turn' || state.currentPlayer !== 0 || !state.hasDrawn) return;
  state = passTurn(state);
  render(state);
  scheduleCpuIfNeeded();
});

document.querySelectorAll('.color-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (state.phase !== 'color-selection' || state.pendingPlayer !== 0) return;
    const wildType = state.pendingCard.type;
    const victimIdx = nextIndexFrom(0, state.direction, state.players.length, 1);
    lastPlaySource = 'human';
    state = chooseColor(state, btn.dataset.color);
    render(state);
    flyCardToCenter(topOfDiscard(state), seatElement(0));
    announcePlay({ type: wildType }, 0, state);
    if (wildType === 'wild-draw-four') maybeReact(victimIdx, 'hit', 0.85);
    restoreFocus();
    scheduleCpuIfNeeded();
  });
});

document.getElementById('play-again-btn').addEventListener('click', newRound);

trapFocus(document.getElementById('color-picker'));
trapFocus(document.getElementById('game-over'));
