# Trace exemptions (requirement → how it is verified instead)

- ARCH-003: enforced structurally (presets are data, validated by G-PRESETS; UI renders from definitions). Reviewed in G-REVIEW.
- ARCH-007: design constraint (no real-time sync of active games), verified by review.

## Pending (temporary; must be empty for `check:trace -- --all`)
- ARCH-002: PENDING(T1.1) engine runs in the Node environment, enforced by ESLint restrictions
- PWA-003: PENDING(T8.7) install prompt UX
