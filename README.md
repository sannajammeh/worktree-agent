# worktree

Interactive CLI for managing git worktrees. Creates worktrees at `~/worktrees/<repo>/<branch>`.

## Install

```bash
bun install
bun run build
# moves ./worktree to your PATH
```

## Usage

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

## Dev

```bash
bun run init.ts        # run directly
bun run build          # compile to ./worktree
```
