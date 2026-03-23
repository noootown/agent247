/** Build a Map<secretValue, keyName> from ALL_CAPS keys only. */
export function buildSecretMap(
	envEntries: Record<string, string>,
): Map<string, string> {
	const map = new Map<string, string>();
	for (const [key, value] of Object.entries(envEntries)) {
		if (!value) continue;
		if (/^[A-Z_][A-Z0-9_]*$/.test(key)) {
			map.set(value, key);
		}
	}
	return map;
}

/** Replace secret values with [REDACTED:KEY_NAME]. Longer values replaced first. */
export function redact(text: string, secrets: Map<string, string>): string {
	if (secrets.size === 0) return text;
	const sorted = [...secrets.entries()].sort(
		(a, b) => b[0].length - a[0].length,
	);
	let result = text;
	for (const [value, key] of sorted) {
		result = result.replaceAll(value, `[REDACTED:${key}]`);
	}
	return result;
}
