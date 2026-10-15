import fs from 'node:fs';
import path from 'node:path';
import { CommandRunner } from './command-runner.js';

export interface WorktreeInfo {
  serviceId: string;
  branchName: string;
  worktreePath: string;
  serviceRelPath: string;
  isGitBacked: boolean;
}

export class WorktreeManager {
  private repoRoot: string;
  private isGit: boolean = false;
  private originalBranch: string = 'main';
  private activeWorktrees: Map<string, WorktreeInfo> = new Map();

  constructor(repoRoot: string) {
    this.repoRoot = path.resolve(repoRoot);
  }

  async initialize(): Promise<void> {
    const gitCheck = await CommandRunner.runInShell('git rev-parse --is-inside-work-tree', {
      cwd: this.repoRoot,
    });
    this.isGit = gitCheck.exitCode === 0 && gitCheck.stdout.trim() === 'true';

    if (!this.isGit) {
      // Initialize a local git repository if not already one
      await CommandRunner.runInShell('git init', { cwd: this.repoRoot });
      await CommandRunner.runInShell('git config user.name "Agentic Dev"', { cwd: this.repoRoot });
      await CommandRunner.runInShell('git config user.email "agentic-dev@internal.local"', { cwd: this.repoRoot });
      await CommandRunner.runInShell('git add -A', { cwd: this.repoRoot });
      await CommandRunner.runInShell('git commit -m "chore: initial commit before agentic run"', { cwd: this.repoRoot });
      this.isGit = true;
    }
  }

  async setupIntegrationBranch(runId: string): Promise<string> {
    const branchName = `agent-run/${runId}/integration`;
    if (this.isGit) {
      // Check current HEAD
      const currentHead = await CommandRunner.runInShell('git rev-parse --abbrev-ref HEAD', {
        cwd: this.repoRoot,
      });
      this.originalBranch = currentHead.stdout.trim() || 'main';

      await CommandRunner.runInShell(`git branch -f ${branchName} ${this.originalBranch}`, {
        cwd: this.repoRoot,
      });
    }
    return branchName;
  }

  async createServiceWorktree(runId: string, serviceId: string, serviceRelPath: string): Promise<WorktreeInfo> {
    const worktreeRelPath = path.join('.worktrees', runId, serviceId);
    const worktreeAbsPath = path.join(this.repoRoot, worktreeRelPath);
    const branchName = `agent-run/${runId}/${serviceId}`;
    const baseBranch = `agent-run/${runId}/integration`;

    // Ensure parent dir exists
    fs.mkdirSync(path.dirname(worktreeAbsPath), { recursive: true });

    if (fs.existsSync(worktreeAbsPath)) {
      try {
        fs.rmSync(worktreeAbsPath, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }

    let isGitBacked = false;

    if (this.isGit) {
      // Clean up previous branch/worktree if exists
      await CommandRunner.runInShell(`git worktree remove --force "${worktreeAbsPath}"`, {
        cwd: this.repoRoot,
      });
      await CommandRunner.runInShell(`git branch -D ${branchName}`, {
        cwd: this.repoRoot,
      });

      // Add worktree from baseBranch
      const addRes = await CommandRunner.runInShell(
        `git worktree add -B ${branchName} "${worktreeAbsPath}" ${baseBranch}`,
        { cwd: this.repoRoot }
      );

      if (addRes.exitCode === 0) {
        isGitBacked = true;
      } else {
        console.warn(`Git worktree add failed, falling back to copy sandbox: ${addRes.stderr}`);
      }
    }

    if (!isGitBacked) {
      // Copy directory sandbox fallback
      fs.mkdirSync(worktreeAbsPath, { recursive: true });
      const entries = fs.readdirSync(this.repoRoot);
      for (const entry of entries) {
        if (entry === '.git' || entry === '.worktrees' || entry === 'node_modules') continue;
        const src = path.join(this.repoRoot, entry);
        const dest = path.join(worktreeAbsPath, entry);
        fs.cpSync(src, dest, { recursive: true });
      }
    }

    const info: WorktreeInfo = {
      serviceId,
      branchName,
      worktreePath: worktreeAbsPath,
      serviceRelPath,
      isGitBacked,
    };

    this.activeWorktrees.set(serviceId, info);
    return info;
  }

  async commitWorktree(serviceId: string, message: string): Promise<boolean> {
    const info = this.activeWorktrees.get(serviceId);
    if (!info) return false;

    if (info.isGitBacked) {
      await CommandRunner.runInShell('git add -A', { cwd: info.worktreePath });
      const commitRes = await CommandRunner.runInShell(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
        cwd: info.worktreePath,
      });
      return commitRes.exitCode === 0;
    }
    return true;
  }

  async inspectDiff(serviceId: string): Promise<string> {
    const info = this.activeWorktrees.get(serviceId);
    if (!info) return '';

    if (info.isGitBacked) {
      const diffRes = await CommandRunner.runInShell('git status --short && git diff HEAD', {
        cwd: info.worktreePath,
      });
      return diffRes.stdout || diffRes.stderr || 'No changes detected.';
    }

    return 'Diff not available in non-git fallback.';
  }

  async mergeServiceIntoIntegration(runId: string, serviceId: string): Promise<{ success: boolean; output: string }> {
    const info = this.activeWorktrees.get(serviceId);
    if (!info || !info.isGitBacked) {
      return { success: true, output: 'Fallback: no git merge required' };
    }

    const integrationBranch = `agent-run/${runId}/integration`;

    // Checkout integration branch in main repo or run merge
    await CommandRunner.runInShell(`git checkout ${integrationBranch}`, { cwd: this.repoRoot });
    const mergeRes = await CommandRunner.runInShell(
      `git merge ${info.branchName} -m "chore(merge): integrate ${serviceId} changes from run ${runId}"`,
      { cwd: this.repoRoot }
    );

    return {
      success: mergeRes.exitCode === 0,
      output: mergeRes.stdout + '\n' + mergeRes.stderr,
    };
  }

  async cleanup(runId: string): Promise<void> {
    for (const [serviceId, info] of this.activeWorktrees.entries()) {
      if (info.isGitBacked) {
        await CommandRunner.runInShell(`git worktree remove --force "${info.worktreePath}"`, {
          cwd: this.repoRoot,
        });
      }
    }
    await CommandRunner.runInShell('git worktree prune', { cwd: this.repoRoot });

    if (this.isGit && this.originalBranch) {
      await CommandRunner.runInShell(`git checkout ${this.originalBranch}`, { cwd: this.repoRoot });
    }

    const runWorktreesDir = path.join(this.repoRoot, '.worktrees', runId);
    if (fs.existsSync(runWorktreesDir)) {
      try {
        fs.rmSync(runWorktreesDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    this.activeWorktrees.clear();
  }
}
