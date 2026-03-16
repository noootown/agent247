import { describe, it, expect } from "vitest";
import { generateFencedBlock, replaceFencedSection } from "../lib/crontab.js";

describe("generateFencedBlock", () => {
  it("generates crontab entries for enabled tasks", () => {
    const tasks = [{ id: "review-dependabot", name: "Review Dependabot", schedule: "*/30 * * * *" }];
    const block = generateFencedBlock(tasks, "/usr/local/bin/agent247", "/home/user/agent247/runs");
    expect(block).toContain("# --- agent247 START ---");
    expect(block).toContain("# --- agent247 END ---");
    expect(block).toContain("*/30 * * * *");
    expect(block).toContain("agent247 run review-dependabot");
  });
});

describe("replaceFencedSection", () => {
  it("inserts block when no existing section", () => {
    const existing = "0 * * * * /usr/bin/backup\n";
    const block = "# --- agent247 START ---\n# test\n# --- agent247 END ---\n";
    const result = replaceFencedSection(existing, block);
    expect(result).toContain("/usr/bin/backup");
    expect(result).toContain("# --- agent247 START ---");
  });

  it("replaces existing fenced section", () => {
    const existing = "0 * * * * /usr/bin/backup\n# --- agent247 START ---\n# old stuff\n# --- agent247 END ---\n";
    const block = "# --- agent247 START ---\n# new stuff\n# --- agent247 END ---\n";
    const result = replaceFencedSection(existing, block);
    expect(result).toContain("# new stuff");
    expect(result).not.toContain("# old stuff");
    expect(result).toContain("/usr/bin/backup");
  });

  it("preserves entries outside the fenced section", () => {
    const existing = "# user job\n0 3 * * * /usr/bin/cleanup\n# --- agent247 START ---\n# old\n# --- agent247 END ---\n0 6 * * * /usr/bin/report\n";
    const block = "# --- agent247 START ---\n# updated\n# --- agent247 END ---\n";
    const result = replaceFencedSection(existing, block);
    expect(result).toContain("/usr/bin/cleanup");
    expect(result).toContain("/usr/bin/report");
    expect(result).toContain("# updated");
  });
});
