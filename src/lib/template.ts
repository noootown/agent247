export function render(
	template: string,
	globalVars: Record<string, string> = {},
	taskVars: Record<string, string> = {},
	itemVars: Record<string, string> = {},
	reservedVars: Record<string, string> = {},
): string {
	const merged = { ...globalVars, ...taskVars, ...itemVars, ...reservedVars };
	return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
		return key in merged ? String(merged[key]) : match;
	});
}
