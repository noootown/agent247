import { describe, expect, it } from "vitest";
import { discoverItems } from "../lib/discovery.js";

describe("discoverItems", () => {
	it("parses JSON array from command output", () => {
		const items = discoverItems(
			`echo '[{"url":"https://example.com/1","title":"PR 1"}]'`,
		);
		expect(items).toEqual([{ url: "https://example.com/1", title: "PR 1" }]);
	});

	it("returns empty array for empty JSON array", () => {
		const items = discoverItems("echo '[]'");
		expect(items).toEqual([]);
	});

	it("throws on non-zero exit code", () => {
		expect(() => discoverItems("exit 1")).toThrow();
	});

	it("throws on invalid JSON", () => {
		expect(() => discoverItems("echo 'not json'")).toThrow();
	});
});
