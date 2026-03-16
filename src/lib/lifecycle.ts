import { execSync } from "node:child_process";
import { listRuns, updateRunMeta } from "./report.js";
import { render } from "./template.js";

export interface LifecycleConfig {
  auto_resolve: boolean;
  resolve_command: string;
  resolve_when: string;
}

export function resolveRuns(
  runsDir: string,
  taskId: string,
  lifecycle: LifecycleConfig
): number {
  if (!lifecycle.auto_resolve) return 0;

  const runs = listRuns(runsDir, { task: taskId });
  const resolvable = runs.filter(
    (r) => r.meta.status === "completed" || r.meta.status === "error"
  );

  const pattern = new RegExp(lifecycle.resolve_when);
  let resolvedCount = 0;

  for (const run of resolvable) {
    try {
      const itemVars: Record<string, string> = {};
      if (run.meta.url) itemVars.url = run.meta.url;
      if (run.meta.item_key) itemVars.item_key = run.meta.item_key;

      const command = render(lifecycle.resolve_command, {}, {}, itemVars);
      const output = execSync(command, {
        encoding: "utf-8",
        timeout: 15_000,
        shell: "/bin/bash",
      }).trim();

      if (pattern.test(output)) {
        updateRunMeta(run.dir, { status: "resolved" });
        resolvedCount++;
      }
    } catch {
      continue;
    }
  }

  return resolvedCount;
}
