import { describe, expect, it, vi } from "vitest";
import type { RunRecord } from "../../../lib/report.js";
import { getVisibleLines } from "../data.js";
import type { State, TaskGroup } from "../state.js";

vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => false),
	readFileSync: vi.fn(() => "{}"),
	readdirSync: vi.fn(() => []),
}));
vi.mock("../../../lib/config.js", () => ({
	listTasks: vi.fn(() => []),
}));
vi.mock("../../../lib/launchd.js", () => ({
	getAgentSchedules: vi.fn(() => new Map()),
	listInstalledAgents: vi.fn(() => []),
}));
vi.mock("../../../lib/task-cache.js", () => ({
	readTaskCache: vi.fn(() => null),
}));

const mockConfig = {
	id: "task-a",
	name: "Task A",
	schedule: "* * * * *",
	timeout: 300,
	cron_enabled: true,
	discovery: { command: "echo '[]'", item_key: "url" },
	model: "sonnet",
	prompt: "",
};

function makeRun(id: string, task: string): RunRecord {
	return {
		meta: {
			schema_version: 1,
			id,
			task,
			status: "completed",
			url: null,
			item_key: null,
			started_at: "2026-01-01T00:00:00Z",
			finished_at: "2026-01-01T00:01:00Z",
			duration_seconds: 60,
			exit_code: 0,
		},
		dir: `/tmp/runs/${id}`,
	};
}

function makeGroup(overrides: Partial<TaskGroup> = {}): TaskGroup {
	return {
		task: "task-a",
		config: mockConfig,
		runs: [],
		expanded: false,
		running: false,
		cron_enabled: true,
		schedule: null,
		lastCheck: null,
		...overrides,
	};
}

