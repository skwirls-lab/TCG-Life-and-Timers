/** Player identity (HIST-033): group by profile id, else by normalized name. */
import { normalizeName } from "@/lib/db/db";

export const PROFILE_PREFIX = "p:";
export const NAME_PREFIX = "n:";

const DEFAULT_NAME = /^player \d+$/;

export function identityOf(p: { profileId?: string; name: string }): string {
  return p.profileId ? `${PROFILE_PREFIX}${p.profileId}` : `${NAME_PREFIX}${normalizeName(p.name)}`;
}

/** "Player 1", " player  12 " … (the engine's default seat names). */
export function isDefaultName(name: string): boolean {
  return DEFAULT_NAME.test(normalizeName(name));
}

/** A name-only identity whose name is a default seat name (excluded from stats by default). */
export function isDefaultIdentity(identity: string): boolean {
  return identity.startsWith(NAME_PREFIX) && isDefaultName(identity.slice(NAME_PREFIX.length));
}

export function profileIdOf(identity: string): string | undefined {
  return identity.startsWith(PROFILE_PREFIX) ? identity.slice(PROFILE_PREFIX.length) : undefined;
}
