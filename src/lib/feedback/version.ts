import { version as packageVersion } from "../../../package.json";

/** App version for diagnostics, feedback and exports (env override, else package.json). */
export function appVersion(
  envVersion: string | undefined = process.env.NEXT_PUBLIC_APP_VERSION,
): string {
  return (envVersion || packageVersion).slice(0, 32);
}