function makeState(overrides: Partial<State> = {}): State {
	return {
		groups: [],
		cursor: 0,
		scroll: 0,
		mode: "split",
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

describe("getVisibleLines", () => {
	it("returns empty array when no groups", () => {
		const state = makeState({ groups: [] });
		const lines = getVisibleLines(state);
		expect(lines).toEqual([]);
	});

	it("returns only group lines when all groups are collapsed", () => {
		const groupA = makeGroup({ task: "task-a", expanded: false });
		const groupB = makeGroup({ task: "task-b", expanded: false });
		const state = makeState({ groups: [groupA, groupB] });

		const lines = getVisibleLines(state);

		expect(lines).toHaveLength(2);
		expect(lines[0]).toEqual({ type: "group", group: groupA, index: 0 });
		expect(lines[1]).toEqual({ type: "group", group: groupB, index: 1 });
	});

	it("interleaves group and run lines for expanded groups", () => {
		const run1 = makeRun("run-1", "task-a");
		const run2 = makeRun("run-2", "task-a");
		const groupA = makeGroup({
			task: "task-a",
			expanded: true,
			runs: [run1, run2],
		});
		const groupB = makeGroup({ task: "task-b", expanded: false });
		const state = makeState({ groups: [groupA, groupB] });

		const lines = getVisibleLines(state);

		expect(lines).toHaveLength(4);
		expect(lines[0]).toEqual({ type: "group", group: groupA, index: 0 });
		expect(lines[1]).toEqual({
			type: "run",
			run: run1,
			group: groupA,
			index: 1,
		});
		expect(lines[2]).toEqual({
			type: "run",
			run: run2,
			group: groupA,
			index: 2,
		});
		expect(lines[3]).toEqual({ type: "group", group: groupB, index: 3 });
	});

	it("assigns sequential indices across multiple expanded groups", () => {
		const runA = makeRun("run-a", "task-a");
		const runB = makeRun("run-b", "task-b");
		const groupA = makeGroup({
			task: "task-a",
			expanded: true,
			runs: [runA],
		});
		const groupB = makeGroup({
			task: "task-b",
			expanded: true,
			runs: [runB],
		});
		const state = makeState({ groups: [groupA, groupB] });

		const lines = getVisibleLines(state);

		expect(lines).toHaveLength(4);
		const indices = lines.map((l) => l.index);
		expect(indices).toEqual([0, 1, 2, 3]);
	});

	it("filters to marked-only runs when showMarkedOnly is true", () => {
		const markedRun = makeRun("run-1", "task-a");
		markedRun.meta.marked = true;
		const unmarkedRun = makeRun("run-2", "task-a");
		unmarkedRun.meta.marked = false;
		const groupA = makeGroup({
			task: "task-a",
			expanded: true,
			runs: [markedRun, unmarkedRun],
		});
		const state = makeState({ groups: [groupA], showMarkedOnly: true });

		const lines = getVisibleLines(state);

		expect(lines).toHaveLength(2); // group + 1 marked run
		expect(lines[0].type).toBe("group");
		expect(lines[1].type).toBe("run");
		if (lines[1].type === "run") {
			expect(lines[1].run.meta.id).toBe("run-1");
		}
	});

	it("hides groups with no marked runs when showMarkedOnly is true", () => {
		const unmarkedRun = makeRun("run-1", "task-a");
		const groupA = makeGroup({
			task: "task-a",
			expanded: true,
			runs: [unmarkedRun],
		});
		const state = makeState({ groups: [groupA], showMarkedOnly: true });

		const lines = getVisibleLines(state);

		expect(lines).toHaveLength(0);
	});

	it("shows all runs when showMarkedOnly is false", () => {
		const markedRun = makeRun("run-1", "task-a");
		markedRun.meta.marked = true;
		const unmarkedRun = makeRun("run-2", "task-a");
		const groupA = makeGroup({
			task: "task-a",
			expanded: true,
			runs: [markedRun, unmarkedRun],
		});
		const state = makeState({ groups: [groupA], showMarkedOnly: false });

		const lines = getVisibleLines(state);

		expect(lines).toHaveLength(3); // group + 2 runs
	});
});

function makeSearchRun(
	id: string,
	url: string | null = null,
	itemKey: string | null = null,
): RunRecord {
	return {
		meta: {
			schema_version: 1,
			id,
			task: "task-a",
			status: "completed",
			url,
			item_key: itemKey,
			started_at: "2026-04-08T00:00:00Z",
			finished_at: "2026-04-08T00:01:00Z",
			duration_seconds: 60,
			exit_code: 0,
		},
		dir: `/runs/task-a/${id}`,
	};
}

function makeSearchGroup(task: string, runs: RunRecord[]): TaskGroup {
	return {
		task,
		config: {
			id: task,
			name: task,
			schedule: "",
			timeout: 0,
			cron_enabled: true,
			discovery: { command: "", item_key: "" },
			model: "",
			prompt: "",
		},
		runs,
		expanded: true,
		running: false,
		cron_enabled: true,
		schedule: null,
		lastCheck: null,
	};
}

describe("getVisibleLines with search", () => {
	it("returns all runs when searchQuery is empty", () => {
		const runs = [
			makeSearchRun("01", "https://a.com"),
			makeSearchRun("02", "https://b.com"),
		];
		const groups = [makeSearchGroup("task-a", runs)];
		const lines = getVisibleLines(makeState({ groups }));
		expect(lines.filter((l) => l.type === "run")).toHaveLength(2);
	});

	it("filters runs by URL match", () => {
		const runs = [
			makeSearchRun("01", "https://alpha.com"),
			makeSearchRun("02", "https://beta.com"),
		];
		const groups = [makeSearchGroup("task-a", runs)];
		const lines = getVisibleLines(makeState({ groups, searchQuery: "alpha" }));
		const runLines = lines.filter((l) => l.type === "run");
		expect(runLines).toHaveLength(1);
		expect(runLines[0].type === "run" && runLines[0].run.meta.url).toBe(
			"https://alpha.com",
		);
	});

	it("filters runs by item_key match", () => {
		const runs = [
			makeSearchRun("01", null, "KEY-123"),
			makeSearchRun("02", null, "KEY-456"),
		];
		const groups = [makeSearchGroup("task-a", runs)];
		const lines = getVisibleLines(makeState({ groups, searchQuery: "123" }));
		const runLines = lines.filter((l) => l.type === "run");
		expect(runLines).toHaveLength(1);
	});

	it("filters runs by report content match", () => {
		const run1 = makeSearchRun("01");
		run1.report = "error in production";
		const run2 = makeSearchRun("02");
		run2.report = "all good";
		const groups = [makeSearchGroup("task-a", [run1, run2])];
		const lines = getVisibleLines(makeState({ groups, searchQuery: "error" }));
		const runLines = lines.filter((l) => l.type === "run");
		expect(runLines).toHaveLength(1);
	});

	it("is case-insensitive", () => {
		const runs = [makeSearchRun("01", "https://Alpha.COM")];
		const groups = [makeSearchGroup("task-a", runs)];
		const lines = getVisibleLines(makeState({ groups, searchQuery: "alpha" }));
		expect(lines.filter((l) => l.type === "run")).toHaveLength(1);
	});

	it("hides groups with no matching runs", () => {
		const runs = [makeSearchRun("01", "https://beta.com")];
		const groups = [makeSearchGroup("task-a", runs)];
		const lines = getVisibleLines(makeState({ groups, searchQuery: "alpha" }));
		expect(lines).toHaveLength(0);
	});

	it("auto-expands groups with matching runs", () => {
		const runs = [makeSearchRun("01", "https://alpha.com")];
		const group = makeSearchGroup("task-a", runs);
		group.expanded = false;
		const lines = getVisibleLines(
			makeState({ groups: [group], searchQuery: "alpha" }),
		);
		expect(lines.filter((l) => l.type === "run")).toHaveLength(1);
	});
});
