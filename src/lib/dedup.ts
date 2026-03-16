import { listRuns } from "./report.js";

export function filterNewItems(
	runsDir: string,
	taskId: string,
	items: Record<string, string>[],
	itemKey: string,
): Record<string, string>[] {
	const runs = listRuns(runsDir, { task: taskId });
	const completedKeys = new Set(
		runs
			.filter(
				(r) => r.meta.status === "completed" || r.meta.status === "no-action",
			)
			.map((r) => r.meta.item_key),
	);
	return items.filter((item) => !completedKeys.has(item[itemKey]));
}
