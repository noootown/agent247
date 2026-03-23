import { describe, expect, it } from "vitest";
import { DIM, RESET } from "../ansi.js";
import {
	applyCodeBlockHighlighting,
	highlightCode,
	hljsToAnsi,
} from "../highlight.js";

// ── hljsToAnsi ──

describe("hljsToAnsi", () => {
	it("converts known hljs span classes to ANSI colors", () => {
		const html = '<span class="hljs-keyword">const</span>';
		const result = hljsToAnsi(html);
		expect(result).toContain("const");
		expect(result).toContain("\x1B[");
		expect(result).toContain(RESET);
	});

	it("strips unknown hljs classes but keeps content", () => {
		const html = '<span class="hljs-unknown-thing">hello</span>';
		const result = hljsToAnsi(html);
		expect(result).toBe("hello");
	});

	it("decodes HTML entities", () => {
		const html = "&amp; &lt; &gt; &quot; &#x27; &#39;";
		const result = hljsToAnsi(html);
		expect(result).toBe("& < > \" ' '");
	});

	it("strips non-span HTML tags", () => {
		const html = "<div>text</div>";
		const result = hljsToAnsi(html);
		expect(result).toBe("text");
	});

	it("handles nested spans via recursive processing", () => {
		// The non-greedy regex matches the first </span>, so the outer span
		// captures `<span class="hljs-string">inner` and the recursive call
		// strips the unclosed inner tag, applying only the outer color.
		const html =
			'<span class="hljs-keyword"><span class="hljs-string">inner</span></span>';
		const result = hljsToAnsi(html);
		expect(result).toContain("inner");
		expect(result).toContain(RESET);
		// Outer keyword color is applied
		expect(result).toContain("\x1B[38;2;198;120;221m"); // keyword purple
	});

	it("returns plain text unchanged", () => {
		expect(hljsToAnsi("just text")).toBe("just text");
	});
});

// ── highlightCode ──

describe("highlightCode", () => {
	it("returns ANSI-colored string for a valid language", () => {
		const code = 'const x = "hello";';
		const result = highlightCode(code, "javascript");
		// Should contain ANSI escape codes
		expect(result).toContain("\x1B[");
		// Should still contain the source tokens
		expect(result).toContain("const");
		expect(result).toContain("hello");
	});

	it("handles bash with fallback coloring", () => {
		const code = "echo hello";
		const result = highlightCode(code, "bash");
		expect(result).toContain("\x1B[");
		expect(result).toContain("echo");
		expect(result).toContain("hello");
	});

	it("returns original code on invalid/unknown language", () => {
		const code = "some random text";
		const result = highlightCode(code, "not_a_real_language_xyz");
		expect(result).toBe(code);
	});
});

// ── applyCodeBlockHighlighting ──

describe("applyCodeBlockHighlighting", () => {
	it("highlights fenced code blocks", () => {
		const lines = [
			"before",
			"```javascript",
			'const x = "hi";',
			"```",
			"after",
		];
		const result = applyCodeBlockHighlighting(lines);
		// First and last non-code lines pass through
		expect(result[0]).toBe("before");
		expect(result[result.length - 1]).toBe("after");
		// Opening label line contains language name and DIM
		expect(result[1]).toContain("javascript");
		expect(result[1]).toContain(DIM);
		// Highlighted code should contain ANSI escapes
		const codeLine = result[2];
		expect(codeLine).toContain("\x1B[");
		// Closing separator is present
		expect(result[3]).toContain("─");
		expect(result[3]).toContain(DIM);
	});

	it("handles diff blocks with line-level coloring", () => {
		const lines = [
			"```diff",
			"+added",
			"-removed",
			"@@hunk@@",
			" context",
			"```",
		];
		const result = applyCodeBlockHighlighting(lines);
		// +added line should have green color
		expect(result[1]).toContain("\x1B[38;2;106;171;115m");
		expect(result[1]).toContain("+added");
		// -removed line should have red color
		expect(result[2]).toContain("\x1B[38;2;200;120;120m");
		expect(result[2]).toContain("-removed");
		// @@ line should have cyan color
		expect(result[3]).toContain("\x1B[36m");
		// context line passes through unchanged
		expect(result[4]).toBe(" context");
	});

	it("passes through non-code lines unchanged", () => {
		const lines = ["hello", "world", "no code here"];
		const result = applyCodeBlockHighlighting(lines);
		expect(result).toEqual(lines);
	});

	it("handles unclosed code blocks by dumping remaining lines", () => {
		const lines = ["```python", "x = 1", "y = 2"];
		const result = applyCodeBlockHighlighting(lines);
		// Opening label is emitted
		expect(result[0]).toContain("python");
		// Unclosed block lines are pushed as-is
		expect(result).toContain("x = 1");
		expect(result).toContain("y = 2");
	});
});
