# Changelog

All notable changes to AI Router Board are documented here, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0]

### Added

- First public router release, based on DanWahlin/ai-agent-board (MIT).
- Deterministic routing: reserved script tier 0, free text tier 1, Codex tier 2, and Claude tier 3; explicit agent/tier overrides.
- Fail-closed free-provider sensitivity gate: public text only, no repository path; configured confidential roots are protected.
- Groq, Gemini, and OpenRouter pool with protected key files, quota waiting, and hard-failure cooldown.
- Deterministic answer acceptance checks and one free-answer escalation to Codex.
- Routing reasons and per-attempt usage panel, with unknown token counts distinguished from zero.
- English and Persian front pages, setup, policy, community, and developer documentation.
- Container packaging and tag-driven release workflow.

[Unreleased]: https://github.com/66Hamidreza/ai-router-board/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/66Hamidreza/ai-router-board/releases/tag/v0.1.0
