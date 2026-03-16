import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acquireLock, releaseLock } from "../lib/lock.js";

const TEST_DIR = join(process.cwd(), "__test_lock_tmp__");
const TASK_DIR = join(TEST_DIR, "tasks", "test-task");

beforeEach(() => {
	mkdirSync(TASK_DIR, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("lock", () => {
	it("acquires lock when no lock exists", () => {
		const acquired = acquireLock("test-task", TEST_DIR);
		expect(acquired).toBe(true);
		expect(existsSync(join(TASK_DIR, ".lock"))).toBe(true);
	});

	it("writes current PID to lock file", () => {
		acquireLock("test-task", TEST_DIR);
		const pid = readFileSync(join(TASK_DIR, ".lock"), "utf-8").trim();
		expect(pid).toBe(String(process.pid));
	});

	it("fails to acquire lock when PID is alive", () => {
		writeFileSync(join(TASK_DIR, ".lock"), String(process.pid));
		const acquired = acquireLock("test-task", TEST_DIR);
		expect(acquired).toBe(false);
	});

	it("acquires lock when PID is stale (dead process)", () => {
		writeFileSync(join(TASK_DIR, ".lock"), "999999999");
		const acquired = acquireLock("test-task", TEST_DIR);
		expect(acquired).toBe(true);
	});

	it("releases lock", () => {
		acquireLock("test-task", TEST_DIR);
		releaseLock("test-task", TEST_DIR);
		expect(existsSync(join(TASK_DIR, ".lock"))).toBe(false);
	});
});
