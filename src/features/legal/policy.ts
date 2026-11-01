/**
 * Policy text (LEG-001, LEG-006). Server-only: imported by the statically rendered /privacy and
 * /terms pages, so the long copy is never part of a client bundle (it would otherwise ship with
 * every page through the i18n dictionaries, PERF-003). Kept outside src/i18n/en on purpose.
 */
import content from "./content/en.json";

export interface PolicySection {
  id: string;
  heading: string;
  paragraphs: string[];
}

export interface PolicyDoc {
  intro: string;
  sections: PolicySection[];
}

export type PolicyKind = "privacy" | "terms";

export function policy(kind: PolicyKind): PolicyDoc {
  return content[kind];
}

export const POLICY_UPDATED: string = content.updated;
