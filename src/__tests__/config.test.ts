import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listTasks, loadGlobalVars, loadTaskConfig } from "../lib/config.js";

const TEST_DIR = join(process.cwd(), "__test_config_tmp__");

beforeEach(() => {
	mkdirSync(join(TEST_DIR, "tasks", "test-task"), { recursive: true });
});

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("loadTaskConfig", () => {
	it("parses a valid task config", () => {
		writeFileSync(
			join(TEST_DIR, "tasks", "test-task", "config.yaml"),
			`name: Test Task\nschedule: "*/30 * * * *"\ntimeout: 300\nenabled: true\ndiscovery:\n  command: "echo '[]'"\n  item_key: url\nprompt_mode: per_item\n`,
		);
		writeFileSync(
			join(TEST_DIR, "tasks", "test-task", "prompt.md"),
			"Test prompt {{url}}",
		);
		const config = loadTaskConfig("test-task", TEST_DIR);
		expect(config.name).toBe("Test Task");
		expect(config.schedule).toBe("*/30 * * * *");
		expect(config.timeout).toBe(300);
		expect(config.enabled).toBe(true);
		expect(config.discovery.command).toBe("echo '[]'");
		expect(config.discovery.item_key).toBe("url");
		expect(config.prompt_mode).toBe("per_item");
		expect(config.prompt).toBe("Test prompt {{url}}");
	});
});

describe("loadGlobalVars", () => {
	it("loads vars.yaml", () => {
		writeFileSync(
			join(TEST_DIR, "vars.yaml"),
			"github_username: testuser\nrepo: testrepo\n",
		);
		const vars = loadGlobalVars(TEST_DIR);
		expect(vars.github_username).toBe("testuser");
		expect(vars.repo).toBe("testrepo");
	});

	it("returns empty object if vars.yaml missing", () => {
		const vars = loadGlobalVars(TEST_DIR);
		expect(vars).toEqual({});
	});
});

describe("listTasks", () => {
	it("lists task directories", () => {
		writeFileSync(
			join(TEST_DIR, "tasks", "test-task", "config.yaml"),
			"name: Test\nschedule: '* * * * *'\ntimeout: 60\nenabled: true\ndiscovery:\n  command: echo\n  item_key: id\nprompt_mode: per_item\n",
		);
		writeFileSync(join(TEST_DIR, "tasks", "test-task", "prompt.md"), "prompt");
		const tasks = listTasks(TEST_DIR);
		expect(tasks).toHaveLength(1);
		expect(tasks[0].id).toBe("test-task");
	});
});
