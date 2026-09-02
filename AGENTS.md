# Agent Guide

## Project

This is a minimal Vue 3 and TypeScript project used to build and verify an automated AI frontend workflow.

## Toolchain

- Package manager: pnpm
- Framework: Vue 3 with `<script setup lang="ts">`
- Build tool: Vite
- Routing: Vue Router
- Shared state: Pinia
- Linting: ESLint
- Formatting: Prettier
- Type checking: vue-tsc
- Unit tests: Vitest
- E2E tests: Playwright with Chromium

Use pnpm only. Do not use npm or Yarn.

## Development commands

- Install dependencies: `pnpm install`
- Start development server: `pnpm run dev`
- Apply safe automatic fixes: `pnpm run fix`
- Run the standard quality gate: `pnpm run check`
- Run the complete gate including E2E: `pnpm run check:all`

## Coding rules

### Scope and dependencies

- Read the relevant existing code before making changes.
- Make the smallest complete change that satisfies the task.
- Do not modify unrelated files.
- Reuse existing dependencies and platform APIs whenever practical.
- Add a dependency only when there is a concrete need, and explain why.
- Do not edit generated output such as `dist`, `coverage`, `test-results`, or `playwright-report`.

### Vue and TypeScript

- Prefer `<script setup lang="ts">` and the Composition API.
- Keep props, emits, and public component APIs explicitly typed.
- Avoid `any` and type assertions used only to silence errors.
- Use computed values for derived state instead of duplicating state.
- Keep state local unless it genuinely needs to be shared.
- Use Pinia only for shared application state.
- Keep components focused and avoid premature abstractions.
- Follow the existing project structure instead of creating speculative layers or empty folders.

### UI and behavior

- Follow the approved task requirements and design source.
- Use semantic HTML and preserve keyboard accessibility.
- Follow existing patterns for minor decisions.
- Surface assumptions that materially affect behavior, data, scope, or user experience.
- Implement loading, empty, error, disabled, and success states when required by the task.

### Quality

- Add or update tests for changed behavior at the closest practical level.
- Do not remove tests or weaken assertions just to make validation pass.
- Do not disable lint rules or weaken TypeScript settings just to make validation pass.
- Do not claim completion when required verification commands have not passed.

### Consistency

- Treat ESLint, Prettier, TypeScript, tests, and CI as executable rules; prose instructions do not override a failing gate.
- Do not add a second linter, formatter, package manager, or competing convention for the same responsibility.
- Follow existing naming, import, component, state, and test patterns unless the task explicitly changes the convention.
- AI-generated code follows the same rules and review process as human-written code; do not create exceptions for generated files.
- When intentionally changing a shared convention, update the relevant configuration, `AGENTS.md`, examples, and tests in the same PR.
- CI installs from the committed lockfile with `pnpm install --frozen-lockfile`; dependency changes must update `package.json` and `pnpm-lock.yaml` together.

## Required workflow

1. Read the task and relevant existing files before editing.
2. Make the smallest complete change that satisfies the task.
3. Add or update tests for changed behavior.
4. Run focused tests while developing.
5. Review the final diff for unrelated changes.
6. Run `pnpm run check` before reporting completion.
7. Run `pnpm run check:all` when routes or user-visible workflows change.

If a required command cannot run, report the exact command and error instead of claiming success.

## Completion report

Report:

- What changed
- Which verification commands passed
- Any remaining risks or assumptions

## Agent skills

### Issue tracker

Issues, PRDs, and implementation tickets are tracked in GitHub Issues using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the canonical `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix` labels. See `docs/agents/triage-labels.md`.

Before applying `ready-for-agent`, verify the issue against `docs/agents/definition-of-ready.md` and require explicit human approval.

### Domain docs

This is a single-context repository using `CONTEXT.md` and `docs/adr/` at the repository root. See `docs/agents/domain.md`.
