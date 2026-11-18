import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { parseChangelog } from "@/features/whats-new/changelog";
import { WhatsNew } from "@/features/whats-new/WhatsNew";

export const metadata: Metadata = {
  title: "What's new",
  description: "Release notes for TCGTempo.",
};

// Read at build time: the page is prerendered, so CHANGELOG.md is never read at runtime.
export const dynamic = "force-static";

export default function WhatsNewPage() {
  const md = readFileSync(join(process.cwd(), "CHANGELOG.md"), "utf8");
  return <WhatsNew releases={parseChangelog(md)} />;
}
