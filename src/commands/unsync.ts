import { unsyncLaunchd } from "../lib/launchd.js";

export function unsyncCommand(): void {
	const removed = unsyncLaunchd();
	if (removed.length === 0) {
		console.log("No agent247 launch agents found.");
	} else {
		console.log(`Removed ${removed.length} launch agent(s):`);
		for (const id of removed) {
			console.log(`  ${id}`);
		}
	}
}
