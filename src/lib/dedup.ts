import { listRuns } from "./report.js";

export function filterNewItems(
	runsDir: string,
	taskId: string,
	items: Record<string, string>[],
	itemKey: string,
	invalidatedKeys?: Set<string>,
): Record<string, string>[] {
	const runs = listRuns(runsDir, { task: taskId });
	const skipKeys = new Set(
		runs
			.filter(
				(r) => r.meta.status === "completed" || r.meta.status === "pending",
			)
			.map((r) => r.meta.item_key),
	);
	// Remove invalidated keys from skip set (allow re-processing)
	if (invalidatedKeys) {
		for (const key of invalidatedKeys) {
			skipKeys.delete(key);
		}
	}
	return items.filter((item) => !skipKeys.has(item[itemKey]));
}
