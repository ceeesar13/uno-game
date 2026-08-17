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

function runCpuTurn(state) {
  const move = getCpuMove(state);

  if (move.action === 'draw') {
    const drawn = drawForCpu(state);
    const stillValid = getValidPlays(drawn.cpuHand, drawn.currentColor, topOfDiscard(drawn));
    if (stillValid.length === 0) {
      return nextTurnState(drawn, 'player');
    }
    return playCpuCard(drawn, stillValid[0]);
  }

  return playCpuCard(state, move.card);
}

// ==== RENDER ====

function cardLabel(card) {
  if (card.type === 'number') return String(card.value);
  const labels = { skip: '⦸', reverse: '⇄', 'draw-two': '+2', wild: '★', 'wild-draw-four': '+4' };
  return labels[card.type];
}

function createCardElement(card, { faceUp, playable }) {
  const el = document.createElement('div');
  el.className = 'card';
  if (!faceUp) {
    el.classList.add('card--back');
    return el;
  }
  el.classList.add(`card--${card.color || 'wild'}`);
  el.textContent = cardLabel(card);
  if (playable) el.classList.add('card--playable');
  return el;
}

function renderHands(state) {
  const top = topOfDiscard(state);
  const interactive = state.phase === 'player-turn';
  const validIds = interactive
    ? new Set(getValidPlays(state.playerHand, state.currentColor, top).map((c) => c.id))
    : new Set();

  const playerHandEl = document.getElementById('player-hand');
  playerHandEl.innerHTML = '';
  for (const card of state.playerHand) {
    const playable = interactive && validIds.has(card.id);
    const el = createCardElement(card, { faceUp: true, playable });
    if (playable) el.addEventListener('click', () => handlePlayerPlay(card.id));
    playerHandEl.appendChild(el);
  }

  document.getElementById('cpu-count').textContent = state.cpuHand.length;
  const cpuHandEl = document.getElementById('cpu-hand');
  cpuHandEl.innerHTML = '';
  for (let i = 0; i < state.cpuHand.length; i++) {
    cpuHandEl.appendChild(createCardElement(null, { faceUp: false }));
  }
}

function renderPiles(state) {
  document.querySelector('#draw-pile .card').onclick = () => handleDrawClick();

  const discardEl = document.getElementById('discard-pile');
  discardEl.innerHTML = '';
  discardEl.appendChild(createCardElement(topOfDiscard(state), { faceUp: true, playable: false }));
}

function renderTurnIndicator(state) {
  const labels = {
    'player-turn': 'Tu turno',
    'cpu-turn': 'Turno de la CPU',
    'color-selection': 'Eligiendo color...',
    'game-over': 'Fin del juego',
  };
  document.getElementById('turn-indicator').textContent = labels[state.phase] || '';
}

function renderColorPicker(state) {
  document.getElementById('color-picker').hidden =
    !(state.phase === 'color-selection' && state.pendingPlayer === 'player');
}

function renderPassButton(state) {
  document.getElementById('pass-btn').hidden = !(state.phase === 'player-turn' && state.hasDrawn);
}

function renderGameOver(state) {
  const el = document.getElementById('game-over');
  el.hidden = state.phase !== 'game-over';
  if (state.phase === 'game-over') {
    document.getElementById('game-over-message').textContent =
      state.winner === 'player' ? '¡Ganaste!' : 'Ganó la CPU';
  }
}

function render(state) {
  renderHands(state);
  renderPiles(state);
  renderTurnIndicator(state);
  renderColorPicker(state);
  renderPassButton(state);
  renderGameOver(state);
}

// ==== BOOTSTRAP ====

let state = createInitialState();
render(state);

function runCpuTurnAndRender() {
  state = runCpuTurn(state);
  render(state);
  if (state.phase === 'cpu-turn' && state.winner === null) {
    setTimeout(runCpuTurnAndRender, 700);
  }
}

function handlePlayerPlay(cardId) {
  state = playCard(state, 'player', cardId);
  render(state);
  if (state.phase === 'cpu-turn') {
    setTimeout(runCpuTurnAndRender, 700);
  }
}

function handleDrawClick() {
  if (state.phase !== 'player-turn' || state.hasDrawn) return;
  const validPlays = getValidPlays(state.playerHand, state.currentColor, topOfDiscard(state));
  if (validPlays.length > 0) return;
  state = drawForPlayer(state);
  render(state);
}

document.getElementById('pass-btn').addEventListener('click', () => {
  if (state.phase !== 'player-turn' || !state.hasDrawn) return;
  state = passTurn(state);
  render(state);
  setTimeout(runCpuTurnAndRender, 700);
});

document.querySelectorAll('.color-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (state.phase !== 'color-selection' || state.pendingPlayer !== 'player') return;
    state = chooseColor(state, btn.dataset.color);
    render(state);
    if (state.phase === 'cpu-turn') {
      setTimeout(runCpuTurnAndRender, 700);
    }
  });
});

document.getElementById('play-again-btn').addEventListener('click', () => {
  state = createInitialState();
  render(state);
});
