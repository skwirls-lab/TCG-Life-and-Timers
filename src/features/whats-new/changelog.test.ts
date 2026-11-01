// @req SET-043
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseChangelog, plainInline } from "./changelog";

describe("changelog parser (SET-043)", () => {
  it("parses releases, groups and bullets with continuation lines", () => {
    const md = [
      "# Changelog",
      "intro text",
      "- ignored before any release",
      "## [1.1.0] - 2027-01-02",
      "- loose item",
      "### Added",
      "- **Bold** thing with [a link](https://x.y)",
      "  continued here",
      "",
      "  not a continuation after a blank line",
      "* star bullet",
      "## 1.0.0",
      "### Fixed",
      "- `code` fix",
    ].join("\n");
    expect(parseChangelog(md)).toEqual([
      {
        version: "1.1.0",
        date: "2027-01-02",
        groups: [
          { title: "", items: ["loose item"] },
          { title: "Added", items: ["Bold thing with a link continued here", "star bullet"] },
        ],
      },
      { version: "1.0.0", date: null, groups: [{ title: "Fixed", items: ["code fix"] }] },
    ]);
  });

  it("returns no releases for an empty file", () => {
    expect(parseChangelog("")).toEqual([]);
    expect(plainInline("  __x__ ")).toBe("x");
  });

  it("the shipped CHANGELOG.md has a 1.0.0 release with content", () => {
    const md = readFileSync(join(process.cwd(), "CHANGELOG.md"), "utf8");
    const [first] = parseChangelog(md);
    expect(first?.version).toBe("1.0.0");
    expect(first?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(first!.groups.length).toBeGreaterThan(3);
    expect(first!.groups.every((g) => g.title && g.items.length > 0)).toBe(true);
  });
});
