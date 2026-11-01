import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** G-A11Y: fail on serious or critical axe violations. */
export async function expectNoSeriousA11yViolations(page: Page, opts: { exclude?: string[] } = {}) {
  let builder = new AxeBuilder({
    page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"],
  }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  for (const sel of opts.exclude ?? []) builder = builder.exclude(sel);
  const results = await builder.analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    bad.map(
      (v) => `${v.id}: ${v.help} (${v.nodes.length} nodes) e.g. ${v.nodes[0]?.target.join(" ")}`,
    ),
  ).toEqual([]);
}
