# Changelog

All notable changes to TCGTempo are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow semantic versioning.

## [1.3.0] - 2026-11-20

### Pro

- Getting Pro ready: purchases now go through TCGTempo's own secure Stripe checkout. Everything stays free for now.
- After paying, the Pro page tells you when Pro is active. If it takes longer than usual, tap Restore purchases.
- Signed in? Restore purchases, in Account and on the Pro page, checks your purchase again.
- Deleting your account also cancels your subscription right away and removes your billing details from Stripe.

## [1.2.2] - 2026-11-19

### Faster

- Moving between screens is quicker, and the first visit after a quiet spell no longer waits for a server to wake up: the app is now served as plain files from Google's worldwide network.

## [1.2.1] - 2026-11-19

### Fixed

- Google sign-in on phones now works: you no longer come back from choosing an account still signed out.
- Pull down to refresh works again on every page except the game board, including in the installed app.
- The installed app keeps your phone's status and navigation bars. Hiding them is the "Full screen during games" setting.
- Back always moves toward the start screen instead of bouncing between two pages. Tap the TCGTempo mark in any page header to go Home.

### Timers

- With "bank + delay", the free delay now applies at the start of each turn only. Free time when responding, and when priority comes back to you, are separate settings, off by default.

## [1.2.0] - 2026-11-19

### Presets

- Save your usual game as a preset: the game type, house rules, clock, seats, players, profiles and decks. Save it at the end of Setup or from the game menu.
- Your presets sit at the top of the start screen. Tap one to start that exact game straight away, or tap Edit first to swap a deck, drop a seat or replace a player. If you changed something, you can update the preset in one tap.
- Rename, reorder and delete presets from a tile's menu. Signed in, presets sync to your other devices.
- Setup can now remove one seat, so a player who can't make it doesn't shift everyone else around.

### Clearer names

- What used to be called presets (MTG Commander, Pokémon, or the games you build yourself) are now called game types: Custom game types, game type share links and import.

## [1.1.0] - 2026-11-18

### New name and look

- The app is now **TCGTempo**, with a new icon on every page and on your home screen.
- A welcome screen offers Google sign-in up front, so profiles and history sync across devices. You can still continue without an account.
- Full screen during games is now opt-in (Settings), so the browser no longer goes full screen on its own.

### Game board

- The toolbar strip is gone, giving every seat more room. Tap the TCGTempo button in the middle of the board to pause the clocks and open the game menu (reset, players, history, dice, settings, full screen). Closing the menu resumes the clocks. The old strip is still available in Settings.

### Timers

- Every clock mode is now free.
- Different time per seat: give a newer player more time in Setup or Settings.
- Declare-blockers window: the active player taps Attack to stop their clock while defenders have a shared countdown (30 s by default) to declare blockers. A house rule decides what happens at 0:00.

### Profiles and decks

- Profiles and decks can have a default background, which loads with the player.
- Commanders are picked from Scryfall, and a deck's background defaults to its commander's art.
- "Set seat backgrounds to commanders" in Setup applies every seat's commander art when the game starts.

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
