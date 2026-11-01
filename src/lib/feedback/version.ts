/**
 * Must equal package.json "version" (a unit test enforces it). Importing package.json here would
 * ship the whole manifest to the client, so the value is duplicated on purpose; set
 * NEXT_PUBLIC_APP_VERSION at build time to override.
 */
export const PACKAGE_VERSION = "0.1.0";

/** App version for diagnostics, feedback and exports. */
export function appVersion(
  envVersion: string | undefined = process.env.NEXT_PUBLIC_APP_VERSION,
): string {
  return (envVersion || PACKAGE_VERSION).slice(0, 32);
}
