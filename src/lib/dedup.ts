import { listRuns } from "./report.js";

export function filterNewItems(
	runsDir: string,
	taskId: string,
	items: Record<string, string>[],
	itemKey: string,
	options?: { allowRerun?: boolean },
): Record<string, string>[] {
	if (options?.allowRerun) return items;

	const runs = listRuns(runsDir, { task: taskId });
	const skipKeys = new Set(
		runs
			.filter(
				(r) => r.meta.status === "completed" || r.meta.status === "processing",
			)
			.map((r) => r.meta.item_key),
	);
	return items.filter((item) => !skipKeys.has(item[itemKey]));
}
