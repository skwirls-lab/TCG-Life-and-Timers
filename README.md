# TCGTempo

_Life & timers for any card game._

Mobile-first PWA (formerly "TCG Life & Timers"; the repo, package and storage names keep the old identifiers on purpose): life/counter tracking for trading card games plus multiplayer chess clocks on one shared device.

- Product spec: [`PRD.md`](PRD.md) · Build plan: [`instructions.md`](instructions.md) · Progress: [`docs/progress/`](docs/progress/PROGRESS.md)

## Develop

```bash
npm install && npm --prefix functions install
npm run dev                # http://localhost:3000
npm run emulators          # Firebase emulators (demo-tcg-life), needs Java 21
npm run build && npm start # production static export (out/) on the Hosting emulator, :3000
```

The site is a static export served by **Firebase Hosting**; GitHub Actions deploys it on every
push to `main` (`.github/workflows/deploy.yml`, [`DEPLOY.md`](DEPLOY.md)). Response headers live in
`firebase.json`, generated from `src/lib/security/headers.ts` (`npm run gen:hosting`).

## Quality gates

| Gate | Command |
|---|---|
| Static | `npm run typecheck && npm run lint && npm run format:check` |
| Unit | `npm run test:unit -- --coverage` |
| Presets | `npm run check:presets` |
| Rules / Functions | `npm run test:rules` · `npm run test:functions` |
| Build | `npm run build && npm run check:bundle` · `npm run check:hosting` |
| E2E | `npm run test:e2e` · `npm run test:e2e:emu` |
| Trace | `npm run check:trace` |
| Lighthouse | `npm run lhci` |

CI (`.github/workflows/ci.yml`) runs all gates on every push, including real WebKit.
