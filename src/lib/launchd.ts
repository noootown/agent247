import { execSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const LABEL_PREFIX = "com.agent247";

export interface LaunchdTask {
	id: string;
	name: string;
	schedule: string;
}

interface CalendarInterval {
	Minute?: number;
	Hour?: number;
	Day?: number;
	Month?: number;
	Weekday?: number;
}

/**
 * Parse a single cron field into an array of numeric values.
 * Handles: *, N, N-M, N,M,O, *\/N, N-M/S
 */
function parseCronField(
	field: string,
	min: number,
	max: number,
): number[] | null {
	if (field === "*") return null; // means "every"

	const results = new Set<number>();

	for (const part of field.split(",")) {
		const stepMatch = part.match(/^(\*|(\d+)-(\d+))\/(\d+)$/);
		if (stepMatch) {
			const step = Number(stepMatch[4]);
			const start = stepMatch[1] === "*" ? min : Number(stepMatch[2]);
			const end = stepMatch[1] === "*" ? max : Number(stepMatch[3]);
			for (let i = start; i <= end; i += step) {
				results.add(i);
			}
			continue;
		}

		const rangeMatch = part.match(/^(\d+)-(\d+)$/);
		if (rangeMatch) {
			const start = Number(rangeMatch[1]);
			const end = Number(rangeMatch[2]);
			for (let i = start; i <= end; i++) {
				results.add(i);
			}
			continue;
		}

		const num = Number(part);
		if (!Number.isNaN(num)) {
			results.add(num);
		}
	}

	// If expanding produces all values in range, treat as wildcard
	if (results.size === max - min + 1) return null;

	return [...results].sort((a, b) => a - b);
}

/**
 * Convert a 5-field cron expression to an array of launchd StartCalendarInterval dicts.
 */
export function cronToCalendarIntervals(schedule: string): CalendarInterval[] {
	const fields = schedule.trim().split(/\s+/);
	if (fields.length !== 5) {
		throw new Error(`Invalid cron expression: ${schedule}`);
	}

	const minute = parseCronField(fields[0], 0, 59);
	const hour = parseCronField(fields[1], 0, 23);
	const day = parseCronField(fields[2], 1, 31);
	const month = parseCronField(fields[3], 1, 12);
	let weekday = parseCronField(fields[4], 0, 6);

	// Normalize weekday 7 → 0 (both mean Sunday)
	if (weekday) {
		weekday = [...new Set(weekday.map((w) => (w === 7 ? 0 : w)))].sort(
			(a, b) => a - b,
		);
	}

	// Build cartesian product of all expanded fields
	const dimensions: { key: keyof CalendarInterval; values: number[] }[] = [];
	if (minute) dimensions.push({ key: "Minute", values: minute });
	if (hour) dimensions.push({ key: "Hour", values: hour });
	if (day) dimensions.push({ key: "Day", values: day });
	if (month) dimensions.push({ key: "Month", values: month });
	if (weekday) dimensions.push({ key: "Weekday", values: weekday });

	if (dimensions.length === 0) {
		return [{}]; // every minute
	}

	let results: CalendarInterval[] = [{}];
	for (const dim of dimensions) {
		const expanded: CalendarInterval[] = [];
		for (const existing of results) {
			for (const val of dim.values) {
				expanded.push({ ...existing, [dim.key]: val });
			}
		}
		results = expanded;
	}

	return results;
}

function escapeXml(str: string): string {
	return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function calendarIntervalToXml(
	interval: CalendarInterval,
	indent: string,
): string {
	const lines = [`${indent}<dict>`];
	for (const [key, value] of Object.entries(interval)) {
		lines.push(`${indent}\t<key>${key}</key>`);
		lines.push(`${indent}\t<integer>${value}</integer>`);
	}
	lines.push(`${indent}</dict>`);
	return lines.join("\n");
}

export function buildPlist(options: {
	label: string;
	programArguments: string[];
	calendarIntervals: CalendarInterval[];
	environmentVariables: Record<string, string>;
	logPath: string;
	workingDirectory: string;
}): string {
	const args = options.programArguments
		.map((a) => `\t\t<string>${escapeXml(a)}</string>`)
		.join("\n");

	const envEntries = Object.entries(options.environmentVariables)
		.map(
			([k, v]) =>
				`\t\t<key>${escapeXml(k)}</key>\n\t\t<string>${escapeXml(v)}</string>`,
		)
		.join("\n");

	const intervals =
		options.calendarIntervals.length === 1
			? calendarIntervalToXml(options.calendarIntervals[0], "\t\t")
			: `\t\t<array>\n${options.calendarIntervals.map((i) => calendarIntervalToXml(i, "\t\t\t")).join("\n")}\n\t\t</array>`;

	// For a single interval, use dict directly; for multiple, wrap in array
	const intervalBlock =
		options.calendarIntervals.length === 1
			? `\t<key>StartCalendarInterval</key>\n${intervals}`
			: `\t<key>StartCalendarInterval</key>\n${intervals}`;

	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Label</key>
\t<string>${escapeXml(options.label)}</string>
\t<key>ProgramArguments</key>
\t<array>
${args}
\t</array>
\t<key>EnvironmentVariables</key>
\t<dict>
${envEntries}
\t</dict>
${intervalBlock}
\t<key>StandardOutPath</key>
\t<string>${escapeXml(options.logPath)}</string>
\t<key>StandardErrorPath</key>
\t<string>${escapeXml(options.logPath)}</string>
\t<key>WorkingDirectory</key>
\t<string>${escapeXml(options.workingDirectory)}</string>
</dict>
</plist>
`;
}

export function plistDir(): string {
	return join(homedir(), "Library", "LaunchAgents");
}

export function plistPath(taskId: string): string {
	return join(plistDir(), `${LABEL_PREFIX}.${taskId}.plist`);
}

export function label(taskId: string): string {
	return `${LABEL_PREFIX}.${taskId}`;
}

export function unloadAgent(taskId: string): void {
	try {
		execSync(`launchctl unload ${plistPath(taskId)}`, {
			encoding: "utf-8",
			stdio: "pipe",
		});
	} catch {
		// Not loaded — ignore
	}
}

export function loadAgent(taskId: string): void {
	unloadAgent(taskId);
	execSync(`launchctl load ${plistPath(taskId)}`, {
		encoding: "utf-8",
		stdio: "pipe",
	});
}

export function removeAgent(taskId: string): void {
	unloadAgent(taskId);
	const path = plistPath(taskId);
	if (existsSync(path)) {
		unlinkSync(path);
	}
}

export function listInstalledAgents(): string[] {
	const dir = plistDir();
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => f.startsWith(`${LABEL_PREFIX}.`) && f.endsWith(".plist"))
		.map((f) => f.slice(LABEL_PREFIX.length + 1, -".plist".length));
}

export function syncLaunchd(
	tasks: LaunchdTask[],
	nodePath: string,
	cliPath: string,
	baseDir: string,
	envVars: Record<string, string>,
): void {
	const dir = plistDir();
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

	const desiredIds = new Set(tasks.map((t) => t.id));
	const installedIds = listInstalledAgents();

	// Remove stale agents
	for (const id of installedIds) {
		if (!desiredIds.has(id)) {
			removeAgent(id);
		}
	}

	// Use ~/Library/Logs for launchd output (sandbox-safe)
	const logDir = join(homedir(), "Library", "Logs", "agent247");
	if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
	const logPath = join(logDir, "agent247.log");

	// Install/update agents
	for (const task of tasks) {
		const intervals = cronToCalendarIntervals(task.schedule);
		const plist = buildPlist({
			label: label(task.id),
			programArguments: [
				nodePath,
				cliPath,
				"--dir",
				baseDir,
				"run",
				task.id,
				"--cron",
			],
			calendarIntervals: intervals,
			environmentVariables: envVars,
			logPath,
			workingDirectory: baseDir,
		});

		writeFileSync(plistPath(task.id), plist);
		loadAgent(task.id);
	}
}

/**
 * Convert an array of CalendarInterval dicts back to a cron expression.
 * This is a best-effort reverse of cronToCalendarIntervals.
 */
export function calendarIntervalsToCron(intervals: CalendarInterval[]): string {
	if (
		intervals.length === 0 ||
		(intervals.length === 1 && Object.keys(intervals[0]).length === 0)
	) {
		return "* * * * *";
	}

	// Collect all values per field
	const minutes = new Set<number>();
	const hours = new Set<number>();
	const days = new Set<number>();
	const months = new Set<number>();
	const weekdays = new Set<number>();

	let hasMinute = false;
	let hasHour = false;
	let hasDay = false;
	let hasMonth = false;
	let hasWeekday = false;

	for (const interval of intervals) {
		if (interval.Minute !== undefined) {
			hasMinute = true;
			minutes.add(interval.Minute);
		}
		if (interval.Hour !== undefined) {
			hasHour = true;
			hours.add(interval.Hour);
		}
		if (interval.Day !== undefined) {
			hasDay = true;
			days.add(interval.Day);
		}
		if (interval.Month !== undefined) {
			hasMonth = true;
			months.add(interval.Month);
		}
		if (interval.Weekday !== undefined) {
			hasWeekday = true;
			weekdays.add(interval.Weekday);
		}
	}

	const formatField = (has: boolean, values: Set<number>): string => {
		if (!has) return "*";
		return [...values].sort((a, b) => a - b).join(",");
	};

	return [
		formatField(hasMinute, minutes),
		formatField(hasHour, hours),
		formatField(hasDay, days),
		formatField(hasMonth, months),
		formatField(hasWeekday, weekdays),
	].join(" ");
}

/** Read the schedule of an installed agent as a cron expression */
export function readAgentSchedule(taskId: string): string | null {
	const path = plistPath(taskId);
	if (!existsSync(path)) return null;
	try {
		const json = execSync(
			`plutil -extract StartCalendarInterval json -o - ${path}`,
			{ encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
		).trim();
		const parsed = JSON.parse(json);
		const intervals: CalendarInterval[] = Array.isArray(parsed)
			? parsed
			: [parsed];
		return calendarIntervalsToCron(intervals);
	} catch {
		return null;
	}
}

/** Get schedules for all installed agents */
export function getAgentSchedules(): Map<string, string> {
	const result = new Map<string, string>();
	for (const id of listInstalledAgents()) {
		const schedule = readAgentSchedule(id);
		if (schedule) result.set(id, schedule);
	}
	return result;
}
