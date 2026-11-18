# Changelog

All notable changes to TCGTempo are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow semantic versioning.

## [1.0.0] - 2026-11-01

### Board and life tracking

- Life tracking for 1 to 8 players with layouts for every player count; each seat faces its player, in portrait and landscape.
- Tap to change by 1, hold to change by 10, with a pending-change bubble; changes made in quick succession are grouped into one history entry.
- Undo and redo for the whole game, and a reset with an optional random first player.
- Commander damage (including partners), commander tax, poison and other counters, tokens such as the monarch and initiative, and day/night.
- Elimination by life, poison or commander damage, with a game-over screen and a "Who won?" prompt.
- One-player mode (track only your own seat) and camera mode (every seat faces one direction, for recording or streaming).

### Games and presets

- Built-in presets for Magic: The Gathering (Commander, Constructed, Limited, Brawl, Oathbreaker), Pokémon, Yu-Gi-Oh! (with a life-point calculator), Final Fantasy TCG, Disney Lorcana, One Piece, Star Wars: Unlimited, Digimon, Flesh and Blood, Sorcery and a generic life counter.
- Per-seat starting values and thresholds, and per-game overrides in setup.
- A custom preset builder with live preview, JSON export and import, and share links.

### Timers

- Chess clocks: count-up, bank, bank with increment, bank with delay, per-turn and per-turn with reserve.
- Respond and pass-back for instant-speed actions, pause and auto-pause, timeout actions, low-time warnings, and a match timer with extra turns.
- Turn tracking with the turn number and time on each turn. Clocks survive reloads.

### Tools and history

- Dice, coin flip, random player and opponent, a roll-off for the first player, a mana and storm counter, and scratch counters.
- The current game's history with a life chart and "undo to here".
- Past games with records, win rates and stats per player and deck, plus export and import.

### Players and art

- Player profiles and decks, seat colors and gradients.
- Card art from Scryfall with a focal point and zoom, artist credit, and offline copies; you can also upload your own images.

### Account and sync (optional)

- Google sign-in to sync games, profiles, presets, settings and images across devices. Everything works without an account.
- Data export, removal of data from the device, and account deletion.

### Pro

- An optional Pro tier (monthly, yearly or lifetime) through Stripe. Everything needed to play stays free.

### App

- Installable, offline-first app with a screen wake lock, full-screen mode and an update prompt that never interrupts a game.
- An install prompt after your first completed game (on iPhone and iPad: "Add to Home Screen" instructions).
- Light, dark and high-contrast themes, reduced-motion support, and accessible names for every control.
- Privacy policy, terms of use, and a consent banner: analytics and crash reports stay off until you allow them.
- Security headers, including a Content Security Policy.
