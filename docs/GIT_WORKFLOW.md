# GitHub Synchronization and Session Continuity

## Current access state

The initial GitHub connector lookup returned `unsupported`. The exact owner/repository URL was not provided. No GitHub repository was inspected, created, modified, or pushed to. There is no guessed `origin` remote.

The local initial commit can be transferred using `Endless-Driver-initial.bundle`; `Endless-Driver-initial.zip` contains the working files without dependencies or build output. These exports are delivery files, not files to commit into the project itself.

**Never paste a GitHub token, password, or private SSH key into chat or into a Git remote URL.** Use a supported authorized connection, local credential manager, or SSH authentication on the machine performing the push.

## 1. Obtain the real destination

Ask the owner for the actual repository URL. “Endless Driver” is the display name; a URL-safe repository slug generally uses hyphens. Do not invent the owner, change a different repository, create a public repository, or assume the existing repository is empty.

If a repository does not yet exist, the owner must create/authorize the dedicated repository with the desired visibility. Creation is not performed by this scaffold.

Record the confirmed, non-secret URL and branch in the session handoff after access is available. The workspace may not preserve local Git authentication/configuration between sessions; history and handoff must be sufficient to reconnect without storing credentials in source.

## 2. Import the portable initial commit

On a machine with Git, use the downloaded bundle's real file path:

```bash
git clone /path/to/Endless-Driver-initial.bundle Endless-Driver
cd Endless-Driver
git log -1 --oneline
git status --short
```

The bundle contains the `main` branch and its initial history. Cloning a bundle initially sets `origin` to the bundle file, not to GitHub. Confirm what exists before changing it.

```bash
git remote -v
```

Install/check using the supported Node version:

```bash
npm ci
npm run check
```

The user selected portable delivery for the initial setup. The ZIP contains both the tracked working-file folder and a copy of `Endless-Driver-initial.bundle`. The working-file folder alone has no `.git` history; clone the included or separately downloaded bundle to restore the committed repository.

## 3. First push to a genuinely empty dedicated repository

Use this path **only if the destination has no refs/history** and the URL is confirmed by the owner. Set `REPO_URL` to that real URL in your local shell; do not include credentials.

```bash
# In the bundle clone; replace the value with the actual authorized URL:
REPO_URL='PASTE_THE_CONFIRMED_REPOSITORY_URL_HERE'
git remote set-url origin "$REPO_URL"
git remote -v

# This must succeed; inspect its output before proceeding:
git ls-remote origin
```

If any refs are returned, the repository is not empty. Use the existing-repository workflow instead. If authentication fails, stop; an empty display caused by a failed command is not proof of an empty repository.

After confirming the remote is genuinely empty and authenticated:

```bash
git push --set-upstream origin main
```

No force flag is needed or authorized. Verify the pushed SHA using section 5. Update the handoff to remove the access blocker only after success is verified, commit that update, and push it too.

## 4. Integrate into an existing dedicated repository

If the repository contains a README, configuration, or project history, do not replace its history or overwrite existing files blindly. Clone it first, inspect, and integrate the scaffold on a review branch:

```bash
# REPO_URL must already be the actual user-authorized URL.
git clone "$REPO_URL" Endless-Driver-existing
cd Endless-Driver-existing
git status --short
git log -5 --oneline
git switch -c chore/initial-scaffold

git fetch /path/to/Endless-Driver-initial.bundle main:refs/remotes/scaffold/main
git cherry-pick --no-commit refs/remotes/scaffold/main
```

Stop if conflicts occur. Preserve existing project content and resolve overlapping README/configuration choices deliberately with the owner; do not use “take ours/theirs” across the entire repository. If the existing project is not a clean starting point, reassess the scaffold rather than pretending it integrates unchanged.

Before completing the integration:

```bash
git diff
git diff --cached
npm ci
npm run check
```

Configure your legitimate local commit identity if needed. Do not impersonate the owner. Commit and push the reviewed integration branch:

```bash
git commit -m "chore: add Endless Driver plan and initial scaffold"
git push --set-upstream origin chore/initial-scaffold
```

Merge through the repository's approved workflow. Do not claim the default branch contains the setup if it only exists on a review branch. Verify whichever branch was actually pushed and record that distinction in the handoff.

## 5. Verify remote persistence

After a successful push, these values must match:

```bash
# Local committed state:
git rev-parse HEAD
git branch --show-current

# Remote state; use the actual current branch name:
BRANCH="$(git branch --show-current)"
git ls-remote --heads origin "refs/heads/$BRANCH"
```

Compare the returned remote SHA with the local SHA. A commit created locally, a ZIP exported, or a Git command invoked is not evidence of a successful remote push. Also record whether the working tree is clean and whether any uncommitted files remain.

CI is configured in `.github/workflows/ci.yml`, but its remote result must be checked separately after GitHub receives the files. Local validation is not a verified GitHub Actions run.

## 6. Normal start-of-session procedure

1. Confirm project root, branch, exact origin URL, `git status`, and latest commit.
2. Read `AGENTS.md`, the plan, and handoff.
3. Reconnect authentication without storing secrets in source.
4. Fetch remote refs. Compare local and remote before changing anything.
5. On a clean branch with no divergent work, fast-forward only when appropriate. If the branches diverge or files are dirty, stop and reconcile without discarding progress.
6. Install dependencies with `npm ci`.
7. Confirm the user's currently authorized phase before implementation.

## 7. Normal milestone/session-end procedure

1. Run `npm run check` plus relevant interactive/device tests.
2. Update handoff, plan status, changed decisions, asset records, and known limitations.
3. Review changes and staged content for secrets, binaries, unexpected output, and unrelated edits.
4. Commit one coherent milestone; avoid including dependency/build/cache directories.
5. Push to the confirmed branch, then verify SHA alignment.
6. Report true push and CI status; stop at the phase gate.

## 8. When a push is blocked

- Keep the local commit and document why the remote write failed.
- Do not erase remote history, force-push, publish elsewhere, or request credentials in chat.
- Export a bundle from the committed repository:

```bash
git bundle create ../Endless-Driver-checkpoint.bundle --all
git bundle verify ../Endless-Driver-checkpoint.bundle
```

- Deliver the bundle and, when helpful, an archive of tracked files. Do not include tokens or `.git/config` in the archive.
- Explicitly say that GitHub synchronization remains incomplete. A future session can clone the bundle to recover the committed work.

## 9. Commit conventions and phase gates

Examples: `docs: refine world-streaming plan`, `chore: validate initial scaffold`, `feat(engine): initialize responsive scene`, `fix(input): release cancelled touch pointer`.

Always update the handoff with the authorized phase and next step. Pushing the initial setup does not authorize Phase 1. Finishing Phase 1 does not authorize Phase 2. No deployment, release publication, or repository visibility change is authorized by initial planning.
