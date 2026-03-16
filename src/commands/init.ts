import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";

const VARS_TEMPLATE = `github_username: your-username
platform_repo: owner/repo
platform_repo_path: /path/to/your/project

# Bot identity
bot_name: My Bot
bot_signature: Automated review by My Bot
`;

const ENV_TEMPLATE = `# agent247 — required environment variables
# Fill in actual values below
GITHUB_TOKEN=
SLACK_TOKEN=
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

  if (!existsSync(join(dir, "vars.yaml"))) {
    writeFileSync(join(dir, "vars.yaml"), VARS_TEMPLATE);
  }

  if (!existsSync(join(dir, ".env.local"))) {
    writeFileSync(join(dir, ".env.local"), ENV_TEMPLATE);
  }

  if (!existsSync(join(dir, "dev.env"))) {
    writeFileSync(join(dir, "dev.env"), ENV_TEMPLATE);
  }

  console.log(`Workspace initialized at ${dir}`);
  console.log();
  console.log("Next steps:");
  console.log(`  1. Edit ${join(dir, "vars.yaml")} with your settings`);
  console.log(`  2. Edit ${join(dir, ".env.local")} with your secrets`);
  console.log(`  3. Create tasks under ${join(dir, "tasks/")}`);
  console.log(`  4. Set AGENT247_BASE_DIR=${dir} in your shell profile`);
  console.log(`     Or run: agent247 --dir ${dir} list`);
}
