#!/usr/bin/env bun

import { select, input, confirm, checkbox } from "@inquirer/prompts";
import chalk from "chalk";
import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";

async function execGit(args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const error = await new Response(proc.stderr).text();
    throw new Error(error || `Git command failed with exit code ${exitCode}`);
  }
  return output.trim();
}

async function isGitRepo(): Promise<boolean> {
  try {
    await execGit(["rev-parse", "--git-dir"]);
    return true;
  } catch {
    return false;
  }
}

async function getRepoName(): Promise<string> {
  try {
    const remoteUrl = await execGit(["config", "--get", "remote.origin.url"]);
    const match = remoteUrl.match(/\/([^\/]+?)(\.git)?$/);
    if (match?.[1]) return match[1];
  } catch {}

  const toplevel = await execGit(["rev-parse", "--show-toplevel"]);
  return toplevel.split("/").pop() || "repo";
}

async function getRemoteBranches(): Promise<string[]> {
  const output = await execGit(["branch", "-r"]);
  return output
    .split("\n")
    .map((b) => b.trim())
    .filter((b) => b && !b.includes("HEAD"))
    .sort((a, b) => {
      // Prioritize main/master at the top
      if (a === "origin/main") return -1;
      if (b === "origin/main") return 1;
      if (a === "origin/master") return -1;
      if (b === "origin/master") return 1;
      return a.localeCompare(b);
    });
}

async function getDefaultBranch(): Promise<string> {
  try {
    const ref = await execGit(["symbolic-ref", "refs/remotes/origin/HEAD"]);
    return ref.replace("refs/remotes/", "");
  } catch {
    // Fallback: check if origin/main or origin/master exists
    const branches = await getRemoteBranches();
    if (branches.includes("origin/main")) return "origin/main";
    if (branches.includes("origin/master")) return "origin/master";
    return branches[0] || "origin/main";
  }
}

async function listWorktrees(): Promise<{ path: string; branch: string }[]> {
  const output = await execGit(["worktree", "list", "--porcelain"]);
  const worktrees: { path: string; branch: string }[] = [];
  const blocks = output.split("\n\n").filter(Boolean);

  for (const block of blocks) {
    const lines = block.split("\n");
    const pathLine = lines.find((l) => l.startsWith("worktree "));
    const branchLine = lines.find((l) => l.startsWith("branch "));

    if (pathLine && branchLine) {
      const path = pathLine.replace("worktree ", "");
      const branch = branchLine.replace("branch refs/heads/", "");
      // Skip main worktree (not in ~/worktrees)
      if (path.includes("/worktrees/")) {
        worktrees.push({ path, branch });
      }
    }
  }
  return worktrees;
}

async function removeWorktree(path: string): Promise<void> {
  await execGit(["worktree", "remove", path, "--force"]);
}

