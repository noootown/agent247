#!/bin/bash
set -euo pipefail

USERNAME="$1"
REPO="$2"
REPO_PATH="$3"

OWNER="${REPO%%/*}"
NAME="${REPO##*/}"

# Get open PRs by user with unresolved review threads
threads=$(gh api graphql -f query="
query {
  search(query: \"repo:${REPO} is:pr is:open author:${USERNAME}\", type: ISSUE, first: 20) {
    nodes {
      ... on PullRequest {
        number
        url
        headRefName
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            line
            path
            comments(first: 1) {
              nodes {
                author { login }
                body
                url
              }
            }
          }
        }
      }
    }
  }
}")

# Build worktree map as JSON: { "branch": "/path/to/worktree", ... }
worktree_json=$(git -C "$REPO_PATH" worktree list --porcelain | awk '
  /^worktree / { path = substr($0, 10) }
  /^branch refs\/heads\// {
    branch = substr($0, 19)
    printf "%s\t%s\n", branch, path
  }
' | jq -Rn '[inputs | split("\t") | {(.[0]): .[1]}] | add // {}')

# Filter to unresolved coderabbitai threads and attach worktree paths
echo "$threads" | jq --argjson wt "$worktree_json" --arg fallback "$REPO_PATH" '
[
  .data.search.nodes[] |
  . as $pr |
  .reviewThreads.nodes[] |
  select(.isResolved == false) |
  select(.comments.nodes[0].author.login | test("^coderabbitai")) |
  {
    pr_number: ($pr.number | tostring),
    pr_url: $pr.url,
    branch: $pr.headRefName,
    thread_id: .id,
    file_path: (.path // ""),
    line: (.line // 0 | tostring),
    comment_body: .comments.nodes[0].body,
    comment_url: .comments.nodes[0].url,
    worktree_path: ($wt[$pr.headRefName] // $fallback)
  }
]'
