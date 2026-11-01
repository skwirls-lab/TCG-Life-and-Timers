/**
 * Minimal Keep-a-Changelog parser for /whats-new (SET-043). Recognizes `## [version] - date`
 * releases, `### Group` headings and `- item` bullets (continuation lines are joined). Inline
 * markdown links become their text; emphasis markers are dropped.
 */
export interface ChangelogGroup {
  title: string;
  items: string[];
}

export interface ChangelogRelease {
  version: string;
  date: string | null;
  groups: ChangelogGroup[];
}

export function plainInline(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|`)/g, "")
    .trim();
}

const RELEASE = /^##\s+\[?([^\]\s]+)\]?(?:\s*-\s*(\S+))?\s*$/;

export function parseChangelog(md: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  let release: ChangelogRelease | null = null;
  let group: ChangelogGroup | null = null;
  let lastItem = -1;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const rel = RELEASE.exec(line);
    if (rel) {
      release = { version: rel[1]!, date: rel[2] ?? null, groups: [] };
      releases.push(release);
      group = null;
      lastItem = -1;
      continue;
    }
    if (!release) continue;
    const head = /^###\s+(.+)$/.exec(line);
    if (head) {
      group = { title: plainInline(head[1]!), items: [] };
      release.groups.push(group);
      lastItem = -1;
      continue;
    }
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      if (!group) {
        group = { title: "", items: [] };
        release.groups.push(group);
      }
      group.items.push(plainInline(bullet[1]!));
      lastItem = group.items.length - 1;
      continue;
    }
    if (line.trim() === "") {
      lastItem = -1;
      continue;
    }
    if (group && lastItem >= 0 && /^\s+\S/.test(raw)) {
      group.items[lastItem] = `${group.items[lastItem]} ${plainInline(line)}`;
    }
  }
  return releases;
}
