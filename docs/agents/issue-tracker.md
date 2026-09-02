# Issue tracker: GitHub

Issues, PRDs, specifications, and implementation tickets for this repository live in GitHub Issues. Use the `gh` CLI for all operations.

The canonical remote is `origin`, currently pointing to `daqic/auto-workflow`. Do not publish issues to the `legacy` remote.

## Prerequisites

Before publishing issues:

- The repository must have the `origin` GitHub remote configured.
- The `gh` CLI must be installed and authenticated.
- If either prerequisite is missing, stop and report it instead of publishing somewhere else.

## Conventions

- Create an issue: `gh issue create --title "..." --body "..."`
- Read an issue and its comments: `gh issue view <number> --comments`
- List issues: `gh issue list`
- Comment on an issue: `gh issue comment <number> --body "..."`
- Apply or remove labels: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- Close an issue: `gh issue close <number> --comment "..."`

Run these commands inside the repository so `gh` can infer the repository from the current branch and its upstream. If repository selection is ambiguous because multiple GitHub remotes exist, explicitly use `--repo daqic/auto-workflow`.

## Pull requests as a triage surface

**PRs as a request surface: no.**

Pull requests are not processed as feature requests by the triage workflow unless this flag is deliberately changed to `yes`.

GitHub shares one number space across issues and pull requests. If a bare reference such as `#42` is ambiguous, try `gh pr view 42` and then fall back to `gh issue view 42`.

## Skill terminology

When a skill says “publish to the issue tracker”, create a GitHub issue in the canonical repository.

When a skill says “fetch the relevant ticket”, read the corresponding GitHub issue, including its body, labels, and comments.

## Wayfinding operations

The `wayfinder` skill uses one map issue with child issues as tickets.

- Map: an issue labelled `wayfinder:map`, containing Notes, Decisions-so-far, and Fog.
- Child ticket: an issue linked to the map as a GitHub sub-issue. If sub-issues are unavailable, add it to the map’s task list and include `Part of #<map>` in the child.
- Ticket type labels: `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`.
- Blocking: use GitHub’s native issue dependencies. If unavailable, include `Blocked by: #<n>` at the top of the child issue.
- Claim: assign the selected unblocked ticket to the current user.
- Resolve: comment with the result, close the child issue, and record the resulting context link in the map’s Decisions-so-far section.
