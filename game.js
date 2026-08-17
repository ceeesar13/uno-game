// ==== APP / UI ====
// The DOM layer. All pure game rules live in engine.js; this file only renders
// state, animates, announces, and translates user input into engine moves.

import {
  COLORS,
  createInitialState,
  isValidPlay,
  canPlayWildDrawFour,
  getValidPlays,
  topOfDiscard,
  nextIndexFrom,
  playCard,
  chooseColor,
  drawForCurrent,
  passTurn,
  absorbPending,
  runCpuTurn,
  buildOpponents,
  hashSeed,
  handPoints,
} from './engine.js';

import * as audio from './audio.js';
import { drawFlightsFor, deckDepth, underStack } from './anim.js';

// ==== RENDER CONSTANTS ====

const COLOR_NAMES = { red: 'Rojo', blue: 'Azul', green: 'Verde', yellow: 'Amarillo' };
const COLOR_VARS = {
  red: 'var(--uno-red)', blue: 'var(--uno-blue)',
  green: 'var(--uno-green)', yellow: 'var(--uno-yellow)',
};
const CARD_SYMBOLS = { skip: '⊘', reverse: '⇄', 'draw-two': '+2', 'wild-draw-four': '+4' };
const STYLE_LABELS = { easy: 'Impulsiva', aggressive: 'Agresivo', expert: 'Calculadora' };
const RULES_BY_KEY = { classic: {}, drawToMatch: { drawToMatch: true }, stacking: { stacking: true } };
const RULES_NAME = { classic: 'Clásico', drawToMatch: 'Robar hasta jugar', stacking: 'Acumular +2/+4' };

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

// Human-readable label for a played card (used in log / narration).
function cardText(card, activeColor) {
  switch (card.type) {
    case 'number': return `${COLOR_NAMES[card.color]} ${card.value}`;
    case 'draw-two': return `${COLOR_NAMES[card.color]} +2`;
    case 'skip': return `salto ${COLOR_NAMES[card.color]}`;
    case 'reverse': return `reversa ${COLOR_NAMES[card.color]}`;
    case 'wild': return `comodín (${COLOR_NAMES[card.color || activeColor]})`;
    case 'wild-draw-four': return `+4 (${COLOR_NAMES[card.color || activeColor]})`;
    default: return 'una carta';
  }
}

// ==== CARD ELEMENTS ====

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

