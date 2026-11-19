/**
 * Share-link paths (T7.3). The static export has one share page, `/p/_`; Firebase Hosting
 * rewrites every `/p/**` URL to it (firebase.json), so the code comes from the browser URL.
 */
export const SHARE_PAGE_PLACEHOLDER = "_";

/** The share code in a `/p/{code}` pathname ("" when there is none or it is the placeholder). */
export function shareCodeFromPath(pathname: string): string {
  const m = /^\/p\/([^/?#]+)\/?$/.exec(pathname);
  if (!m) return "";
  let code: string;
  try {
    code = decodeURIComponent(m[1]!);
  } catch {
    return "";
  }
  return code === SHARE_PAGE_PLACEHOLDER ? "" : code;
}
