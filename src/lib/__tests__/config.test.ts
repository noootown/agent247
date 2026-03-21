import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listTasks, loadGlobalVars, loadTaskConfig } from "../config.js";

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

describe("loadGlobalVars with .env.local", () => {
	const envKeysToClean: string[] = [];
	afterEach(() => {
		for (const key of envKeysToClean) {
			delete process.env[key];
		}
		envKeysToClean.length = 0;
	});

	it("resolves uppercase env var references from .env.local", () => {
		envKeysToClean.push("MY_SECRET");
		writeFileSync(join(TEST_DIR, ".env.local"), "MY_SECRET=secret123\n");
		writeFileSync(
			join(TEST_DIR, "vars.yaml"),
			'api_key: "{{MY_SECRET}}"\nplain: hello\n',
		);
		const vars = loadGlobalVars(TEST_DIR);
		expect(vars.api_key).toBe("secret123");
		expect(vars.plain).toBe("hello");
	});

	it("leaves unresolved uppercase references as-is", () => {
		writeFileSync(
			join(TEST_DIR, "vars.yaml"),
			'api_key: "{{MISSING_VAR_XYZ}}"\n',
		);
		const vars = loadGlobalVars(TEST_DIR);
		expect(vars.api_key).toBe("{{MISSING_VAR_XYZ}}");
	});

	it("does not resolve lowercase template variables", () => {
		envKeysToClean.push("my_var");
		writeFileSync(join(TEST_DIR, ".env.local"), "my_var=nope\n");
		writeFileSync(join(TEST_DIR, "vars.yaml"), 'ref: "{{my_var}}"\n');
		const vars = loadGlobalVars(TEST_DIR);
		expect(vars.ref).toBe("{{my_var}}");
	});

	it("handles .env.local with comments and blank lines", () => {
		envKeysToClean.push("KEY", "KEY2");
		writeFileSync(
			join(TEST_DIR, ".env.local"),
			"# comment\n\nKEY=value\n  \n# another\nKEY2=val2\n",
		);
		writeFileSync(join(TEST_DIR, "vars.yaml"), 'a: "{{KEY}}"\nb: "{{KEY2}}"\n');
		const vars = loadGlobalVars(TEST_DIR);
		expect(vars.a).toBe("value");
		expect(vars.b).toBe("val2");
	});

	it("handles quoted values in .env.local", () => {
		envKeysToClean.push("KEY", "KEY2");
		writeFileSync(
			join(TEST_DIR, ".env.local"),
			"KEY=\"quoted value\"\nKEY2='single quoted'\n",
		);
		writeFileSync(join(TEST_DIR, "vars.yaml"), 'a: "{{KEY}}"\nb: "{{KEY2}}"\n');
		const vars = loadGlobalVars(TEST_DIR);
		expect(vars.a).toBe("quoted value");
		expect(vars.b).toBe("single quoted");
	});

	it("resolves pre-existing process.env vars without .env.local", () => {
		envKeysToClean.push("PREEXISTING_TEST_VAR");
		process.env.PREEXISTING_TEST_VAR = "from-env";
		writeFileSync(
			join(TEST_DIR, "vars.yaml"),
			'val: "{{PREEXISTING_TEST_VAR}}"\n',
		);
		const vars = loadGlobalVars(TEST_DIR);
		expect(vars.val).toBe("from-env");
	});

	it("works without .env.local file", () => {
		writeFileSync(join(TEST_DIR, "vars.yaml"), "key: value\n");
		const vars = loadGlobalVars(TEST_DIR);
		expect(vars.key).toBe("value");
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
