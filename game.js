// ==== ENGINE ====

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

function createInitialState() {
  let deck = shuffleDeck(createDeck());

  const playerHand = deck.splice(0, 7);
  const cpuHand = deck.splice(0, 7);

  let firstCard = deck.pop();
  while (firstCard.type !== 'number') {
    deck.unshift(firstCard);
    deck = shuffleDeck(deck);
    firstCard = deck.pop();
  }

  return {
    deck,
    playerHand,
    cpuHand,
    discardPile: [firstCard],
    currentColor: firstCard.color,
    phase: 'player-turn',
    winner: null,
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
    if (card.type === 'wild-draw-four') {
      return canPlayWildDrawFour(hand, currentColor);
    }
    return isValidPlay(card, currentColor, topCard);
  });
}

function nextTurnState(state, playerKey) {
  if (playerKey === 'player') {
    return { ...state, phase: 'player-turn', hasDrawn: false };
  }
  return { ...state, phase: 'cpu-turn' };
}

function checkWinner(state) {
  if (state.playerHand.length === 0) return 'player';
  if (state.cpuHand.length === 0) return 'cpu';
  return null;
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

function applyEffect(state, card, playerKey) {
  const opponentKey = playerKey === 'player' ? 'cpu' : 'player';
  const opponentHandKey = opponentKey === 'player' ? 'playerHand' : 'cpuHand';

  switch (card.type) {
    case 'skip':
    case 'reverse':
      return nextTurnState(state, playerKey);

    case 'draw-two': {
      const { drawn, deck, discardPile } = drawCards(state, 2);
      return nextTurnState(
        { ...state, deck, discardPile, [opponentHandKey]: [...state[opponentHandKey], ...drawn] },
        playerKey
      );
    }

    case 'wild-draw-four': {
      const { drawn, deck, discardPile } = drawCards(state, 4);
      return nextTurnState(
        { ...state, deck, discardPile, [opponentHandKey]: [...state[opponentHandKey], ...drawn] },
        playerKey
      );
    }

    default:
      return nextTurnState(state, opponentKey);
  }
}

function finalizePlay(state, card, playerKey) {
  const newDiscardPile = [...state.discardPile, card];
  let next = {
    ...state,
    discardPile: newDiscardPile,
    currentColor: card.color,
  };

  next = applyEffect(next, card, playerKey);

  const winner = checkWinner(next);
  if (winner) {
    return { ...next, phase: 'game-over', winner };
  }

  return next;
}

function playCard(state, playerKey, cardId) {
  const handKey = playerKey === 'player' ? 'playerHand' : 'cpuHand';
  const hand = state[handKey];
  const card = hand.find((c) => c.id === cardId);
  const newHand = hand.filter((c) => c.id !== cardId);
  const next = { ...state, [handKey]: newHand };

  if (card.type === 'wild' || card.type === 'wild-draw-four') {
    return { ...next, pendingCard: card, pendingPlayer: playerKey, phase: 'color-selection' };
  }

  return finalizePlay(next, card, playerKey);
}

function chooseColor(state, color) {
  const { pendingCard, pendingPlayer } = state;
  const cleared = { ...state, pendingCard: null, pendingPlayer: null };
  return finalizePlay(cleared, { ...pendingCard, color }, pendingPlayer);
}

function drawForPlayer(state) {
  const { drawn, deck, discardPile } = drawCards(state, 1);
  return { ...state, deck, discardPile, playerHand: [...state.playerHand, ...drawn], hasDrawn: true };
}

function passTurn(state) {
  return nextTurnState(state, 'cpu');
}

function scoreCard(card, opponentHandSize) {
  const baseScores = { number: 1, skip: 3, reverse: 3, 'draw-two': 3, wild: 0, 'wild-draw-four': 0 };
  let score = baseScores[card.type];

  const disruptive = card.type === 'skip' || card.type === 'reverse' || card.type === 'draw-two' || card.type === 'wild-draw-four';
  if (opponentHandSize <= 2 && disruptive) {
    score += 5;
  }

  return score;
}

function chooseCpuColor(hand) {
  const counts = { red: 0, blue: 0, green: 0, yellow: 0 };
  for (const card of hand) {
    if (card.color) counts[card.color] += 1;
  }
  return Object.keys(counts).reduce((best, color) => (counts[color] > counts[best] ? color : best), 'red');
}

function getCpuMove(state) {
  const validPlays = getValidPlays(state.cpuHand, state.currentColor, topOfDiscard(state));
  if (validPlays.length === 0) return { action: 'draw' };

  const best = validPlays.reduce(
    (best, card) => {
      const score = scoreCard(card, state.playerHand.length);
      return score > best.score ? { card, score } : best;
    },
    { card: null, score: -Infinity }
  );

  return { action: 'play', card: best.card };
}

function drawForCpu(state) {
  const { drawn, deck, discardPile } = drawCards(state, 1);
  return { ...state, deck, discardPile, cpuHand: [...state.cpuHand, ...drawn] };
}

function playCpuCard(state, card) {
  let next = playCard(state, 'cpu', card.id);
  if (next.phase === 'color-selection') {
    next = chooseColor(next, chooseCpuColor(state.cpuHand));
  }
  return next;
}

// Returns { state, event } so the app layer can animate and announce what
// the CPU did. event.kind: 'play' (card played, optional drew flag) or
// 'draw-pass' (drew and could not play). No DOM access — stays pure.
function runCpuTurn(state) {
  const move = getCpuMove(state);

  if (move.action === 'draw') {
    const drawn = drawForCpu(state);
    const stillValid = getValidPlays(drawn.cpuHand, drawn.currentColor, topOfDiscard(drawn));
    if (stillValid.length === 0) {
      return { state: nextTurnState(drawn, 'player'), event: { kind: 'draw-pass' } };
    }
    const card = stillValid[0];
    return { state: playCpuCard(drawn, card), event: { kind: 'play', card, drew: true } };
  }

  return { state: playCpuCard(state, move.card), event: { kind: 'play', card: move.card } };
}

// ==== RENDER ====
// Reads state and reflects it in the DOM. No game rules live here.

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

// A gentle hand fan: rotate + drop each card by its distance from center,
// so the hand reads as a real fan instead of a rigid grid.
function applyFanTransform(el, index, count, spread, drop) {
  const mid = (count - 1) / 2;
  const offset = index - mid;
  el.style.setProperty('--rot', (offset * spread).toFixed(2) + 'deg');
  el.style.setProperty('--ty', (Math.abs(offset) * drop).toFixed(1) + 'px');
}

function renderHands(state) {
  const interactive = state.phase === 'player-turn';

  const playerHandEl = document.getElementById('player-hand');
  playerHandEl.innerHTML = '';
  const n = state.playerHand.length;
  state.playerHand.forEach((card, i) => {
    const el = buildCardElement(card, { faceUp: true });
    applyFanTransform(el, i, n, 3, 3.5);
    el.addEventListener('click', () => handlePlayerAttempt(card.id));
    playerHandEl.appendChild(el);
  });
  playerHandEl.style.pointerEvents = interactive ? 'auto' : 'none';

  document.getElementById('cpu-count').textContent = state.cpuHand.length;
  const cpuHandEl = document.getElementById('cpu-hand');
  cpuHandEl.innerHTML = '';
  const m = state.cpuHand.length;
  for (let i = 0; i < m; i++) {
    const el = buildCardElement(null, { faceUp: false });
    applyFanTransform(el, i, m, 2, 2);
    cpuHandEl.appendChild(el);
  }
}

function renderPiles(state) {
  const discardEl = document.getElementById('discard-pile');
  const top = topOfDiscard(state);
  discardEl.innerHTML = '';
  const el = buildCardElement(top, { faceUp: true });
  if (top.id !== prevDiscardId) {
    el.classList.add(lastPlaySource === 'cpu' ? 'card--fly-cpu' : 'card--fly-player');
  }
  discardEl.appendChild(el);
  prevDiscardId = top.id;
}

function renderBanner(state) {
  const banner = document.getElementById('turn-banner');
  banner.className = 'banner';

  if (state.phase === 'player-turn') {
    banner.classList.add('banner--you');
    banner.textContent = `Te toca, ${playerName}`;
  } else if (state.phase === 'cpu-turn') {
    banner.classList.add('banner--cpu');
    banner.innerHTML = 'Juega la CPU<span class="banner__dots"></span>';
  } else if (state.phase === 'color-selection') {
    if (state.pendingPlayer === 'cpu') {
      banner.classList.add('banner--cpu');
      banner.textContent = 'La CPU elige color…';
    } else {
      banner.classList.add('banner--you');
      banner.textContent = 'Elige un color';
    }
  } else {
    banner.textContent = '';
  }
}

function renderColorChip(state) {
  const chip = document.getElementById('color-chip');
  const active = state.phase === 'player-turn' || state.phase === 'cpu-turn';
  if (!active || !state.currentColor) {
    chip.hidden = true;
    return;
  }
  chip.hidden = false;
  chip.querySelector('.chip__dot').style.background = COLOR_VARS[state.currentColor];
  document.getElementById('color-chip-name').textContent = COLOR_NAMES[state.currentColor];
}

function renderColorPicker(state) {
  document.getElementById('color-picker').hidden =
    !(state.phase === 'color-selection' && state.pendingPlayer === 'player');
}

function renderPassButton(state) {
  document.getElementById('pass-btn').hidden = !(state.phase === 'player-turn' && state.hasDrawn);
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

  if (!scored) {
    scores[state.winner === 'player' ? 'player' : 'cpu'] += 1;
    scored = true;
    persist();
    renderScore();
  }

  document.getElementById('game-over-message').textContent =
    state.winner === 'player' ? `¡Ganaste, ${playerName}!` : 'Ganó la CPU';
  document.getElementById('game-over-score').textContent =
    `${playerName} ${scores.player} — ${scores.cpu} CPU · ${roundPoints} pts`;
}

function render(state) {
  renderHands(state);
  renderPiles(state);
  renderBanner(state);
  renderColorChip(state);
  renderColorPicker(state);
  renderPassButton(state);
  renderPoints();
  renderGameOver(state);
}

// ==== TOASTS (feedback for plays and penalties) ====

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

// Announce a special/superpower card so a turn-steal is never missed.
// `state` is the state AFTER the play resolved. Number cards stay silent.
function announcePlay(card, actor, state) {
  const byPlayer = actor === 'player';
  switch (card.type) {
    case 'draw-two':
      showToast(byPlayer ? 'Juegas +2 — la CPU roba 2 cartas' : 'La CPU juega +2 — robas 2 cartas', 'special');
      break;
    case 'wild-draw-four':
      showToast(
        byPlayer
          ? `Juegas +4 — la CPU roba 4 y pierde el turno (color: ${COLOR_NAMES[state.currentColor]})`
          : `La CPU juega +4 — robas 4 y pierdes el turno (color: ${COLOR_NAMES[state.currentColor]})`,
        'special'
      );
      break;
    case 'skip':
      showToast(byPlayer ? 'Salto — la CPU pierde el turno' : 'La CPU te salta — pierdes el turno', 'special');
      break;
    case 'reverse':
      showToast(byPlayer ? 'Reversa — la CPU pierde el turno' : 'La CPU juega Reversa — pierdes el turno', 'special');
      break;
    case 'wild':
      showToast(`Color cambiado a ${COLOR_NAMES[state.currentColor]}`, 'special');
      break;
    default:
      break;
  }
}

function invalidReason(state) {
  return `No puedes jugar esa carta: el color activo es ${COLOR_NAMES[state.currentColor]} y no coincide en número ni símbolo.`;
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
let lastPlaySource = 'player';

function loadPersisted() {
  try {
    const savedName = localStorage.getItem('uno.name');
    if (savedName) playerName = savedName;
    const savedScores = localStorage.getItem('uno.scores');
    if (savedScores) scores = JSON.parse(savedScores);
  } catch (e) {
    /* localStorage unavailable — play without persistence */
  }
}

function persist() {
  try {
    localStorage.setItem('uno.name', playerName);
    localStorage.setItem('uno.scores', JSON.stringify(scores));
  } catch (e) {
    /* ignore */
  }
}

// ==== BOOTSTRAP ====

function newRound() {
  state = createInitialState();
  scored = false;
  roundPoints = START_POINTS;
  lastPlaySource = 'player';
  prevDiscardId = topOfDiscard(state).id; // skip fly-in on the opening card
  render(state);
}

function startGame() {
  renderScore();
  newRound();
  document.getElementById('start-screen').hidden = true;
  document.getElementById('game-screen').hidden = false;
}

function scheduleCpuIfNeeded() {
  if (state.phase === 'cpu-turn') {
    setTimeout(runCpuTurnAndRender, 1000);
  }
}

function runCpuTurnAndRender() {
  const result = runCpuTurn(state);
  lastPlaySource = 'cpu';
  state = result.state;
  render(state);

  if (result.event.kind === 'play' && result.event.card) {
    announcePlay(result.event.card, 'cpu', state);
  } else if (result.event.kind === 'draw-pass') {
    showToast('La CPU roba y pasa', 'special');
  }

  if (state.phase === 'cpu-turn' && state.winner === null) {
    setTimeout(runCpuTurnAndRender, 1000);
  }
}

// The player may attempt ANY card. Judging what is legal is the player's
// job — an illegal attempt costs points and explains why, but never plays.
function handlePlayerAttempt(cardId) {
  if (state.phase !== 'player-turn') return;
  const card = state.playerHand.find((c) => c.id === cardId);
  if (!card) return;

  if (!isValidPlay(card, state.currentColor, topOfDiscard(state))) {
    roundPoints = Math.max(0, roundPoints - PENALTY);
    renderPoints();
    showToast(`${invalidReason(state)} −${PENALTY} pts`, 'bad');
    return;
  }

  lastPlaySource = 'player';
  state = playCard(state, 'player', cardId);
  render(state);

  if (state.phase === 'color-selection') return; // announce after color chosen
  if (card.type !== 'number') announcePlay(card, 'player', state);
  scheduleCpuIfNeeded();
}

function handleDrawClick() {
  if (state.phase !== 'player-turn' || state.hasDrawn) return;
  state = drawForPlayer(state);
  render(state);
  showToast('Robaste una carta. Juégala si puedes o pasa el turno.', 'special');
}

loadPersisted();

const nameInput = document.getElementById('name-input');
if (playerName && playerName !== 'Jugador') nameInput.value = playerName;

document.getElementById('start-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const entered = nameInput.value.trim();
  playerName = entered || 'Jugador';
  persist();
  startGame();
});

document.getElementById('draw-pile').addEventListener('click', handleDrawClick);

document.getElementById('pass-btn').addEventListener('click', () => {
  if (state.phase !== 'player-turn' || !state.hasDrawn) return;
  state = passTurn(state);
  render(state);
  scheduleCpuIfNeeded();
});

document.querySelectorAll('.color-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (state.phase !== 'color-selection' || state.pendingPlayer !== 'player') return;
    const wildType = state.pendingCard.type;
    lastPlaySource = 'player';
    state = chooseColor(state, btn.dataset.color);
    render(state);
    announcePlay({ type: wildType }, 'player', state);
    scheduleCpuIfNeeded();
  });
});

document.getElementById('play-again-btn').addEventListener('click', newRound);
