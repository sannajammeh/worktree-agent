# worktree-cli

Interactive CLI for managing git worktrees. Creates worktrees at `~/worktrees/<repo>/<branch>`.

## Usage

```bash
# npx
npx worktree-cli

# pnpm
pnpm dlx worktree-cli

# bun
bunx worktree-cli
```

### Create worktree

```bash
worktree
```

Prompts for:
1. Base branch (fetches from origin first)
2. New branch name

Creates worktree at `~/worktrees/<repo>/<branch>`.

### Clean worktrees

```bash
# interactive selection
worktree clean

# remove specific branch
worktree clean <branch-name>
```

## Install globally (optional)

```bash
npm i -g worktree-cli
```

## Dev

```bash
bun install
bun run init.ts        # run directly
bun run build          # compile to standalone ./worktree binary
```
