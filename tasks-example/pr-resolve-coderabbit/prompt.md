You are resolving a CodeRabbit review comment on PR #{{pr_number}} (branch: {{branch}}).

**File:** {{file_path}}:{{line}}
**PR:** {{pr_url}}
**Comment:** {{comment_url}}

## CodeRabbit Feedback

{{comment_body}}

## Instructions

1. **Read the code** at {{file_path}} around line {{line}}. Read enough context to understand the function/class.

2. **Verify the finding.** Is CodeRabbit correct?
   - Check if the issue is real (not a false positive due to missing context, upstream validation, framework guarantees, etc.)
   - Check if it's already handled elsewhere

3. **Decide:**
   - **DISMISS** — CodeRabbit is wrong or the code is already safe
   - **FIX** — the issue is real and straightforward to fix
   - **ASK** — requires human judgement (architectural decision, unclear trade-off)

4. **Act on your decision:**

   **If FIX:**
   a. Make the minimal code change to fix the issue
   b. Run the relevant tests to check for regressions (find the test command from the project's AGENTS.md or test config)
   c. Run lint/typecheck on the changed file
   d. Push to the branch: `git push`
   e. Post a reply and resolve:
      ```
      gh api graphql -f query='mutation {
        addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: "{{thread_id}}", body: "Fixed by {{bot_name}} — <brief description of fix>"}) { comment { id } }
      }'
      gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "{{thread_id}}"}) { thread { isResolved } } }'
      ```

   **If DISMISS:**
   - Post a reply explaining why, then resolve:
     ```
     gh api graphql -f query='mutation {
       addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: "{{thread_id}}", body: "Reviewed by {{bot_name}} — <dismissal reasoning>"}) { comment { id } }
     }'
     gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "{{thread_id}}"}) { thread { isResolved } } }'
     ```

   **If ASK:**
   - Post a reply and leave the thread unresolved:
     ```
     gh api graphql -f query='mutation {
       addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: "{{thread_id}}", body: "Reviewed by {{bot_name}} — this requires human judgement. <explain tradeoffs>"}) { comment { id } }
     }'
     ```

## Output Format

- If fixed or dismissed: first line should be {{comment_url}}, then a brief summary
- If ASK: respond with `PENDING` on the first line, then explain what needs human judgement
- If no actionable changes: respond with exactly: NO_ACTION
