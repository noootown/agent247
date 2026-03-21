import { describe, expect, it } from "vitest";
import type { RunRecord } from "../../../../lib/report.js";
import { stripAnsi } from "../ansi.js";
import {
	applyTransforms,
	boldText,
	defaultPrettifier,
	getPrettifier,
	headings,
	horizontalRule,
	inlineCode,
	italicText,
	jsonBooleans,
	jsonKeys,
	jsonNulls,
	jsonNumbers,
	jsonPrettifier,
	jsonStrings,
	logPrettifier,
	markdownPrettifier,
	metaPrettifier,
	renderMarkdownLine,
	timestamps,
	urls,
} from "../prettifiers.js";

const mockRun: RunRecord = {
	meta: {
		schema_version: 1,
		id: "TEST123",
		task: "test-task",
		status: "completed",
		url: "https://example.com/pr/1",
		item_key: "item-1",
		started_at: "2026-03-21T10:00:00Z",
		finished_at: "2026-03-21T10:01:00Z",
		duration_seconds: 60,
		exit_code: 0,
	},
	dir: "/tmp/test-run",
};

// ── Individual Transforms ──

describe("headings transform", () => {
	it("converts # heading to bold", () => {
		expect(stripAnsi(headings("# Title"))).toBe("Title");
		expect(headings("# Title")).toContain("\x1B[1m");
	});
	it("passes non-headings through", () => {
		expect(headings("plain")).toBe("plain");
	});
});

describe("boldText transform", () => {
	it("converts **text** to bold", () => {
		expect(stripAnsi(boldText("**hi**"))).toBe("hi");
	});
	it("handles multiple bold spans", () => {
		expect(stripAnsi(boldText("**a** and **b**"))).toBe("a and b");
	});
});

describe("italicText transform", () => {
	it("converts _text_ to italic", () => {
		const result = italicText("_Potential issue_");
		expect(stripAnsi(result)).toBe("Potential issue");
		expect(result).toContain("\x1B[38;2;189;129;184m"); // #bd81b8
	});
	it("handles multiple italic spans", () => {
		expect(stripAnsi(italicText("_a_ | _b_"))).toBe("a | b");
	});
	it("does not match underscores inside words", () => {
		expect(italicText("snake_case_name")).toBe("snake_case_name");
	});
	it("handles emoji + italic combo", () => {
		const result = italicText("_⚠️ Potential issue_ | _🟠 Major_");
		expect(stripAnsi(result)).toBe("⚠️ Potential issue | 🟠 Major");
	});
});

describe("inlineCode transform", () => {
	it("highlights `code`", () => {
		const result = inlineCode("use `foo()`");
		expect(stripAnsi(result)).toBe("use foo()");
		expect(result).toContain("\x1B[38;2;175;185;254m");
	});
});

describe("horizontalRule transform", () => {
	it("replaces --- with dim line", () => {
		const transform = horizontalRule(30);
		expect(stripAnsi(transform("---"))).toBe("─".repeat(30));
	});
	it("passes non-rules through", () => {
		expect(horizontalRule(30)("text")).toBe("text");
	});
});

describe("urls transform", () => {
	it("makes URLs clickable", () => {
		const result = urls("visit https://example.com now");
		expect(result).toContain("\x1B[94m");
		expect(stripAnsi(result)).toBe("visit https://example.com now");
	});
	it("handles no URLs", () => {
		expect(urls("plain text")).toBe("plain text");
	});
});

describe("timestamps transform", () => {
	it("dims ISO timestamps", () => {
		const result = timestamps("[2026-03-21T10:00:00.000Z] info");
		expect(result).toContain("\x1B[2m");
		expect(stripAnsi(result)).toBe("[2026-03-21T10:00:00.000Z] info");
	});
	it("passes lines without timestamps through", () => {
		expect(timestamps("no timestamp")).toBe("no timestamp");
	});
});

