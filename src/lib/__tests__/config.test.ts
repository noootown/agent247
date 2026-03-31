import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	listTasks,
	loadEnvLocalRaw,
	loadGlobalVars,
	loadTaskConfig,
} from "../config.js";

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
			`name: Test Task\nschedule: "*/30 * * * *"\ntimeout: 300\nenabled: true\ndiscovery:\n  command: "echo '[]'"\n  item_key: url\n`,
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
		expect(config.discovery?.command).toBe("echo '[]'");
		expect(config.discovery?.item_key).toBe("url");
		expect(config.prompt).toBe("Test prompt {{url}}");
	});
});

describe("loadTaskConfig without discovery", () => {
	it("parses a valid config without discovery field", () => {
		writeFileSync(
			join(TEST_DIR, "tasks", "test-task", "config.yaml"),
			`name: Test Task\nschedule: "0 8 * * *"\ntimeout: 180\nenabled: true\n`,
		);
		writeFileSync(
			join(TEST_DIR, "tasks", "test-task", "prompt.md"),
			"Check something",
		);
		const config = loadTaskConfig("test-task", TEST_DIR);
		expect(config.discovery).toBeUndefined();
		expect(config.name).toBe("Test Task");
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

describe("loadEnvLocalRaw", () => {
	it("returns key-value pairs from .env.local", () => {
		writeFileSync(join(TEST_DIR, ".env.local"), "KEY1=value1\nKEY2=value2\n");
		const result = loadEnvLocalRaw(TEST_DIR);
		expect(result.KEY1).toBe("value1");
		expect(result.KEY2).toBe("value2");
	});

	it("returns empty object when file does not exist", () => {
		const result = loadEnvLocalRaw(TEST_DIR);
		expect(result).toEqual({});
	});

	it("handles quoted values", () => {
		writeFileSync(
			join(TEST_DIR, ".env.local"),
			"DOUBLE=\"double quoted\"\nSINGLE='single quoted'\n",
		);
		const result = loadEnvLocalRaw(TEST_DIR);
		expect(result.DOUBLE).toBe("double quoted");
		expect(result.SINGLE).toBe("single quoted");
	});
});

describe("listTasks", () => {
	it("lists task directories", () => {
		writeFileSync(
			join(TEST_DIR, "tasks", "test-task", "config.yaml"),
			"name: Test\nschedule: '* * * * *'\ntimeout: 60\nenabled: true\ndiscovery:\n  command: echo\n  item_key: id\n",
		);
		writeFileSync(join(TEST_DIR, "tasks", "test-task", "prompt.md"), "prompt");
		const tasks = listTasks(TEST_DIR);
		expect(tasks).toHaveLength(1);
		expect(tasks[0].id).toBe("test-task");
	});
});

describe("loadTaskConfig auto_mark", () => {
	it("parses auto_mark when set to true", () => {
		writeFileSync(
			join(TEST_DIR, "tasks", "test-task", "config.yaml"),
			`name: Test\nschedule: "* * * * *"\ntimeout: 60\nenabled: true\nauto_mark: true\n`,
		);
		writeFileSync(join(TEST_DIR, "tasks", "test-task", "prompt.md"), "prompt");
		const config = loadTaskConfig("test-task", TEST_DIR);
		expect(config.auto_mark).toBe(true);
	});

	it("defaults auto_mark to false when not specified", () => {
		writeFileSync(
			join(TEST_DIR, "tasks", "test-task", "config.yaml"),
			`name: Test\nschedule: "* * * * *"\ntimeout: 60\nenabled: true\n`,
		);
		writeFileSync(join(TEST_DIR, "tasks", "test-task", "prompt.md"), "prompt");
		const config = loadTaskConfig("test-task", TEST_DIR);
		expect(config.auto_mark).toBe(false);
	});
});

describe("loadTaskConfig cleanup fields", () => {
	it("loads check and teardown fields", () => {
		writeFileSync(
			join(TEST_DIR, "tasks", "test-task", "config.yaml"),
			`name: Test\nschedule: "* * * * *"\ntimeout: 60\nenabled: true\ndiscovery:\n  command: "echo '[]'"\n  item_key: url\ncleanup:\n  check: "echo MERGED"\n  when: MERGED\n  retain: 12h\n  teardown: "rm -rf /tmp/test"\n`,
		);
		writeFileSync(join(TEST_DIR, "tasks", "test-task", "prompt.md"), "prompt");
		const config = loadTaskConfig("test-task", TEST_DIR);
		expect(config.cleanup?.check).toBe("echo MERGED");
		expect(config.cleanup?.when).toBe("MERGED");
		expect(config.cleanup?.retain).toBe("12h");
		expect(config.cleanup?.teardown).toBe("rm -rf /tmp/test");
	});

	it("falls back to command field when check is missing (backwards compat)", () => {
		writeFileSync(
			join(TEST_DIR, "tasks", "test-task", "config.yaml"),
			`name: Test\nschedule: "* * * * *"\ntimeout: 60\nenabled: true\ndiscovery:\n  command: "echo '[]'"\n  item_key: url\ncleanup:\n  command: "echo OLD"\n  when: OLD\n`,
		);
		writeFileSync(join(TEST_DIR, "tasks", "test-task", "prompt.md"), "prompt");
		const config = loadTaskConfig("test-task", TEST_DIR);
		expect(config.cleanup?.check).toBe("echo OLD");
		expect(config.cleanup?.teardown).toBeUndefined();
	});

	it("loads cleanup without teardown", () => {
		writeFileSync(
			join(TEST_DIR, "tasks", "test-task", "config.yaml"),
			`name: Test\nschedule: "* * * * *"\ntimeout: 60\nenabled: true\ndiscovery:\n  command: "echo '[]'"\n  item_key: url\ncleanup:\n  check: "echo OK"\n  when: OK\n`,
		);
		writeFileSync(join(TEST_DIR, "tasks", "test-task", "prompt.md"), "prompt");
		const config = loadTaskConfig("test-task", TEST_DIR);
		expect(config.cleanup?.check).toBe("echo OK");
		expect(config.cleanup?.teardown).toBeUndefined();
	});
});
