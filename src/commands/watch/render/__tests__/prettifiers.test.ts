import { describe, expect, it } from "vitest";
import type { RunRecord } from "../../../../lib/report.js";
import { stripAnsi } from "../ansi.js";
import {
	applyCodeBlockHighlighting,
	applyTransforms,
	boldText,
	defaultPrettifier,
	getPrettifier,
	headings,
	highlightCode,
	hljsToAnsi,
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
	stripTimestamps,
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

describe("stripTimestamps transform", () => {
	it("strips ISO timestamps from log lines", () => {
		expect(stripTimestamps("[2026-03-21T10:00:00.000Z] [INFO] Starting")).toBe(
			"[INFO] Starting",
		);
	});
	it("passes lines without timestamps through", () => {
		expect(stripTimestamps("no timestamp")).toBe("no timestamp");
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

describe("hljsToAnsi", () => {
	it("converts hljs-keyword spans to purple", () => {
		const result = hljsToAnsi('<span class="hljs-keyword">const</span>');
		expect(result).toContain("\x1B[38;2;198;120;221m");
		expect(stripAnsi(result)).toBe("const");
	});

	it("converts hljs-string spans to green", () => {
		const result = hljsToAnsi(
			'<span class="hljs-string">&quot;hello&quot;</span>',
		);
		expect(result).toContain("\x1B[38;2;152;195;121m");
		expect(stripAnsi(result)).toBe('"hello"');
	});

	it("handles nested spans", () => {
		const result = hljsToAnsi(
			'<span class="hljs-literal"><span class="hljs-keyword">true</span></span>',
		);
		expect(stripAnsi(result)).toBe("true");
		expect(result).toContain("\x1B[");
	});

	it("decodes HTML entities", () => {
		expect(hljsToAnsi("&amp; &lt; &gt; &quot;")).toBe('& < > "');
	});

	it("passes plain text through", () => {
		expect(hljsToAnsi("hello world")).toBe("hello world");
	});
});

describe("highlightCode", () => {
	it("highlights JSON", () => {
		const result = highlightCode('{"key": "val"}', "json");
		expect(result).toContain("\x1B[");
		expect(stripAnsi(result)).toBe('{"key": "val"}');
	});

	it("highlights bash", () => {
		const result = highlightCode('echo "hi"', "bash");
		expect(result).toContain("\x1B[");
		expect(stripAnsi(result)).toBe('echo "hi"');
	});

	it("falls back to plain text for unknown language", () => {
		const result = highlightCode("hello", "notareallanguage");
		expect(result).toBe("hello");
	});
});

describe("applyCodeBlockHighlighting", () => {
	it("renders fence lines as dimmed separator with language label", () => {
		const lines = applyCodeBlockHighlighting([
			"```json",
			'"key": "val"',
			"```",
		]);
		expect(lines).toHaveLength(3);
		expect(stripAnsi(lines[0])).toBe("────────── json ──────────");
		expect(lines[0]).toContain("\x1B[2m"); // DIM
		expect(stripAnsi(lines[2])).toMatch(/^─+$/);
		expect(lines[2]).toContain("\x1B[2m"); // DIM
	});

	it("colors + lines with green inside diff blocks", () => {
		const lines = applyCodeBlockHighlighting(["```diff", "+added", "```"]);
		expect(lines[1]).toContain("\x1B[38;2;106;171;115m");
		expect(stripAnsi(lines[1])).toBe("+added");
	});

	it("colors - lines with red inside diff blocks", () => {
		const lines = applyCodeBlockHighlighting(["```diff", "-removed", "```"]);
		expect(lines[1]).toContain("\x1B[38;2;200;120;120m");
	});

	it("colors @@ lines with cyan", () => {
		const lines = applyCodeBlockHighlighting([
			"```diff",
			"@@ -1,3 +1,4 @@",
			"```",
		]);
		expect(lines[1]).toContain("\x1B[36m");
	});

	it("does not color lines outside code blocks", () => {
		const lines = applyCodeBlockHighlighting(["+not a diff", "-not a diff"]);
		expect(lines[0]).toBe("+not a diff");
		expect(lines[1]).toBe("-not a diff");
	});

	it("applies syntax highlighting inside json blocks", () => {
		const lines = applyCodeBlockHighlighting([
			"```json",
			'  "name": "hello"',
			"```",
		]);
		expect(lines[1]).toContain("\x1B[");
		expect(stripAnsi(lines[1])).toContain('"name"');
	});

	it("applies highlighting for bash blocks", () => {
		const lines = applyCodeBlockHighlighting([
			"```bash",
			'echo "hello"',
			"```",
		]);
		expect(lines[1]).toContain("\x1B[");
		expect(stripAnsi(lines[1])).toContain("echo");
	});

	it("applies bash fallback for plain commands", () => {
		const lines = applyCodeBlockHighlighting([
			"```bash",
			"bash scripts/test.sh",
			"```",
		]);
		// Fallback colors first word as command
		expect(lines[1]).toContain("\x1B[38;2;152;195;121m");
		expect(stripAnsi(lines[1])).toBe("bash scripts/test.sh");
	});

	it("applies highlighting for ruby blocks", () => {
		const lines = applyCodeBlockHighlighting([
			"```ruby",
			'puts "hello"',
			"```",
		]);
		expect(lines[1]).toContain("\x1B[");
		expect(stripAnsi(lines[1])).toContain("puts");
	});

	it("does not apply highlighting outside code blocks", () => {
		const lines = applyCodeBlockHighlighting(['"key": "value"']);
		expect(lines[0]).toBe('"key": "value"');
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
	it("applies highlight.js syntax highlighting", () => {
		const input = '{\n  "name": "hello",\n  "count": 42\n}';
		const lines = jsonPrettifier(input, mockRun, 80);
		expect(lines).toHaveLength(4);
		expect(lines[1]).toContain("\x1B[");
		expect(stripAnsi(lines[1])).toContain('"name"');
	});

	it("preserves text content", () => {
		const input = '{\n  "key": "value"\n}';
		const lines = jsonPrettifier(input, mockRun, 80);
		const plain = stripAnsi(lines.join("\n"));
		expect(plain).toContain('"key"');
		expect(plain).toContain('"value"');
	});

	it("highlights URLs in JSON", () => {
		const input = '{\n  "url": "https://example.com"\n}';
		const lines = jsonPrettifier(input, mockRun, 80);
		expect(lines.join("\n")).toContain("\x1B[94m"); // URL blue
	});
});

describe("logPrettifier", () => {
	it("strips ISO timestamps", () => {
		const input = "[2026-03-21T10:00:00.000Z] [INFO] Starting";
		const lines = logPrettifier(input, mockRun, 80);
		expect(lines[0]).not.toContain("2026-03-21");
		expect(stripAnsi(lines[0])).toBe("[INFO] Starting");
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