describe("JSON transforms", () => {
	it("jsonKeys colors keys", () => {
		expect(jsonKeys('"name": "val"')).toContain("\x1B[38;2;137;180;250m");
	});
	it("jsonStrings colors string values", () => {
		expect(jsonStrings('  "k": "val"')).toContain("\x1B[38;2;206;145;120m");
	});
	it("jsonNumbers colors numbers", () => {
		expect(jsonNumbers('  "k": 42')).toContain("\x1B[38;2;181;206;168m");
	});
	it("jsonBooleans colors booleans", () => {
		expect(jsonBooleans('  "k": true')).toContain("\x1B[38;2;206;145;120m");
	});
	it("jsonNulls dims null", () => {
		expect(jsonNulls('  "k": null')).toContain("\x1B[2m");
	});
});

describe("applyTransforms", () => {
	it("applies transforms left to right", () => {
		const upper: (l: string) => string = (l) => l.toUpperCase();
		const exclaim: (l: string) => string = (l) => `${l}!`;
		expect(applyTransforms(["hi"], [upper, exclaim])).toEqual(["HI!"]);
	});
	it("handles empty lines", () => {
		expect(applyTransforms([], [urls])).toEqual([]);
	});
	it("handles empty transforms", () => {
		expect(applyTransforms(["a", "b"], [])).toEqual(["a", "b"]);
	});
});

// ── Composed Prettifiers ──

describe("renderMarkdownLine", () => {
	it("renders headings as bold", () => {
		const result = renderMarkdownLine("# Hello");
		expect(stripAnsi(result)).toBe("Hello");
		expect(result).toContain("\x1B[1m"); // BOLD
	});

	it("renders h2 headings", () => {
		const result = renderMarkdownLine("## Section");
		expect(stripAnsi(result)).toBe("Section");
	});

	it("renders bold text", () => {
		const result = renderMarkdownLine("this is **bold** text");
		expect(stripAnsi(result)).toBe("this is bold text");
		expect(result).toContain("\x1B[1m");
	});

	it("renders inline code", () => {
		const result = renderMarkdownLine("use `foo()` here");
		expect(stripAnsi(result)).toBe("use foo() here");
	});

	it("renders URLs as clickable hyperlinks", () => {
		const result = renderMarkdownLine(
			"see https://example.com/pr/1 for details",
		);
		expect(result).toContain("\x1B[94m"); // blue color
		expect(result).toContain("https://example.com/pr/1");
		expect(stripAnsi(result)).toBe("see https://example.com/pr/1 for details");
	});

	it("renders multiple URLs on one line", () => {
		const result = renderMarkdownLine("a https://a.com b https://b.com c");
		expect(stripAnsi(result)).toBe("a https://a.com b https://b.com c");
	});

	it("renders horizontal rules", () => {
		const result = renderMarkdownLine("---", 20);
		expect(stripAnsi(result)).toBe("─".repeat(20));
	});

	it("passes plain text through", () => {
		expect(renderMarkdownLine("plain text")).toBe("plain text");
	});
});

describe("markdownPrettifier", () => {
	it("splits content into lines and renders markdown", () => {
		const lines = markdownPrettifier("# Title\nplain\n**bold**", mockRun, 40);
		expect(lines).toHaveLength(3);
		expect(stripAnsi(lines[0])).toBe("Title");
		expect(lines[1]).toBe("plain");
		expect(stripAnsi(lines[2])).toBe("bold");
	});
});

describe("jsonPrettifier", () => {
	it("highlights JSON keys", () => {
		const lines = jsonPrettifier('  "name": "hello"', mockRun, 80);
		expect(lines[0]).toContain("\x1B[38;2;137;180;250m"); // JSON_KEY color
	});

	it("highlights string values", () => {
		const lines = jsonPrettifier('  "key": "value"', mockRun, 80);
		expect(lines[0]).toContain("\x1B[38;2;206;145;120m"); // JSON_STRING color
	});

	it("highlights number values", () => {
		const lines = jsonPrettifier('  "count": 42', mockRun, 80);
		expect(lines[0]).toContain("\x1B[38;2;181;206;168m"); // JSON_NUMBER color
	});

	it("highlights boolean values", () => {
		const lines = jsonPrettifier('  "enabled": true', mockRun, 80);
		expect(lines[0]).toContain("\x1B[38;2;206;145;120m"); // JSON_BOOL color
	});

	it("highlights null values", () => {
		const lines = jsonPrettifier('  "value": null', mockRun, 80);
		expect(lines[0]).toContain("\x1B[2m"); // DIM
	});

	it("handles multi-line JSON", () => {
		const input = '{\n  "a": 1,\n  "b": "x"\n}';
		const lines = jsonPrettifier(input, mockRun, 80);
		expect(lines).toHaveLength(4);
	});

	it("highlights URLs in JSON string values", () => {
		const lines = jsonPrettifier('  "url": "https://example.com"', mockRun, 80);
		expect(lines[0]).toContain("\x1B[94m");
	});
});

