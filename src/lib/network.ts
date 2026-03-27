import { createConnection } from "node:net";

/**
 * Quick TCP connect to Cloudflare DNS (1.1.1.1:443) to verify
 * actual network connectivity, not just cached DNS resolution.
 */
export function isOnline(timeoutMs = 3000): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = createConnection({
			host: "1.1.1.1",
			port: 443,
			timeout: timeoutMs,
		});
		socket.once("connect", () => {
			socket.destroy();
			resolve(true);
		});
		socket.once("timeout", () => {
			socket.destroy();
			resolve(false);
		});
		socket.once("error", () => {
			socket.destroy();
			resolve(false);
		});
	});
}
