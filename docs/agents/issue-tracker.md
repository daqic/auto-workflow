# Issue tracker: GitHub

Issues, PRDs, and implementation tickets for this repository live in GitHub Issues. Use the `gh` CLI for all operations.

## Prerequisites

Before publishing issues:

- The repository must have a GitHub remote configured.
- The `gh` CLI must be installed and authenticated.
- If either prerequisite is missing, stop and report it instead of publishing somewhere else.

## Conventions

- Create an issue: `gh issue create`
- Read an issue and its comments: `gh issue view <number> --comments`
- List issues: `gh issue list`
- Comment on an issue: `gh issue comment <number>`
- Apply or remove labels: `gh issue edit <number>`
- Close an issue: `gh issue close <number>`

Infer the repository from its configured GitHub remote.

## Skill terminology

When a skill says “publish to the issue tracker”, create a GitHub issue.

When a skill says “fetch the relevant ticket”, read the corresponding GitHub issue, including its body, labels, and comments.
