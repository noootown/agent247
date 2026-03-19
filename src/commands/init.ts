import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const GITIGNORE_TEMPLATE = `# OS
.DS_Store
Thumbs.db

# agent247 runtime
runs/
.bin/
tasks/*/.lock
`;

const VARS_TEMPLATE = `# Bot identity
bot_name: My Bot
bot_signature: Automated review by My Bot
`;

export function initCommand(targetDir: string): void {
	const dir = resolve(targetDir);

	if (existsSync(dir) && existsSync(join(dir, "vars.yaml"))) {
		console.log(`Workspace already exists at ${dir}`);
		return;
	}

	mkdirSync(dir, { recursive: true });
	mkdirSync(join(dir, "tasks"), { recursive: true });
	mkdirSync(join(dir, "runs"), { recursive: true });

	if (!existsSync(join(dir, ".gitignore"))) {
		writeFileSync(join(dir, ".gitignore"), GITIGNORE_TEMPLATE);
	}

	if (!existsSync(join(dir, "vars.yaml"))) {
		writeFileSync(join(dir, "vars.yaml"), VARS_TEMPLATE);
	}

	console.log(`Workspace initialized at ${dir}`);
	console.log();
	console.log("Next steps:");
	console.log(`  1. Edit ${join(dir, "vars.yaml")} with your settings`);
	console.log(`  2. Create tasks under ${join(dir, "tasks/")}`);
	console.log(`  3. Set AGENT247_BASE_DIR=${dir} in your shell profile`);
	console.log(`     Or run: agent247 --dir ${dir} sync`);
}
