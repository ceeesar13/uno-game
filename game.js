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

  return finalizePlay({ ...state, [handKey]: newHand }, card, playerKey);
}

// ==== RENDER ====

function render(state) {
  document.getElementById('cpu-count').textContent = state.cpuHand.length;
  document.getElementById('player-hand').textContent =
    state.playerHand.map((c) => `${c.color || 'wild'}-${c.type}${c.value ?? ''}`).join(', ');
  const top = topOfDiscard(state);
  document.getElementById('discard-pile').textContent = `${top.color || 'wild'}-${top.type}${top.value ?? ''}`;
  document.getElementById('turn-indicator').textContent = state.phase;
}

// ==== BOOTSTRAP ====

let state = createInitialState();
render(state);

document.getElementById('discard-pile').addEventListener('click', () => {
  const top = topOfDiscard(state);
  const valid = getValidPlays(state.playerHand, state.currentColor, top).find((c) => c.type === 'number');
  if (state.phase === 'player-turn' && valid) {
    state = playCard(state, 'player', valid.id);
    render(state);
  }
});
