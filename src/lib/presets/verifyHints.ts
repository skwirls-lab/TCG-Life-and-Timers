/**
 * A-11a: the "⚠ Some rule values still need checking" hints are for the owner, not for players.
 * Preset data keeps its `verify` flags (and docs/RULES-TO-VERIFY.md lists them); the UI shows the
 * hints only in dev and test builds, or when a build sets NEXT_PUBLIC_SHOW_VERIFY=1.
 */
export function verifyHintsEnabled(env: Record<string, string | undefined>): boolean {
  return (
    env.NEXT_PUBLIC_TEST_HOOKS === "1" ||
    env.NEXT_PUBLIC_SHOW_VERIFY === "1" ||
    env.NODE_ENV === "development"
  );
}

/** Build-time value (Next inlines the NEXT_PUBLIC_* and NODE_ENV reads). */
export const SHOW_VERIFY_HINTS = verifyHintsEnabled({
  NEXT_PUBLIC_TEST_HOOKS: process.env.NEXT_PUBLIC_TEST_HOOKS,
  NEXT_PUBLIC_SHOW_VERIFY: process.env.NEXT_PUBLIC_SHOW_VERIFY,
  NODE_ENV: process.env.NODE_ENV,
});