async function cleanWorktrees(targetBranch?: string) {
  console.log(chalk.bold.blue("\n🧹 Git Worktree Cleaner\n"));

  if (!(await isGitRepo())) {
    console.error(chalk.red("Error: Not in a git repository"));
    process.exit(1);
  }

  const worktrees = await listWorktrees();

  if (worktrees.length === 0) {
    console.log(chalk.yellow("No worktrees to clean"));
    process.exit(0);
  }

  let toRemove: { path: string; branch: string }[] = [];

  if (targetBranch) {
    const found = worktrees.find((w) => w.branch === targetBranch);
    if (!found) {
      console.error(chalk.red(`Worktree for branch "${targetBranch}" not found`));
      console.log(chalk.dim("\nAvailable worktrees:"));
      worktrees.forEach((w) => console.log(`  - ${w.branch}`));
      process.exit(1);
    }
    toRemove = [found];
  } else {
    const selected = await checkbox({
      message: "Select worktrees to remove:",
      choices: worktrees.map((w) => ({
        name: `${w.branch} ${chalk.dim(`(${w.path})`)}`,
        value: w,
      })),
    });

    if (selected.length === 0) {
      console.log(chalk.dim("No worktrees selected"));
      process.exit(0);
    }
    toRemove = selected;
  }

  // Confirm
  console.log(chalk.dim("\nWill remove:"));
  toRemove.forEach((w) => console.log(`  - ${w.branch}`));

  const shouldRemove = await confirm({
    message: `Remove ${toRemove.length} worktree(s)?`,
    default: false,
  });

  if (!shouldRemove) {
    console.log(chalk.dim("Cancelled"));
    process.exit(0);
  }

  // Remove
  for (const w of toRemove) {
    try {
      await removeWorktree(w.path);
      console.log(chalk.green(`✓ Removed ${w.branch}`));
    } catch (e) {
      console.error(chalk.red(`✗ Failed to remove ${w.branch}: ${e}`));
    }
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "clean") {
    await cleanWorktrees(args[1]);
    return;
  }

  console.log(chalk.bold.blue("\n🌳 Git Worktree Helper\n"));

  // Check if in git repo
  if (!(await isGitRepo())) {
    console.error(chalk.red("Error: Not in a git repository"));
    process.exit(1);
  }

  const repoName = await getRepoName();
  console.log(chalk.dim(`Repository: ${repoName}\n`));

  // Fetch latest
  console.log(chalk.dim("Fetching latest from origin..."));
  try {
    await execGit(["fetch", "origin", "--prune"]);
    console.log(chalk.green("✓ Fetched\n"));
  } catch (e) {
    console.log(chalk.yellow("⚠ Could not fetch from origin\n"));
  }

  // Get branches
  const branches = await getRemoteBranches();
  const defaultBranch = await getDefaultBranch();

  if (branches.length === 0) {
    console.error(chalk.red("No remote branches found"));
    process.exit(1);
  }

  // Select base branch
  const baseBranch = await select({
    message: "Select base branch to branch from:",
    choices: branches.map((branch) => ({
      name: branch.replace("origin/", ""),
      value: branch,
      description: branch === defaultBranch ? "(default)" : undefined,
    })),
    default: defaultBranch,
    pageSize: 15,
  });

  // Enter new branch name
  const newBranch = await input({
    message: "New branch name:",
    validate: (value) => {
      if (!value.trim()) return "Branch name cannot be empty";
      if (value.includes(" ")) return "Branch name cannot contain spaces";
      if (!/^[\w\-\/\.]+$/.test(value))
        return "Invalid characters in branch name";
      return true;
    },
  });

  // Build worktree path
  const worktreeBase = join(homedir(), "worktrees");
  const worktreePath = join(worktreeBase, repoName, newBranch);

  // Check if already exists
  if (existsSync(worktreePath)) {
    console.log(chalk.yellow(`\nWorktree already exists at: ${worktreePath}`));
    console.log(chalk.dim("\nTo navigate:\n"));
    console.log(`cd "${worktreePath}"`);
    process.exit(0);
  }

  // Show summary
  console.log(chalk.dim("\n─────────────────────────────"));
  console.log(chalk.dim("Base:   ") + chalk.white(baseBranch));
  console.log(chalk.dim("Branch: ") + chalk.white(newBranch));
  console.log(chalk.dim("Path:   ") + chalk.white(worktreePath));
  console.log(chalk.dim("─────────────────────────────\n"));

  const shouldCreate = await confirm({
    message: "Create worktree?",
    default: true,
  });

  if (!shouldCreate) {
    console.log(chalk.dim("Cancelled"));
    process.exit(0);
  }

  // Create the worktree
  try {
    // Ensure we always branch from origin, never local
    const originBranch = baseBranch.startsWith("origin/")
      ? baseBranch
      : `origin/${baseBranch}`;
    await execGit([
      "worktree",
      "add",
      "-b",
      newBranch,
      worktreePath,
      originBranch,
    ]);
    console.log(chalk.green("\n✓ Worktree created successfully!"));
    console.log(chalk.dim("\nTo navigate:\n"));
    console.log(`cd "${worktreePath}"`)
  } catch (e) {
    console.error(chalk.red(`\nFailed to create worktree: ${e}`));
    process.exit(1);
  }
}

main().catch((e) => {
  if (e.message?.includes("User force closed")) {
    console.log(chalk.dim("\nCancelled"));
    process.exit(0);
  }
  console.error(chalk.red(e.message || e));
  process.exit(1);
});
