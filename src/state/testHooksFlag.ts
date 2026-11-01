/**
 * Build-time flag for test hooks (instructions §10.4). Kept in its own module so production code
 * can check it without statically importing the hook implementation (and, through it, the whole
 * built-in preset registry) into the board chunk (PERF-003).
 */
export const TEST_HOOKS_ENABLED = process.env.NEXT_PUBLIC_TEST_HOOKS === "1";
