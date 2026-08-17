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

- **`index.html`** — page structure: player hand, CPU hand (face-down count), draw pile, discard pile, active color indicator, turn indicator, win/lose banner.
- **`style.css`** — UNO card styling (red/blue/green/yellow), responsive layout for the table and hands.
- **`game.js`** — game state, deck construction/shuffle, dealing, turn management, move validation, special-card effects, CPU decision logic, rendering/DOM updates.

## Data Flow

Game state lives in a single JS object: `deck`, `playerHand`, `cpuHand`, `discardPile`, `currentColor`, `turn`, `direction`. Player actions (clicking a card, drawing) validate against the top of the discard pile, mutate state, then trigger a re-render of the affected DOM regions. After the player's turn resolves, the CPU takes its turn on a short delay (for readability) and the cycle repeats until one hand is empty.

## Special Cards

Standard 108-card UNO deck: number cards (0–9, two of each color except one 0), Skip, Reverse, Draw Two per color, plus Wild and Wild Draw Four. Effects: Skip (next player loses turn — in 2-player, acts as "play again"), Reverse (in 2-player, acts as Skip), Draw Two (next player draws 2 and loses turn), Wild (current player picks new active color), Wild Draw Four (next player draws 4, loses turn, color is chosen).

## CPU Logic

Simple heuristic, not random:
1. If a valid card exists in hand, prefer playing a special card (Skip/Reverse/+2) over a plain number when it's advantageous (e.g., player has few cards).
2. Otherwise play any valid card, preferring to match color over number when multiple options exist (keeps deck diversity down).
3. When playing a Wild, choose the color the CPU holds the most of in its remaining hand.
4. If no valid card, draw one; play it immediately if it becomes playable, else pass.

## Edge Cases

- **Deck exhausted while drawing**: reshuffle the discard pile (excluding the top card) back into the draw pile.
- **Player has no valid move**: forced to draw one card; play it if valid, otherwise turn passes.
- **Simultaneous empty-hand edge case**: not possible — turns are sequential, so only one hand can reach zero first.
- **Win condition**: first player (human or CPU) to reach zero cards wins; game shows a banner and offers "play again" (resets state, no page reload needed).

## Testing

Manual, in-browser: play full games verifying deal count (7 cards each), each special card's effect, deck reshuffle on exhaustion, and both win/lose end states. No automated test suite — out of scope for this size of project.

## Deployment

- Source lives in a public GitHub repository (portfolio visibility).
- Hosted via **GitHub Pages** directly from that repo (no separate hosting account needed).
- Since the entire game is static client-side JS, no server/edge compute is required regardless of host — this repo intentionally stays host-agnostic (a future move to Cloudflare Pages, if ever wanted, would need zero code changes, only a host reconnect).
