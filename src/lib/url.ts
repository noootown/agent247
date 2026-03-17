const URL_PATTERNS: Array<{
	pattern: RegExp;
	format: (match: RegExpMatchArray) => string;
}> = [
	{
		// GitHub PR: https://github.com/owner/repo/pull/123
		pattern: /github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/,
		format: (m) => `PR #${m[1]}`,
	},
	{
		// GitHub Issue: https://github.com/owner/repo/issues/123
		pattern: /github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/,
		format: (m) => `Issue #${m[1]}`,
	},
	{
		// GitHub commit: https://github.com/owner/repo/commit/abc123
		pattern: /github\.com\/[^/]+\/[^/]+\/commit\/([a-f0-9]{7})/,
		format: (m) => `Commit ${m[1]}`,
	},
	{
		// Linear issue: https://linear.app/team/issue/TEAM-123
		pattern: /linear\.app\/[^/]+\/issue\/([A-Z]+-\d+)/,
		format: (m) => m[1],
	},
	{
		// Jira issue: https://xxx.atlassian.net/browse/PROJ-123
		pattern: /atlassian\.net\/browse\/([A-Z]+-\d+)/,
		format: (m) => m[1],
	},
];

export function formatUrlSlug(url: string): string {
	for (const { pattern, format } of URL_PATTERNS) {
		const match = url.match(pattern);
		if (match) return format(match);
	}
	return "Link";
}
