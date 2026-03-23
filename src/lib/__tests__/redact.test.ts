import { describe, expect, it } from "vitest";
import { buildSecretMap, redact } from "../redact.js";

describe("buildSecretMap", () => {
	it("includes ALL_CAPS keys", () => {
		const map = buildSecretMap({
			LINEAR_API_KEY: "sk-123",
			OTHER_SECRET: "abc",
		});
		expect(map.get("sk-123")).toBe("LINEAR_API_KEY");
		expect(map.get("abc")).toBe("OTHER_SECRET");
	});

	it("excludes lowercase keys", () => {
		const map = buildSecretMap({ bot_name: "mybot", API_KEY: "secret" });
		expect(map.has("mybot")).toBe(false);
		expect(map.has("secret")).toBe(true);
	});

	it("excludes empty values", () => {
		const map = buildSecretMap({ API_KEY: "" });
		expect(map.size).toBe(0);
	});
});

describe("redact", () => {
	it("replaces secret values with redacted placeholder", () => {
		const secrets = new Map([["sk-123", "API_KEY"]]);
		expect(redact("token: sk-123", secrets)).toBe("token: [REDACTED:API_KEY]");
	});

	it("handles multiple secrets", () => {
		const secrets = new Map([
			["sk-123", "API_KEY"],
			["pw-456", "DB_PASS"],
		]);
		const result = redact("key=sk-123 pass=pw-456", secrets);
		expect(result).toBe("key=[REDACTED:API_KEY] pass=[REDACTED:DB_PASS]");
	});

	it("replaces longer secrets first to avoid partial matches", () => {
		const secrets = new Map([
			["sk-123", "SHORT"],
			["sk-123-extended", "LONG"],
		]);
		const result = redact("value: sk-123-extended", secrets);
		expect(result).toBe("value: [REDACTED:LONG]");
	});

	it("returns text unchanged when no secrets match", () => {
		const secrets = new Map([["sk-123", "API_KEY"]]);
		expect(redact("no secrets here", secrets)).toBe("no secrets here");
	});

	it("handles empty secrets map", () => {
		expect(redact("some text", new Map())).toBe("some text");
	});
});
