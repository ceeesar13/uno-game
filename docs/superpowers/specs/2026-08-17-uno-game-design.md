# UNO Game — Design

## Overview

A single-page, browser-based implementation of UNO. One human player vs. one CPU opponent, playable entirely client-side with no backend. Built to serve as a portfolio piece, hosted publicly via GitHub Pages.

## Goals

- Play a full game of UNO (simplified rules, no tournament stacking/calling) against a CPU opponent.
- Zero backend, zero build step — works by opening `index.html` or via GitHub Pages.
- Clean enough to be a portfolio showcase (readable code, presentable UI).

## Non-Goals

- Multiplayer / networked play.
- Persistent stats, accounts, or save games.
- Tournament-rule variants (stacking +2/+4, calling "UNO", jump-in).

## Architecture

Static site: `index.html` + `style.css` + `game.js`. No frameworks, no dependencies, no server. All game logic — including the CPU opponent — runs as client-side JavaScript in the visitor's browser. This means any static host (GitHub Pages, Cloudflare Pages, etc.) serves it identically; no serverless compute is required for the CPU.

## Components

- **`index.html`** — page structure: player hand, CPU hand (face-down count), draw pile, discard pile, active color indicator, turn indicator, win/lose banner, color-picker overlay.
- **`style.css`** — UNO card styling (red/blue/green/yellow), responsive layout for the table and hands.
- **`game.js`** — contains two clearly separated concerns, in this order:
  - **Engine** (pure, no DOM access): deck construction/shuffle, dealing, move validation, effect resolution, draw logic, win detection, CPU decision logic. Every engine function takes state in and returns/mutates state out — none of them touch `document`.
  - **Render** (DOM only): reads the current state and updates the DOM to match it. Never mutates game state, never contains rules logic.
  - A single event-handling layer glues the two: DOM click → engine call → render(state).

## Card Model

Every card is `{ id, color, type, value }`:
- `id`: unique string (for keying/animating DOM elements).
- `color`: `'red' | 'blue' | 'green' | 'yellow' | null` (`null` for Wild/Wild Draw Four until a color is chosen).
- `type`: `'number' | 'skip' | 'reverse' | 'draw-two' | 'wild' | 'wild-draw-four'`.
- `value`: `0`–`9` for `type: 'number'`, otherwise `null`.

## Data Flow

Game state lives in a single JS object: `deck`, `playerHand`, `cpuHand`, `discardPile`, `currentColor`, `phase`, `winner`. No `direction` field — with exactly two players, Reverse and Skip are behaviorally identical (see Special Cards), so tracking direction would have no observable effect.

`phase` drives what interaction is valid at any moment:
- `'player-turn'` — player may click a valid card or draw.
- `'cpu-turn'` — no player interaction; CPU move runs on a short delay.
- `'color-selection'` — a Wild/Wild Draw Four was just played; player (or CPU) is choosing the next color; all other clicks are ignored.
- `'game-over'` — game ended; only the "play again" action is valid.

Render reads `phase` to enable/disable interaction — e.g., player hand clicks are only wired up while `phase === 'player-turn'`.

## Special Cards

Standard 108-card UNO deck: number cards (0–9, two of each color except one 0), Skip, Reverse, Draw Two per color, plus Wild and Wild Draw Four.

**Turn resolution is a single centralized flow**, run every time any card is played (by either side):
1. Remove card from hand, place on discard pile.
2. Update `currentColor` (from the card's color, or from the chosen color for Wilds).
3. Apply the card's effect (see below).
4. Check win condition (hand empty → `phase = 'game-over'`).
5. If not over, set `phase` to whoever plays next.

Effects:
- **Skip**: next player loses their turn — in 2-player, the current player effectively plays again.
- **Reverse**: with 2 players, identical to Skip (direction has no other player to flip to).
- **Draw Two**: next player draws 2 cards and loses their turn.
- **Wild**: `phase = 'color-selection'` until a color is chosen, then normal turn order resumes.
- **Wild Draw Four**: can only be played if the player has **no card matching the current active color** in hand (checked at validation time, before the card is offered as playable). If legal, next player draws 4 and loses their turn, and `phase = 'color-selection'` for the color pick. No challenge/bluff mechanic (out of scope).

## CPU Logic

Score-based, not random. For each valid card in hand, compute a score and play the highest:
- Base score by type: number cards lowest, Skip/Reverse/Draw Two higher, Wilds lowest of all (reserve them for when no other option exists).
- Bonus to Skip/Reverse/Draw Two when the opponent's hand is small (denies them a near-win turn).
- When a Wild/Wild Draw Four is played, color is chosen as whichever color the CPU holds the most of in its remaining hand.
- If no valid card exists, draw one; if it's playable, play it immediately (no "hold and pass" choice for the CPU — see Edge Cases); otherwise the turn passes.

## Edge Cases

- **Deck exhausted while drawing**: reshuffle the discard pile (excluding the top card) back into the draw pile.
- **Player has no valid move**: player draws one card. The drawn card is added to their hand and rendered; if it's playable the player may choose to play it or pass (stays in `'player-turn'` either way until they act). This gives the human agency the CPU doesn't need.
- **CPU has no valid move**: CPU draws one card and auto-plays it immediately if valid, otherwise passes — no decision point needed since there's no UI to drive.
- **Game start**: after dealing, draw the first discard card. If it is anything other than `type: 'number'`, return it to the deck, reshuffle, and draw again. This guarantees a plain numbered start and avoids implementing start-of-game exceptions for specials.
- **Win condition**: first player (human or CPU) to reach zero cards wins; `phase = 'game-over'`, game shows a banner and offers "play again" (resets state in place, no page reload needed).

## Testing

Manual, in-browser: play full games verifying deal count (7 cards each), each special card's effect, deck reshuffle on exhaustion, and both win/lose end states. No automated test suite — out of scope for this size of project.

## Deployment

- Source lives in a public GitHub repository (portfolio visibility).
- Hosted via **GitHub Pages** directly from that repo (no separate hosting account needed).
- Since the entire game is static client-side JS, no server/edge compute is required regardless of host — this repo intentionally stays host-agnostic (a future move to Cloudflare Pages, if ever wanted, would need zero code changes, only a host reconnect).
