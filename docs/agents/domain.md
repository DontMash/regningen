# Domain Docs

This repo uses a single-context layout: root `GLOSSARY.md` and `docs/adr/`.

## Before exploring

- Read `GLOSSARY.md` for domain vocabulary.
- Read ADRs in `docs/adr/` that touch the area you're about to work in.

If either is absent, proceed silently. The `/domain-modeling` skill creates
domain docs lazily when terms or decisions are resolved.

## Use the glossary's vocabulary

When naming a domain concept in an issue title, refactor proposal, hypothesis,
or test name, use the term defined in `GLOSSARY.md`. Respect its avoided synonyms.

If a needed concept is missing, reconsider whether it belongs to the domain
or note the gap for `/domain-modeling`.

## Flag ADR conflicts

Explicitly surface proposals that contradict an existing ADR:

> Contradicts ADR-0007 (event-sourced orders), but worth reopening because…
