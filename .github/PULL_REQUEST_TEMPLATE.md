* Related Issues: _#IssueNumber if necessary_
* Previous PRs: _#PRNumber if this PR is a follow-up_

## Introduction

_A short description of what the feature or the bug-fix is. Try to keep it to a single-paragraph "elevator pitch" style
so the reader easily understands what problem this proposal is addressing._

## Motivation

_Describe the problems that this proposal seeks to address and why it's important. If it's completely new functionality,
explain why this new functionality is necessary._

## Proposed solution

_Describe your solution to the problem. If possible provide examples and describe how they work. Show why your solution
is better than what's currently available: is it cleaner, safer, or more efficient?_

## Alternatives considered

_Describe any alternative approaches to addressing the same problem that you have thought about, and why you chose this
approach instead._

## Current PR issues

_Are there any known issues in this Pull Request? This will help others understand if more work will be needed._

## Checklist

_All checks must pass before this PR can be merged (CI runs them on Node 20, 22, and 24)._

- [ ] Targets the `main` branch
- [ ] Added or updated tests covering the change
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes (`pnpm format` applied)
- [ ] `pnpm test` passes
- [ ] `pnpm test:types` passes (if public types changed)
- [ ] `pnpm attw` passes (if public types changed)
- [ ] `pnpm smoke` passes
