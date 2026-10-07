# Project agent setup

Claude Code and Codex share `../AGENTS.md` and `skills/`.
`.claude/skills` is a relative symlink to `.agents/skills`; Git stores the link,
not a second copy of the skills. Preserve symlinks when cloning on Windows.

Claude Code must be 2.1.281 or newer. Its default AGENTS.md fallback requires
that no parent/project `CLAUDE.md` or `CLAUDE.local.md` shadows it. If you keep
local Claude instructions, select `claude-md-and-agents-md` in `/config`.
Tool-specific permissions, hooks and MCP configuration remain tool-specific.

## Upstream skills

The two skills `managing-plans-lifecycle` and `superpowers-plans-bridge` are
unmodified copies from [agent-plans](https://github.com/alvaro-francisco-gil/agent-plans/tree/702f79a51189ea256a24168e5db4fa6cc46854ee),
version 2.0.1, commit `702f79a51189ea256a24168e5db4fa6cc46854ee`.
The MIT licence is in `skills/LICENSE.agent-plans`.

Update both files together from a reviewed upstream commit and update this pin.
Do not fork their instructions locally: repository-specific policy belongs in
`AGENTS.md`. These files replace the project-level plans-lifecycle plugin install;
if you separately installed that plugin globally, disable it for this project to
avoid exposing two copies.

Shared skills link into the `.agents/_shared` submodule
([agent-skills](https://github.com/alvaro-francisco-gil/agent-skills)): `ship-a-feature`,
`orchestrate`, `advance-plans` and `review-ideas`, plus the scripts `scripts/pr-land.js`,
`scripts/plans-map.js`, `scripts/agent-env.sh`, `scripts/agent-capacity.js`,
`scripts/agent-dispatch.sh`, `scripts/pr-land-bg.sh`, `scripts/ideas-review-order.js`,
`scripts/agent-auto-mode.js` and the hook `.claude/hooks/guard-lander-kill.sh`. Their
repo-specific values live in `land.config.json`, `orchestrate.config.json` and
`auto-mode.json` here — never edit the submodule to fit this repo.

`auto-mode.json` is the repo's policy phrased for Claude Code's auto-mode classifier,
which never reads a repo's own settings. Install it into your user settings with
`pnpm agent:auto-mode` (preview) and `pnpm agent:auto-mode --write`; re-run after it
changes. It must stay a restatement of `AGENTS.md` § Approval and the Autonomy contract. Run `git submodule update --init --recursive` after cloning and in new
worktrees; until then every one of those links dangles.

References: [Claude instructions](https://code.claude.com/docs/en/memory#read-agentsmd),
[Claude skills](https://code.claude.com/docs/en/skills),
[Codex skills](https://learn.chatgpt.com/docs/build-skills).
