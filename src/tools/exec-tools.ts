import fs from 'node:fs';
import path from 'node:path';
import { CommandRunner } from '../workspace/command-runner.js';

export interface ExecToolsOptions {
  worktreeRoot: string;
  allowedRelPath: string;
  portOffset?: number;
}

export class ExecTools {
  private worktreeRoot: string;
  private serviceDir: string;
  private portOffset: number;

  constructor(options: ExecToolsOptions) {
    this.worktreeRoot = path.resolve(options.worktreeRoot);
    this.serviceDir = path.resolve(this.worktreeRoot, options.allowedRelPath);
    this.portOffset = options.portOffset ?? 0;
  }

  async runTypecheck(): Promise<string> {
    const pkgPath = path.join(this.serviceDir, 'package.json');
    let cmd = 'npx tsc --noEmit';
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.scripts?.typecheck) {
          cmd = 'npm run typecheck';
        }
      } catch {
        // ignore
      }
    }

    const res = await CommandRunner.runInShell(cmd, {
      cwd: this.serviceDir,
      portOffset: this.portOffset,
    });

    if (res.exitCode === 0) {
      return `Typecheck passed cleanly (0 errors).\n${res.stdout}`;
    }
    return `Typecheck failed with exit code ${res.exitCode}:\n${res.stdout}\n${res.stderr}`;
  }

  async runBuild(): Promise<string> {
    const pkgPath = path.join(this.serviceDir, 'package.json');
    let cmd = 'npm run build';
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (!pkg.scripts?.build) {
          cmd = 'npx tsc';
        }
      } catch {
        // ignore
      }
    }

    const res = await CommandRunner.runInShell(cmd, {
      cwd: this.serviceDir,
      portOffset: this.portOffset,
    });

    if (res.exitCode === 0) {
      return `Build succeeded:\n${res.stdout}`;
    }
    return `Build failed with exit code ${res.exitCode}:\n${res.stdout}\n${res.stderr}`;
  }

  async runTests(args?: { testFilter?: string }): Promise<string> {
    const pkgPath = path.join(this.serviceDir, 'package.json');
    let cmd = 'npm test';
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.scripts?.test) {
          cmd = args?.testFilter ? `npm test -- ${args.testFilter}` : 'npm test';
        } else {
          cmd = args?.testFilter ? `npx vitest run ${args.testFilter}` : 'npx vitest run';
        }
      } catch {
        // ignore
      }
    }

    const res = await CommandRunner.runInShell(cmd, {
      cwd: this.serviceDir,
      portOffset: this.portOffset,
    });

    const output = `${res.stdout}\n${res.stderr}`.trim();
    if (res.exitCode === 0) {
      return `Test Suite PASSED:\n${output}`;
    }
    return `Test Suite FAILED (exit code ${res.exitCode}):\n${output}`;
  }

  async inspectGitDiff(): Promise<string> {
    const res = await CommandRunner.runInShell('git status --short && git diff HEAD', {
      cwd: this.worktreeRoot,
    });
    return res.stdout || res.stderr || 'No git changes detected in this worktree.';
  }

  getDeclarations(): any[] {
    return [
      {
        name: 'run_typecheck',
        description: 'Run TypeScript compiler typechecking in the service directory',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'run_build',
        description: 'Execute build command in the service directory',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'run_tests',
        description: 'Execute the test suite in the service directory with optional filter',
        parameters: {
          type: 'object',
          properties: {
            testFilter: { type: 'string', description: 'Optional name pattern to filter test execution' },
          },
        },
      },
      {
        name: 'inspect_git_diff',
        description: 'Inspect current uncommitted git changes and status in this worktree',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }
}
