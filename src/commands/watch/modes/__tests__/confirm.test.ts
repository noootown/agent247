import { describe, expect, it, vi } from "vitest";
import type { State, WatchContext } from "../../state.js";
import { handleKey } from "../confirm.js";

function makeState(overrides: Partial<State> = {}): State {
	return {
		groups: [],
		cursor: 0,
		scroll: 0,
		mode: "confirm-run",
		splitRun: null,
		activeTab: 0,
		fullPane: false,
		reportScroll: 0,
		reportScrollX: 0,
		confirmTask: "my-task",
		confirmChoice: "yes",
		suspend: null,
		layoutMode: "horizontal",
		selected: new Set(),
		...overrides,
	};
}

function makeMockCtx(overrides: Partial<WatchContext> = {}): WatchContext {
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
		openUrl: vi.fn(),
		...overrides,
	};
}

describe("confirm mode — choice toggle", () => {
	it("← toggles from yes to no", () => {
		const next = handleKey(
			"\x1B[D",
			makeState({ confirmChoice: "yes" }),
			[],
			makeMockCtx(),
		);
		expect(next.confirmChoice).toBe("no");
	});

	it("→ toggles from no to yes", () => {
		const next = handleKey(
			"\x1B[C",
			makeState({ confirmChoice: "no" }),
			[],
			makeMockCtx(),
		);
		expect(next.confirmChoice).toBe("yes");
	});
});

describe("confirm mode — confirm with Enter", () => {
	it("Enter with yes calls spawnRun and transitions to list", () => {
		const ctx = makeMockCtx();
		const next = handleKey("\r", makeState({ confirmChoice: "yes" }), [], ctx);
		expect(ctx.spawnRun).toHaveBeenCalledWith("my-task");
		expect(next.mode).toBe("split");
		expect(next.confirmTask).toBeNull();
	});

	it("Enter with no does not call spawnRun and transitions to list", () => {
		const ctx = makeMockCtx();
		const next = handleKey("\r", makeState({ confirmChoice: "no" }), [], ctx);
		expect(ctx.spawnRun).not.toHaveBeenCalled();
		expect(next.mode).toBe("split");
		expect(next.confirmTask).toBeNull();
	});
});

describe("confirm mode — cancel", () => {
	it("q cancels without calling spawnRun", () => {
		const ctx = makeMockCtx();
		const next = handleKey("q", makeState(), [], ctx);
		expect(ctx.spawnRun).not.toHaveBeenCalled();
		expect(next.mode).toBe("split");
		expect(next.confirmTask).toBeNull();
	});

	it("ESC cancels without calling spawnRun", () => {
		const ctx = makeMockCtx();
		const next = handleKey("\x1B", makeState(), [], ctx);
		expect(ctx.spawnRun).not.toHaveBeenCalled();
		expect(next.mode).toBe("split");
		expect(next.confirmTask).toBeNull();
	});
});
