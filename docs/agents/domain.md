# Domain docs

This repository uses a single-context domain documentation layout.

## Before exploring or changing the codebase

Read these files when they exist:

- `CONTEXT.md` at the repository root
- Relevant ADRs under `docs/adr/`

If they do not exist, proceed silently. Do not create empty or speculative domain documentation upfront.

`CONTEXT.md` and ADRs should be created or updated only when domain terminology or architectural decisions are actually established.

## Layout

```text
/
├── CONTEXT.md
├── docs/
│   ├── adr/
│   └── agents/
└── src/
```

## Use the documented vocabulary

When naming domain concepts in code, tests, issues, specifications, and architecture proposals, use the terminology defined in `CONTEXT.md`.

Do not introduce synonyms for concepts that already have an established name.

If a required concept is missing, treat that as a documentation gap to resolve rather than inventing terminology silently.

## Respect architectural decisions

Read ADRs relevant to the area being changed.

If proposed work contradicts an existing ADR, surface the conflict explicitly instead of silently overriding the decision.