describe("logPrettifier", () => {
	it("dims ISO timestamps", () => {
		const input = "[2026-03-21T10:00:00.000Z] [INFO] Starting";
		const lines = logPrettifier(input, mockRun, 80);
		expect(lines[0]).toContain("\x1B[2m"); // DIM
		expect(stripAnsi(lines[0])).toBe(input);
	});

	it("passes lines without timestamps through", () => {
		const lines = logPrettifier("no timestamp here", mockRun, 80);
		expect(lines[0]).toBe("no timestamp here");
	});

	it("highlights URLs in log lines", () => {
		const lines = logPrettifier("see https://example.com/pr/1", mockRun, 80);
		expect(lines[0]).toContain("\x1B[94m");
	});
});

describe("metaPrettifier", () => {
	it("includes run ID", () => {
		const lines = metaPrettifier("", mockRun, 80);
		const text = lines.map(stripAnsi).join("\n");
		expect(text).toContain("TEST123");
	});

	it("includes task name", () => {
		const lines = metaPrettifier("", mockRun, 80);
		const text = lines.map(stripAnsi).join("\n");
		expect(text).toContain("test-task");
	});

	it("includes status", () => {
		const lines = metaPrettifier("", mockRun, 80);
		const text = lines.map(stripAnsi).join("\n");
		expect(text).toContain("completed");
	});

	it("includes URL as hyperlink", () => {
		const lines = metaPrettifier("", mockRun, 80);
		const text = lines.join("\n");
		expect(text).toContain("https://example.com/pr/1");
	});

	it("shows dash for missing URL", () => {
		const noUrlRun = { ...mockRun, meta: { ...mockRun.meta, url: null } };
		const lines = metaPrettifier("", noUrlRun, 80);
		const text = lines.map(stripAnsi).join("\n");
		expect(text).toContain("URL: —");
	});

	it("shows green exit code for 0", () => {
		const lines = metaPrettifier("", mockRun, 80);
		const exitLine = lines.find((l) => stripAnsi(l).includes("Exit code"));
		expect(exitLine).toContain("\x1B[32m"); // GREEN
	});

	it("shows red exit code for non-zero", () => {
		const failRun = { ...mockRun, meta: { ...mockRun.meta, exit_code: 1 } };
		const lines = metaPrettifier("", failRun, 80);
		const exitLine = lines.find((l) => stripAnsi(l).includes("Exit code"));
		expect(exitLine).toContain("\x1B[31m"); // RED
	});
});

describe("defaultPrettifier", () => {
	it("splits content into raw lines", () => {
		const lines = defaultPrettifier("a\nb\nc", mockRun, 80);
		expect(lines).toEqual(["a", "b", "c"]);
	});
});

describe("getPrettifier", () => {
	it("returns markdownPrettifier for .md files", () => {
		expect(getPrettifier("report.md")).toBe(markdownPrettifier);
		expect(getPrettifier("transcript.md")).toBe(markdownPrettifier);
		expect(getPrettifier("prompt.rendered.md")).toBe(markdownPrettifier);
	});

	it("returns jsonPrettifier for .json files", () => {
		expect(getPrettifier("vars.json")).toBe(jsonPrettifier);
		expect(getPrettifier("response.json")).toBe(jsonPrettifier);
	});

	it("returns logPrettifier for log.txt", () => {
		expect(getPrettifier("log.txt")).toBe(logPrettifier);
	});

	it("returns metaPrettifier for meta.yaml", () => {
		expect(getPrettifier("meta.yaml")).toBe(metaPrettifier);
	});

	it("returns defaultPrettifier for unknown files", () => {
		expect(getPrettifier("unknown.txt")).toBe(defaultPrettifier);
	});
});