// Seat placement around the table by opponent count.
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

    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.textContent = player.initial;
    head.appendChild(avatar);

    const nameEl = document.createElement('span');
    nameEl.className = 'cpu-player__name';
    nameEl.textContent = player.name;
    head.appendChild(nameEl);

    const botTag = document.createElement('span');
    botTag.className = 'bot-tag';
    botTag.textContent = 'Bot';
    head.appendChild(botTag);

    const count = document.createElement('span');
    count.className = 'count-badge';
    count.textContent = String(player.hand.length);
    head.appendChild(count);

    zone.appendChild(head);

    // Tactical tell: a readable style label so behaviour maps to identity.
    const styleTag = document.createElement('span');
    styleTag.className = 'style-tag';
    styleTag.textContent = STYLE_LABELS[player.style] || '';
    zone.appendChild(styleTag);

    // Tactical tell: a visible warning when a rival is about to win.
    if (state.phase !== 'game-over' && player.hand.length <= 2) {
      const warn = document.createElement('span');
      warn.className = 'uno-warn' + (player.hand.length === 1 ? ' uno-warn--one' : '');
      warn.textContent = player.hand.length === 1 ? '¡UNO!' : '2 cartas';
      zone.appendChild(warn);
    }

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
  const validIds = interactive ? new Set(getValidPlays(state, 0).map((c) => c.id)) : new Set();

  const handEl = document.getElementById('player-hand');
  handEl.innerHTML = '';
  const n = human.hand.length;
  human.hand.forEach((card, i) => {
    const el = buildCardElement(card, { faceUp: true });
    applyFanTransform(el, i, n, 3, 3.5);
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', cardAriaLabel(card));
    el.tabIndex = interactive ? 0 : -1;

    if (!interactive) {
      el.classList.add('card--off');
      el.setAttribute('aria-disabled', 'true');
    } else if (validIds.has(card.id)) {
      // Positive affordance: mark the legal plays without disabling the rest,
      // so an illegal attempt still teaches (with its point penalty).
      el.classList.add('card--playable');
    }

    el.dataset.cardId = card.id;
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
  fitHand(handEl, n);
}

// Tighten the fan just enough that N cards fit the available width, so large
// hands never overflow the viewport. Beyond the overlap cap, fall back to a
// scrollable strip (keeps every card reachable via keyboard/touch).
function fitHand(handEl, n) {
  if (n <= 1) {
    handEl.style.removeProperty('--overlap');
    handEl.classList.remove('fan--scroll');
    return;
  }
  requestAnimationFrame(() => {
    const sample = handEl.querySelector('.card');
    if (!sample) return;
    const cw = sample.offsetWidth || 60;
    const avail = handEl.clientWidth - 8;
    const DEFAULT = -0.42;
    const CAP = -0.72; // never overlap past this — keeps a usable sliver
    const step = (avail - cw) / ((n - 1) * cw); // = 1 + overlap
    let overlap = step - 1;
    const needsScroll = overlap < CAP;
    overlap = Math.min(DEFAULT, Math.max(CAP, overlap));
    handEl.style.setProperty('--overlap', overlap.toFixed(3));
    handEl.classList.toggle('fan--scroll', needsScroll);
  });
}

function renderPiles(state) {
  const discardEl = document.getElementById('discard-pile');
  const top = topOfDiscard(state);
  discardEl.innerHTML = '';
  // The messy pile: recent discards peek out under the top card, each with a
  // stable rotation, so the stack visibly grows as the game goes on.
  for (const { card, rot } of underStack(state.discardPile, 4)) {
    const el = buildCardElement(card, { faceUp: true });
    el.classList.add('card--under');
    el.style.setProperty('--under-rot', rot + 'deg');
    discardEl.appendChild(el);
  }
  discardEl.appendChild(buildCardElement(top, { faceUp: true }));
  discardEl.setAttribute('aria-label', 'Carta en juego: ' + cardAriaLabel(top));

  const drawBtn = document.getElementById('draw-pile');
  const caption = document.getElementById('draw-caption');
  const myTurn = state.phase === 'turn' && state.currentPlayer === 0;
  const pending = state.pendingDraw > 0;

  // The deck reads as a physical stack: thickness follows the cards left.
  const back = drawBtn.querySelector('.card--back');
  if (back) {
    const depth = deckDepth(state.deck.length);
    let shadow = '0 6px 12px rgba(0,0,0,0.35)';
    for (let i = 1; i <= depth; i++) {
      shadow += `, ${(-i * 1.7).toFixed(1)}px ${(i * 1.7).toFixed(1)}px 0 -1px #101014`;
      shadow += `, ${(-i * 1.7).toFixed(1)}px ${(i * 1.7).toFixed(1)}px 0 0 rgba(255,255,255,0.3)`;
    }
    back.style.boxShadow = shadow;
  }

  const canDraw = myTurn && (pending || !state.hasDrawn);
  drawBtn.disabled = !canDraw;
  drawBtn.setAttribute('aria-disabled', String(!canDraw));

  if (pending && myTurn) {
    caption.textContent = `Robar ${state.pendingDraw}`;
    drawBtn.setAttribute('aria-label', `Robar ${state.pendingDraw} cartas y perder el turno`);
  } else {
    caption.textContent = `Robar · ${state.deck.length}`;
    drawBtn.setAttribute('aria-label', `Robar una carta (quedan ${state.deck.length} en el mazo)`);
  }
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
      if (state.pendingDraw > 0) {
        banner.textContent = `Te toca — acumulado +${state.pendingDraw}`;
      } else {
        banner.textContent = `Te toca, ${state.players[0].name}`;
      }
    } else {
      banner.classList.add('banner--cpu');
      banner.innerHTML = '';
      banner.append(`Juega ${currentName(state)}`);
      const dots = document.createElement('span');
      dots.className = 'banner__dots';
      banner.appendChild(dots);
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
    !(state.phase === 'turn' && state.currentPlayer === 0 && state.hasDrawn && state.pendingDraw === 0);
}

function renderPoints() {
  document.getElementById('points').textContent = matchTotals.you || 0;
}

function renderScore() {
  document.getElementById('score-player-name').textContent = playerName;
  document.getElementById('score-player').textContent = scores.player;
  document.getElementById('score-cpu').textContent = scores.cpu;
  document.getElementById('player-label').textContent = playerName;
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
  renderHistoryLive(state);
  renderGameOver(state);
  manageTurnTimer(state);
  audio.onRender(state);
}

// ==== HISTORY: on-screen log + screen-reader announcements ====

function nameOf(state, i) {
  return i === 0 ? 'Tú' : state.players[i].name;
}

// Turn a structured engine event into a Spanish sentence. Returns null for
// events we don't surface.
function eventSentence(event, state) {
  switch (event.type) {
    case 'start':
      return `Sale ${cardText(event.card, event.color)}.`;
    case 'play': {
      const who = event.player === 0 ? 'Juegas' : `${state.players[event.player].name} juega`;
      return `${who} ${cardText(event.card, event.color)}.`;
    }
    case 'penalty': {
      const cause = event.cause === 'stack' ? 'acumulado' : event.cause === 'wild-draw-four' ? '+4' : '+2';
      return `${nameOf(state, event.player)} roba ${event.count} (${cause}).`;
    }
    case 'skip':
      return `${nameOf(state, event.player)} pierde el turno.`;
    case 'reverse':
      return 'Cambia el sentido del juego.';
    case 'draw':
      return `${nameOf(state, event.player)} roba una carta.`;
    case 'pass':
      return `${nameOf(state, event.player)} pasa el turno.`;
    case 'reshuffle':
      return 'Se rebaraja el mazo.';
    case 'stack':
      return `${nameOf(state, event.player)} enfrenta un acumulado de +${event.total}.`;
    case 'win':
      return `${nameOf(state, event.player)} gana la partida.`;
    default:
      return null;
  }
}

let lastAnnouncedSeq = 0;

// Announce every new event since the last render through the live region, and
// keep the (currently open) history list in sync.
function renderHistoryLive(state) {
  const fresh = state.history.filter((e) => e.seq > lastAnnouncedSeq);
  if (fresh.length) {
    // One integration point covers every draw: human, bot, +2/+4 victims,
    // stack absorptions, and draw-to-match chains.
    for (const flight of drawFlightsFor(fresh)) {
      flyDrawnCards(flight.player, flight.count);
      audio.play('draw');
    }
    const lines = fresh.map((e) => eventSentence(e, state)).filter(Boolean);
    if (lines.length) document.getElementById('sr-live').textContent = lines.join(' ');
    lastAnnouncedSeq = state.seq;
  }
  if (!document.getElementById('history-dialog').hidden) renderHistoryList(state);
}

function renderHistoryList(state) {
  const list = document.getElementById('history-list');
  list.innerHTML = '';
  for (const event of state.history) {
    const sentence = eventSentence(event, state);
    if (!sentence) continue;
    const li = document.createElement('li');
    li.textContent = sentence;
    list.appendChild(li);
  }
  list.scrollTop = list.scrollHeight;
}

// ==== GAME OVER + THREE-MOMENT SUMMARY ====

// Build three honest, history-derived takeaways. No invented motivations.
function buildSummary(state) {
  const out = [];
  const players = state.players;

  // 1) The single biggest swing: the largest draw penalty inflicted, credited
  //    to whoever played the card just before it.
  let biggest = null;
  state.history.forEach((e, i) => {
    if (e.type === 'penalty' && (!biggest || e.count > biggest.count)) {
      // Find the play that caused it (nearest preceding play).
      let cause = null;
      for (let j = i - 1; j >= 0; j--) {
        if (state.history[j].type === 'play') { cause = state.history[j]; break; }
      }
      biggest = { ...e, by: cause ? cause.player : null };
    }
  });
  if (biggest) {
    const victim = biggest.player === 0 ? 'ti' : state.players[biggest.player].name;
    if (biggest.by != null && biggest.by !== biggest.player) {
      out.push(biggest.by === 0
        ? `El golpe que más pesó: le hiciste robar ${biggest.count} a ${victim}.`
        : `El golpe que más pesó: ${state.players[biggest.by].name} hizo robar ${biggest.count} a ${victim}.`);
    } else {
      out.push(biggest.player === 0
        ? `El golpe que más pesó: tuviste que robar ${biggest.count}.`
        : `El golpe que más pesó: ${state.players[biggest.player].name} tuvo que robar ${biggest.count}.`);
    }
  } else {
    out.push('Partida limpia: nadie encajó penalizaciones grandes.');
  }

  // 2) A readable rival pattern: the bot that leaned hardest on special cards.
  const specials = players.map((p, i) =>
    i === 0 ? -1 : state.history.filter((e) => e.type === 'play' && e.player === i && e.card.type !== 'number').length
  );
  let topBot = 1;
  for (let i = 2; i < players.length; i++) if (specials[i] > specials[topBot]) topBot = i;
  if (players.length > 1 && specials[topBot] > 0) {
    const desc = {
      easy: 'jugó a instinto, sin reservar cartas',
      aggressive: 'presionó con cartas de ataque',
      expert: 'guardó los comodines para el momento justo',
    }[players[topBot].style] || 'siguió su estilo';
    out.push(`Patrón para leer: ${players[topBot].name} ${desc} (${specials[topBot]} especiales).`);
  } else {
    out.push('Patrón para leer: esta vez casi todo se jugó con números.');
  }

  // 3) A concrete alternative for next time, derived from YOUR play.
  const yourDraws = state.history.filter((e) => e.type === 'draw' && e.player === 0).length;
  const hitOnYou = state.history.filter((e) => e.type === 'penalty' && e.player === 0).reduce((a, e) => a + e.count, 0);
  if (state.winner === 0) {
    out.push('Para la próxima: sube a más bots y prueba una regla de casa.');
  } else if (hitOnYou >= 6) {
    out.push('Para la próxima: cambia de color antes de quedar sin salidas y guarda un comodín de defensa.');
  } else if (yourDraws >= 5) {
    out.push('Para la próxima: conserva números de varios colores para no depender del mazo.');
  } else {
    out.push('Para la próxima: retén una carta de ataque (+2/salto) para el jugador que esté por ganar.');
  }

  return out;
}

let gameOverFocused = false;
let lastRoundEarned = 0;

function renderGameOver(state) {
  const el = document.getElementById('game-over');
  el.hidden = state.phase !== 'game-over';
  if (state.phase !== 'game-over') return;

  const humanWon = state.winner === 0;
  if (!scored) {
    scores[humanWon ? 'player' : 'cpu'] += 1;
    // Official scoring: the round winner collects every opponent's hand value.
    lastRoundEarned = state.players.reduce(
      (sum, p, i) => (i === state.winner ? sum : sum + handPoints(p.hand)),
      0
    );
    const winnerId = state.players[state.winner].id;
    matchTotals[winnerId] = (matchTotals[winnerId] || 0) + lastRoundEarned;
    scored = true;
    recordTelemetry(state);
    persist();
    renderScore();
    renderPoints(); // the chip renders before scoring — refresh it now
  }

  const winnerId = state.players[state.winner].id;
  const winnerTotal = matchTotals[winnerId] || 0;
  const matchWon = winnerTotal >= MATCH_TARGET;
  const winnerName = humanWon ? playerName : state.players[state.winner].name;

  document.getElementById('game-over-message').textContent = matchWon
    ? (humanWon ? `🏆 ¡${playerName} gana la partida!` : `🏆 ${winnerName} gana la partida`)
    : (humanWon ? `¡Ganaste la ronda, ${playerName}!` : `${winnerName} gana la ronda`);
  document.getElementById('game-over-score').textContent =
    `${winnerName} suma ${lastRoundEarned} pts · lleva ${winnerTotal}/${MATCH_TARGET} · ${RULES_NAME[currentRulesKey]}`;

  const summaryEl = document.getElementById('game-over-summary');
  summaryEl.innerHTML = '';
  for (const line of buildSummary(state)) {
    const li = document.createElement('li');
    li.textContent = line;
    summaryEl.appendChild(li);
  }

  document.getElementById('share-out').hidden = true;

  if (!gameOverFocused) {
    lastFocused = null;
    document.getElementById('play-again-btn').focus();
    gameOverFocused = true;
  }
}

// ==== TOASTS + PLAY ANNOUNCEMENTS ====

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

const REACTIONS = {
  easy: {
    play: ['¡Uy, esta me sirve!', 'A ver qué tal…', '¡Me encanta esto!'],
    special: ['¡Ay, perdón!', '¡No era mi intención!', '¡Uy, qué nervios!'],
    hit: ['¡Ay, no!', 'Bueno, ni modo', '¡Oye, eso dolió!'],
    draw: ['Otra más, va', 'A robar entonces'],
    win: ['¡Gané! ¡Qué emoción!'],
    uno: ['¡Me queda una!'],
  },
  aggressive: {
    play: ['Así se juega.', 'Sin piedad.', 'Voy con todo.'],
    special: ['Toma esto.', 'Nada personal.', 'Aguántate.'],
    hit: ['¿En serio?', 'Me la vas a pagar.', 'Ja, no me afecta.'],
    draw: ['Tsk. Robo.', 'Paso… por ahora.'],
    win: ['Obvio. Gané.'],
    uno: ['Una carta. Se acabó.'],
  },
  expert: {
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

function showBubble(playerIndex, text) {
  bubbles[playerIndex] = text;
  render(state);
  registerTimer(setTimeout(() => {
    if (bubbles[playerIndex] === text) {
      delete bubbles[playerIndex];
      render(state);
    }
  }, 2000));
}

function maybeReact(playerIndex, kind, chance) {
  if (playerIndex === 0) return;
  if (Math.random() > (chance == null ? 0.5 : chance)) return;
  const line = pickReaction(state.players[playerIndex], kind);
  if (line) showBubble(playerIndex, line);
}

// ==== ANIMATION ====

function flyCardToCenter(card, fromEl) {
  if (!fromEl) return;
  const discardEl = document.getElementById('discard-pile');
  const realCard = discardEl.querySelector('.card:not(.card--under)');
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

  registerTimer(setTimeout(() => {
    clone.remove();
    if (realCard) realCard.style.visibility = 'visible';
  }, 440));
}

function seatElement(playerIndex) {
  if (playerIndex === 0) return document.getElementById('player-hand');
  return document.querySelector(`.cpu-player[data-index="${playerIndex}"]`);
}

// Visible rejection on the attempted card: shake + a ✕ badge. The hand is
// deliberately NOT pre-filtered — knowing what is playable is part of the
// game — so an illegal attempt answers on the card itself.
function rejectCard(cardId) {
  const el = document.querySelector(`#player-hand .card[data-card-id="${cardId}"]`);
  if (!el) return;
  el.classList.add('card--rejected');
  registerTimer(setTimeout(() => el.classList.remove('card--rejected'), 650));
}

// Drawn/penalty cards physically travel from the deck to whoever receives
// them — staggered, face down, capped so a big penalty stays readable.
function flyDrawnCards(playerIndex, count) {
  const drawEl = document.getElementById('draw-pile');
  const toEl = seatElement(playerIndex);
  if (!drawEl || !toEl) return;
  const from = drawEl.getBoundingClientRect();
  const to = toEl.getBoundingClientRect();
  const n = Math.min(count, 4);

  for (let k = 0; k < n; k++) {
    registerTimer(setTimeout(() => {
      const clone = buildCardElement(null, { faceUp: false });
      clone.classList.add('flying-card');
      clone.style.left = from.left + from.width / 2 + 'px';
      clone.style.top = from.top + from.height / 2 + 'px';
      document.body.appendChild(clone);
      requestAnimationFrame(() => {
        clone.style.left = to.left + to.width / 2 + 'px';
        clone.style.top = to.top + to.height / 2 + 'px';
        clone.classList.add('flying-card--landed');
      });
      registerTimer(setTimeout(() => clone.remove(), 460));
    }, k * 110));
  }
}

// ==== APP STATE + PERSISTENCE ====

// Official UNO match play: the round winner collects the value of every
// opponent's hand; first to reach the target wins the match.
const MATCH_TARGET = 500;
const TURN_SECONDS = 20;

let state = null;
let playerName = 'Jugador';
let scores = { player: 0, cpu: 0 };
let scored = false;
let matchTotals = {}; // player id -> accumulated match points
let opponentCount = 1;
let currentRulesKey = 'classic';
let currentSeed = null;
let quickMode = false;
let thinkingIndex = null;
let bubbles = {};
let drawnCardId = null;
let lastFocused = null;
let telemetry = {};
let pendingChallenge = null; // { seed, opponents, rulesKey }

// Bot-turn pacing. Quick mode shortens the beats.
let THINK_MS = 950;
let AFTER_MS = 750;

// All timers are registered so a restart can cancel pending bot turns — no
// stale callback fires into a fresh round.
let pendingTimers = [];
function registerTimer(id) { pendingTimers.push(id); return id; }
function clearTimers() { pendingTimers.forEach(clearTimeout); pendingTimers = []; }

function loadPersisted() {
  try {
    const savedName = localStorage.getItem('uno.name');
    if (savedName) playerName = savedName;
    const savedScores = localStorage.getItem('uno.scores');
    if (savedScores) scores = JSON.parse(savedScores);
    const savedCount = localStorage.getItem('uno.opponents');
    if (savedCount) opponentCount = Math.min(3, Math.max(1, parseInt(savedCount, 10) || 1));
    const savedRules = localStorage.getItem('uno.rules');
    if (savedRules && RULES_BY_KEY[savedRules]) currentRulesKey = savedRules;
    const savedTel = localStorage.getItem('uno.telemetry');
    if (savedTel) telemetry = JSON.parse(savedTel);
    const savedMatch = localStorage.getItem('uno.match');
    if (savedMatch) matchTotals = JSON.parse(savedMatch);
  } catch (e) {
    /* localStorage unavailable — play without persistence */
  }
}

function persist() {
  try {
    localStorage.setItem('uno.name', playerName);
    localStorage.setItem('uno.scores', JSON.stringify(scores));
    localStorage.setItem('uno.opponents', String(opponentCount));
    localStorage.setItem('uno.rules', currentRulesKey);
    localStorage.setItem('uno.telemetry', JSON.stringify(telemetry));
    localStorage.setItem('uno.match', JSON.stringify(matchTotals));
  } catch (e) {
    /* ignore */
  }
}

// Accumulate per-bot behaviour so patterns become evidence over time.
function recordTelemetry(finalState) {
  for (let i = 1; i < finalState.players.length; i++) {
    const p = finalState.players[i];
    const rec = telemetry[p.id] || { games: 0, specials: 0, plays: 0 };
    rec.games += 1;
    for (const e of finalState.history) {
      if (e.type === 'play' && e.player === i) {
        rec.plays += 1;
        if (e.card.type !== 'number') rec.specials += 1;
      }
    }
    telemetry[p.id] = rec;
  }
}

// ==== SHAREABLE CHALLENGE (seed + config, no backend) ====

function encodeChallenge() {
  const payload = { s: currentSeed, o: opponentCount, r: currentRulesKey };
  return btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeChallenge(code) {
  try {
    const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
    const obj = JSON.parse(atob(b64));
    if (!obj || obj.s == null) return null;
    const rulesKey = RULES_BY_KEY[obj.r] ? obj.r : 'classic';
    const opponents = Math.min(3, Math.max(1, parseInt(obj.o, 10) || 1));
    return { seed: String(obj.s), opponents, rulesKey };
  } catch (e) {
    return null;
  }
}

function readChallengeFromUrl() {
  const hash = location.hash || '';
  const m = hash.match(/c=([^&]+)/);
  if (!m) return;
  const parsed = decodeChallenge(decodeURIComponent(m[1]));
  if (!parsed) return;
  pendingChallenge = parsed;
  opponentCount = parsed.opponents;
  currentRulesKey = parsed.rulesKey;
}

function shareChallenge() {
  const url = `${location.origin}${location.pathname}#c=${encodeChallenge()}`;
  const out = document.getElementById('share-out');
  // Always show the link (so it's usable even if the clipboard is unavailable),
  // then upgrade the message if the copy succeeds.
  out.hidden = false;
  out.textContent = url;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(
      () => { out.textContent = '¡Enlace copiado! Misma semilla y reglas: ' + url; },
      () => {}
    );
  }
}

// ==== BOOTSTRAP ====

function newRound() {
  clearTimers();
  audio.resetTransitions();
  // A shared challenge fixes the seed; otherwise each round gets fresh entropy.
  const seed = pendingChallenge ? pendingChallenge.seed : String(hashSeed('' + Date.now() + ':' + Math.random()));
  currentSeed = seed;
  state = createInitialState({
    humanName: playerName,
    opponents: buildOpponents(opponentCount),
    seed,
    rules: RULES_BY_KEY[currentRulesKey],
  });
  pendingChallenge = null; // consumed; the next round is a fresh game
  scored = false;
  // A finished match (someone reached the target) starts fresh totals.
  if (Object.values(matchTotals).some((v) => v >= MATCH_TARGET)) matchTotals = {};
  thinkingIndex = null;
  bubbles = {};
  drawnCardId = null;
  gameOverFocused = false;
  lastAnnouncedSeq = 0;
  render(state);
}

// Abandoning a round in progress counts as a loss — quitting is never free.
function forfeitIfMidRound() {
  if (state && state.phase !== 'game-over') {
    scores.cpu += 1;
    persist();
    renderScore();
  }
}

function exitToMenu() {
  clearTimers();
  stopTurnTimer();
  document.getElementById('quit-dialog').hidden = true;
  document.getElementById('game-over').hidden = true;
  document.getElementById('game-screen').hidden = true;
  document.getElementById('start-screen').hidden = false;
  state = null;
  document.getElementById('name-input').focus();
}

function startGame() {
  if (quickMode) { THINK_MS = 380; AFTER_MS = 280; opponentCount = pendingChallenge ? opponentCount : 1; }
  else { THINK_MS = 950; AFTER_MS = 750; }
  renderScore();
  newRound();
  document.getElementById('start-screen').hidden = true;
  document.getElementById('game-screen').hidden = false;
}

function isBotTurn() {
  return state.phase === 'turn' && state.currentPlayer !== 0 && state.winner === null;
}

// ==== TURN TIMER ====
// Official UNO has no clock; digital tables add one so nobody stalls. The
// penalty is the natural one: time out and you draw a card and pass.

let turnTimer = { intervalId: null, deadline: 0 };

function stopTurnTimer() {
  if (turnTimer.intervalId) {
    clearInterval(turnTimer.intervalId);
    turnTimer.intervalId = null;
  }
  const el = document.getElementById('turn-timer');
  if (el) el.hidden = true;
}

function manageTurnTimer(state) {
  const active = state.phase === 'turn' && state.currentPlayer === 0 && state.winner === null;
  if (!active) {
    stopTurnTimer();
    return;
  }
  if (turnTimer.intervalId) return; // this turn is already being timed

  const el = document.getElementById('turn-timer');
  turnTimer.deadline = Date.now() + TURN_SECONDS * 1000;
  el.hidden = false;
  const tick = () => {
    const left = Math.max(0, Math.ceil((turnTimer.deadline - Date.now()) / 1000));
    el.textContent = `⏱ ${left} s`;
    el.classList.toggle('turn-timer--urgent', left <= 5);
    if (left <= 0) {
      stopTurnTimer();
      timeoutTurn();
    }
  };
  tick();
  turnTimer.intervalId = setInterval(tick, 250);
}

function timeoutTurn() {
  if (!state || state.phase !== 'turn' || state.currentPlayer !== 0) return;
  if (state.pendingDraw > 0) {
    const total = state.pendingDraw;
    state = absorbPending(state);
    render(state);
    showToast(`Tiempo agotado: robas ${total} y pierdes el turno.`, 'bad');
  } else {
    if (!state.hasDrawn) state = drawForCurrent(state);
    state = passTurn(state);
    render(state);
    showToast('Tiempo agotado: robas una carta y pasas el turno.', 'bad');
  }
  audio.play('error');
  scheduleCpuIfNeeded();
}

function scheduleCpuIfNeeded() {
  if (isBotTurn()) registerTimer(setTimeout(beginCpuThinking, AFTER_MS));
}

function beginCpuThinking() {
  if (!isBotTurn()) return;
  thinkingIndex = state.currentPlayer;
  render(state);
  registerTimer(setTimeout(resolveCpuTurn, THINK_MS));
}

function resolveCpuTurn() {
  thinkingIndex = null;
  if (!isBotTurn()) { render(state); return; }
  const result = runCpuTurn(state);
  const actorIndex = result.event.playerIndex;
  state = result.state;
  render(state);

  if (result.event.kind === 'play') {
    flyCardToCenter(topOfDiscard(state), seatElement(actorIndex));
    audio.playCard(result.event.card);
  }
  narrateBotAction(result.event, actorIndex);

  if (isBotTurn()) registerTimer(setTimeout(beginCpuThinking, AFTER_MS));
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

function narrateBotAction(event, actorIndex) {
  const actor = state.players[actorIndex];

  if (event.kind === 'draw-pass') {
    showBubble(actorIndex, 'Robo y paso');
    return;
  }
  if (event.kind === 'absorb') {
    showBubble(actorIndex, `Robo ${event.count}`);
    return;
  }

  let text = playLabel(event.card, state);
  if (event.card.type !== 'number' && Math.random() < 0.65) {
    const line = pickReaction(actor, 'special');
    if (line) text += ' · ' + line;
  }
  showBubble(actorIndex, text);
}

// The human may attempt ANY card. Legality is judged against the engine's own
// getValidPlays so a person and a bot are held to the exact same rule.
function handlePlayerAttempt(cardId) {
  if (state.phase !== 'turn' || state.currentPlayer !== 0) return;
  const card = state.players[0].hand.find((c) => c.id === cardId);
  if (!card) return;

  // Facing a stacked penalty: only a matching draw card may be played.
  if (state.pendingDraw > 0) {
    if (card.type !== state.pendingDrawType) {
      const label = state.pendingDrawType === 'draw-two' ? '+2' : '+4';
      rejectCard(cardId);
      audio.play('error');
      showToast(`Acumulado +${state.pendingDraw}: juega otro ${label} o roba ${state.pendingDraw}.`, 'bad');
      return;
    }
    commitHumanPlay(card, cardId);
    return;
  }

  // After drawing, only the freshly drawn card may be played.
  if (state.hasDrawn && cardId !== drawnCardId) {
    rejectCard(cardId);
    audio.play('error');
    showToast('Ya robaste: solo puedes jugar la carta robada, o pasar el turno.', 'bad');
    return;
  }

  // Wild Draw Four is only legal when you hold no card of the active colour.
  if (card.type === 'wild-draw-four' && !canPlayWildDrawFour(state.players[0].hand, state.currentColor)) {
    rejectCard(cardId);
    audio.play('error');
    showToast(`No puedes jugar +4: todavía tienes cartas ${COLOR_NAMES[state.currentColor]}.`, 'bad');
    return;
  }

  if (!isValidPlay(card, state.currentColor, topOfDiscard(state))) {
    rejectCard(cardId);
    audio.play('error');
    showToast(invalidReason(state), 'bad');
    return;
  }

  commitHumanPlay(card, cardId);
}

function commitHumanPlay(card, cardId) {
  const victimIdx = nextIndexFrom(0, state.direction, state.players.length, 1);
  state = playCard(state, 0, cardId);
  render(state);

  if (state.phase === 'color-selection') {
    lastFocused = document.activeElement;
    const firstColor = document.querySelector('#color-picker .color-btn');
    if (firstColor) firstColor.focus();
    return; // fly + announce after colour chosen
  }
  flyCardToCenter(topOfDiscard(state), seatElement(0));
  audio.playCard(card);
  if (card.type !== 'number') {
    announcePlay(card, 0, state);
    if (card.type === 'draw-two' || card.type === 'skip') maybeReact(victimIdx, 'hit', 0.8);
  }
  scheduleCpuIfNeeded();
}

function handleDrawClick() {
  if (state.phase !== 'turn' || state.currentPlayer !== 0) return;

  // Stacking: drawing while a penalty is pending means "give in and absorb".
  if (state.pendingDraw > 0) {
    const total = state.pendingDraw;
    state = absorbPending(state);
    render(state);
    showToast(`Robaste ${total} y pierdes el turno.`, 'bad');
    scheduleCpuIfNeeded();
    return;
  }

  if (state.hasDrawn) return;
  state = drawForCurrent(state);
  const hand = state.players[0].hand;
  drawnCardId = hand[hand.length - 1].id;
  render(state);
  showToast('Robaste una carta. Juégala si puedes o pasa el turno.', 'special');
}

// ==== FOCUS MANAGEMENT ====

function restoreFocus() {
  if (lastFocused && document.body.contains(lastFocused)) {
    lastFocused.focus();
  } else {
    const card = document.querySelector('#player-hand .card');
    if (card) card.focus();
  }
  lastFocused = null;
}

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

// ==== HISTORY DIALOG ====

function openHistory() {
  const dialog = document.getElementById('history-dialog');
  lastFocused = document.activeElement;
  renderHistoryList(state);
  dialog.hidden = false;
  document.getElementById('history-close').focus();
}

function closeHistory() {
  document.getElementById('history-dialog').hidden = true;
  restoreFocus();
}

// ==== WIRING ====

loadPersisted();
readChallengeFromUrl();
audio.init();

const muteBtn = document.getElementById('mute-btn');
function syncMuteButton() {
  const on = !audio.isMuted();
  muteBtn.setAttribute('aria-pressed', String(on));
  muteBtn.setAttribute('aria-label', on ? 'Silenciar sonido' : 'Activar sonido');
  muteBtn.textContent = on ? 'Sonido' : 'Silencio';
  muteBtn.classList.toggle('icon-btn--off', !on);
}
muteBtn.addEventListener('click', () => {
  audio.setMuted(!audio.isMuted());
  if (!audio.isMuted()) audio.play('turn'); // audible confirmation
  syncMuteButton();
});
syncMuteButton();

const nameInput = document.getElementById('name-input');
if (playerName && playerName !== 'Jugador') nameInput.value = playerName;

// Challenge banner + preset selection reflect a shared link.
if (pendingChallenge) {
  const banner = document.getElementById('challenge-banner');
  banner.hidden = false;
  banner.textContent = `Desafío compartido · ${pendingChallenge.opponents} bot(s) · ${RULES_NAME[pendingChallenge.rulesKey]}. Misma semilla para todos.`;
}

document.querySelectorAll('.opp-option').forEach((btn) => {
  if (parseInt(btn.dataset.count, 10) === opponentCount) btn.classList.add('opp-option--on');
  btn.addEventListener('click', () => {
    opponentCount = parseInt(btn.dataset.count, 10);
    pendingChallenge = null; // changing config leaves the shared challenge
    document.querySelectorAll('.opp-option').forEach((b) => b.classList.toggle('opp-option--on', b === btn));
  });
});

function syncRuleButtons() {
  document.querySelectorAll('.rule-option').forEach((b) => {
    const on = b.dataset.rule === currentRulesKey;
    b.classList.toggle('rule-option--on', on);
    b.setAttribute('aria-checked', String(on));
  });
}
document.querySelectorAll('.rule-option').forEach((btn) => {
  btn.addEventListener('click', () => {
    currentRulesKey = btn.dataset.rule;
    pendingChallenge = null;
    syncRuleButtons();
  });
});
syncRuleButtons();

document.getElementById('start-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const entered = nameInput.value.trim();
  playerName = entered || 'Jugador';
  quickMode = false;
  persist();
  startGame();
});

document.getElementById('quick-btn').addEventListener('click', () => {
  const entered = nameInput.value.trim();
  playerName = entered || 'Jugador';
  quickMode = true;
  currentRulesKey = pendingChallenge ? currentRulesKey : 'classic';
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
    state = chooseColor(state, btn.dataset.color);
    render(state);
    flyCardToCenter(topOfDiscard(state), seatElement(0));
    audio.playCard({ type: wildType });
    announcePlay({ type: wildType }, 0, state);
    if (wildType === 'wild-draw-four' && state.rules.stacking === false) maybeReact(victimIdx, 'hit', 0.85);
    restoreFocus();
    scheduleCpuIfNeeded();
  });
});

document.getElementById('history-btn').addEventListener('click', openHistory);
document.getElementById('history-close').addEventListener('click', closeHistory);
document.getElementById('play-again-btn').addEventListener('click', newRound);
document.getElementById('share-btn').addEventListener('click', shareChallenge);
document.getElementById('menu-btn').addEventListener('click', exitToMenu);

document.getElementById('quit-btn').addEventListener('click', () => {
  if (!state || state.phase === 'game-over') {
    exitToMenu();
    return;
  }
  lastFocused = document.activeElement;
  document.getElementById('quit-dialog').hidden = false;
  document.getElementById('quit-cancel').focus();
});
document.getElementById('quit-cancel').addEventListener('click', () => {
  document.getElementById('quit-dialog').hidden = true;
  restoreFocus();
});
document.getElementById('quit-restart').addEventListener('click', () => {
  forfeitIfMidRound();
  document.getElementById('quit-dialog').hidden = true;
  newRound();
});
document.getElementById('quit-exit').addEventListener('click', () => {
  forfeitIfMidRound();
  exitToMenu();
});

// Escape closes the history and quit dialogs (the colour picker is
// intentionally not escapable — choosing a colour is mandatory to continue).
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!document.getElementById('history-dialog').hidden) closeHistory();
  if (!document.getElementById('quit-dialog').hidden) {
    document.getElementById('quit-dialog').hidden = true;
    restoreFocus();
  }
});

trapFocus(document.getElementById('color-picker'));
trapFocus(document.getElementById('game-over'));
trapFocus(document.getElementById('history-dialog'));
trapFocus(document.getElementById('quit-dialog'));
