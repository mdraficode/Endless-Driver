# Standard Workflow — GitHub Is the Development Environment

**This file is the operating contract for anyone (human or AI agent) working on
Endless Driver.** It exists so the workflow survives session changes, tool
changes, and agent changes. Follow it exactly; if reality forces a deviation,
record the deviation and its reason in `docs/SESSION_HANDOFF.md`.

## The one idea

GitHub is the only permanent home of this project: source code, CI, and the
playable build all live there. Any local environment (Arena sandbox, laptop,
Codespace) is **disposable scratch space**. Nothing project-related is ever
stored locally with the expectation that it will still be there tomorrow.

- Repository: `github.com/mdraficode/Endless-Driver` (public)
- Playable build (auto-deployed on every push to `main`):
  https://mdraficode.github.io/Endless-Driver/
- Spec: `PROJECT_PLAN.md` · Continuity log: `docs/SESSION_HANDOFF.md`
- Engineering rules: `AGENTS.md` · Git rules: `docs/GIT_WORKFLOW.md`

## Golden rules (non-negotiable)

1. **GitHub is the single source of truth.** If work is not pushed, it does
   not exist. The local copy is a cache, never the original.
2. **Keep the agent workspace near-empty.** In the Arena environment, only
   tiny, irreplaceable session files (credential plumbing, small helper
   scripts, this kind of note) persist in `/home/user` — currently ~33 KB.
   Never let a project checkout, `node_modules`, captures, or build output
   accumulate there. The workspace snapshot cap (~128 MB) must be
   unreachable by design, not by vigilance.
3. **Work in ephemeral scratch.** Every session starts from a fresh shallow
   clone in scratch space (`/tmp` on Arena): `~/dev-fetch.sh`, or by hand:
   `git clone --depth 1 https://github.com/mdraficode/Endless-Driver.git /tmp/endless-driver`.
   All work — clones, dependencies, screenshots, browser installs, build
   output — lives and dies there.
4. **Push before every run.** Commit and push _before_ starting anything
   long or destructive (builds, test suites, browser captures), and again at
   every verifiable increment. Never build new work on top of unpushed
   state. If the sandbox is wiped, the worst acceptable loss is a few
   minutes of work, never a milestone.
5. **Keep the sandbox alive until the run is safe.** A task is only done
   when: the full check suite is green, the commit is pushed, the remote
   SHA matches local HEAD, CI (Validate + Deploy) is green, and the live
   build reflects the change where applicable. Do not abandon a session
   with work merely "probably saved".
6. **Artifacts are regenerable; scripts are the asset.** Screenshots and
   evidence captures go to ephemeral storage (`/tmp`), never into the
   workspace or the repo. The capture _scripts_ (`scripts/capture-*.mjs`)
   are committed, so any evidence can be reproduced on demand.
7. **Credentials stay out of the repo and out of view.** Tokens live only
   in the environment's credential store (on Arena:
   `/home/user/.github-auth/`, wired via `core.askpass` in `~/.gitconfig`).
   Never print a token, never commit one, never ask the owner to paste one
   for routine pushes. Arena snapshot restores drop executable bits and
   `.git/config`'s remote — recovery is routine: `chmod +x` the auth
   scripts, `git remote add origin https://github.com/mdraficode/Endless-Driver.git`,
   push, verify the SHA.
8. **Run checks unfiltered and believe the exit code.** Before every
   commit: `npm run check` in full, output unpiped (piping through
   `grep`/`head` masks failures — this once shipped a red CI). A green
   claim requires the check's own exit code 0.
9. **Continuity is written down, not remembered.** Every shipped milestone
   appends a numbered section to `docs/SESSION_HANDOFF.md` and updates
   `PROJECT_PLAN.md` status where relevant. A new session's first act is
   reading `WORKFLOW.md` → `AGENTS.md` → `PROJECT_PLAN.md` →
   `docs/SESSION_HANDOFF.md` (latest sections).
10. **Phases are gated.** Work only inside the phase the owner has
    authorized (see `AGENTS.md`). Never start the next phase on your own
    initiative. Free/open assets only (CC0-first); never ask the owner to
    buy anything.

## Session checklist

**Start**

1. Shallow-clone into scratch space (rule 3); confirm HEAD matches the
   remote and the tree is clean.
2. Read the continuity files (rule 9).
3. Install dependencies in scratch space only (`npm ci`).

**During** 4. Small increments: implement → test → commit → push → verify SHA. 5. Captures/proofs to ephemeral storage; kill stray dev servers and
browsers when done (sandbox RAM is small, ~2 GB).

**End** 6. Final commit + push; confirm remote SHA == local HEAD. 7. Confirm CI green; spot-check the live Pages build when the change is
user-visible. 8. Append the handover section; delete the scratch clone.

## Environment notes (Arena sandbox)

- Headless Chromium (Playwright, browsers under `/tmp/pw-browsers`) proves
  **correctness, never frame rate** — it runs WebGL2/SwiftShader at
  seconds-per-frame. Use frame-based waits after teleports, not wall-clock
  drives. If captures come back black-framed with WebGL context loss, it
  is sandbox RAM pressure: stop duplicate servers, kill stray Chromium,
  retry.
- Dev servers bind `0.0.0.0`; one preview server at a time.
- `.npm`, `.cache`, `node_modules`, `dist` etc. are excluded from the
  workspace snapshot — they still belong in scratch space, not `/home/user`.

## If you are a different agent picking this up

You need: git access to the repo above (the owner's credential, however
your platform stores it), Node 20, and this file's rules. Everything else —
spec, architecture, history, decisions — is in the repo. Start at the
session checklist, and treat rule 4 as your religion: **push before every
run.**
