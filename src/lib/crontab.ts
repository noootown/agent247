import { execSync } from "node:child_process";

const START_MARKER = "# --- agent247 START ---";
const END_MARKER = "# --- agent247 END ---";

interface CrontabTask {
	id: string;
	name: string;
	schedule: string;
}

export function generateFencedBlock(
	tasks: CrontabTask[],
	binPath: string,
	runsDir: string,
	envVars?: Record<string, string>,
): string {
	const lines = [START_MARKER];
	if (envVars) {
		for (const [key, value] of Object.entries(envVars)) {
			lines.push(`${key}=${value}`);
		}
	}
	for (const task of tasks) {
		lines.push(`# ${task.id} (${task.name})`);
		lines.push(
			`${task.schedule} ${binPath} run ${task.id} >> ${runsDir}/cron.log 2>&1`,
		);
	}
	lines.push(END_MARKER);
	return `${lines.join("\n")}\n`;
}

export function replaceFencedSection(
	existing: string,
	newBlock: string,
): string {
	const startIdx = existing.indexOf(START_MARKER);
	const endIdx = existing.indexOf(END_MARKER);
	if (startIdx !== -1 && endIdx !== -1) {
		const before = existing.substring(0, startIdx);
		const afterStart = endIdx + END_MARKER.length;
		const after = existing.substring(
			existing[afterStart] === "\n" ? afterStart + 1 : afterStart,
		);
		return before + newBlock + after;
	}
	const trimmed = existing.endsWith("\n") ? existing : `${existing}\n`;
	return trimmed + newBlock;
}

export function readCrontab(): string {
	try {
		return execSync("crontab -l", { encoding: "utf-8" });
	} catch {
		return "";
	}
}

export function writeCrontab(content: string): void {
	execSync("crontab -", { input: content, encoding: "utf-8" });
}

/** Remove the agent247 fenced block from crontab (migration to launchd) */
export function removeCrontabBlock(): void {
	const existing = readCrontab();
	if (!existing.includes(START_MARKER)) return;
	const cleaned = replaceFencedSection(existing, "");
	const trimmed = cleaned.replace(/\n{3,}/g, "\n\n").trim();
	if (trimmed) {
		writeCrontab(`${trimmed}\n`);
	} else {
		// Empty crontab
		try {
			execSync("crontab -r", { encoding: "utf-8", stdio: "pipe" });
		} catch {
			// Already empty
		}
	}
	console.log("Migrated: removed agent247 entries from crontab.");
}

export function syncCrontab(
	tasks: CrontabTask[],
	binPath: string,
	runsDir: string,
	envVars?: Record<string, string>,
): void {
	const existing = readCrontab();
	const block = generateFencedBlock(tasks, binPath, runsDir, envVars);
	const updated = replaceFencedSection(existing, block);
	writeCrontab(updated);
}
