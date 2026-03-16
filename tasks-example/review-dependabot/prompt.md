Review the following Dependabot PR: {{url}}

PR Title: {{title}}
PR Number: #{{number}}
Branch: {{headRefName}}

Analyze this dependency update and provide:
1. Summary of the dependency change (what package, from what version to what version)
2. Risk assessment:
   - Is this a major, minor, or patch version bump?
   - Are there known breaking changes?
   - Does this dependency have security advisories?
3. Recommendation: one of
   - MERGE — safe to merge as-is
   - REVIEW — needs manual review (explain why)
   - SKIP — not worth updating (explain why)

Output format:
- First line: the PR URL only
- If there are no open Dependabot PRs, respond with exactly: NO_ACTION
