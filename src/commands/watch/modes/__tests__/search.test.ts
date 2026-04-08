import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => false),
	readFileSync: vi.fn(() => "{}"),
}));

import type { State, WatchContext } from "../../state.js";
import { handleKey } from "../search.js";

function makeState(overrides: Partial<State> = {}): State {
	return {
		groups: [],
		cursor: 0,
		scroll: 0,
		mode: "search",
		splitRun: null,
		activeTab: 0,
		fullPane: false,
		reportScroll: 0,
		reportScrollX: 0,
		confirmTask: null,
		confirmItemKey: null,
		confirmChoice: "yes",
		layoutMode: "horizontal",
		selected: new Set(),
		followBottom: true,
		flash: null,
		helpScroll: 0,
		showMarkedOnly: false,
		prefixMode: false,
		searchQuery: "",
		searchConfirmed: false,
		...overrides,
	};
}

function makeMockCtx(): WatchContext {
	return {
		baseDir: "/base",
		runsDir: "/base/runs",
		binDir: "/base/.bin",
		botName: "agent247",
		reload: (s) => s,
		softDelete: vi.fn(),
		stopTask: vi.fn(),
		toggleTask: vi.fn(),
		spawnRun: vi.fn(),
		spawnRerun: vi.fn(),
		openUrl: vi.fn(),
		hotkeys: [],
		metaKey: "\x13",
		metaKeyLabel: "Ctrl+S",
	};
}

describe("search mode", () => {
	it("appends printable characters to searchQuery", () => {
		const next = handleKey("a", makeState(), [], makeMockCtx());
		expect(next.searchQuery).toBe("a");
	});

	it("appends to existing query", () => {
		const next = handleKey(
			"b",
			makeState({ searchQuery: "a" }),
			[],
			makeMockCtx(),
		);
		expect(next.searchQuery).toBe("ab");
	});

	it("backspace removes last character", () => {
		const next = handleKey(
			"\x7F",
			makeState({ searchQuery: "abc" }),
			[],
			makeMockCtx(),
		);
		expect(next.searchQuery).toBe("ab");
	});

	it("backspace on empty query does nothing", () => {
		const next = handleKey(
			"\x7F",
			makeState({ searchQuery: "" }),
			[],
			makeMockCtx(),
		);
		expect(next.searchQuery).toBe("");
		expect(next.mode).toBe("search");
	});

	it("Enter confirms search and returns to split", () => {
		const next = handleKey(
			"\r",
			makeState({ searchQuery: "test" }),
			[],
			makeMockCtx(),
		);
		expect(next.mode).toBe("split");
		expect(next.searchQuery).toBe("test");
		expect(next.searchConfirmed).toBe(true);
	});

	it("Enter on empty query returns to split without confirming", () => {
		const next = handleKey(
			"\r",
			makeState({ searchQuery: "" }),
			[],
			makeMockCtx(),
		);
		expect(next.mode).toBe("split");
		expect(next.searchConfirmed).toBe(false);
	});

	it("Esc clears query and returns to split", () => {
		const next = handleKey(
			"\x1B",
			makeState({ searchQuery: "test" }),
			[],
			makeMockCtx(),
		);
		expect(next.mode).toBe("split");
		expect(next.searchQuery).toBe("");
		expect(next.searchConfirmed).toBe(false);
	});

	it("ignores non-printable keys", () => {
		const state = makeState({ searchQuery: "abc" });
		const next = handleKey("\x1B[A", state, [], makeMockCtx()); // up arrow
		expect(next.searchQuery).toBe("abc");
		expect(next.mode).toBe("search");
	});
});
