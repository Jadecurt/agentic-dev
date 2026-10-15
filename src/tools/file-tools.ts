import fs from 'node:fs';
import path from 'node:path';

export interface FileToolsOptions {
  worktreeRoot: string;
  allowedRelPath: string; // e.g. "services/auth-service"
  testOnly?: boolean; // if true, restricts write/edit to test files
}

export class FileTools {
  private worktreeRoot: string;
  private allowedRelPath: string;
  private allowedAbsPath: string;
  private testOnly: boolean;

  constructor(options: FileToolsOptions) {
    this.worktreeRoot = path.resolve(options.worktreeRoot);
    this.allowedRelPath = options.allowedRelPath;
    this.allowedAbsPath = path.resolve(this.worktreeRoot, options.allowedRelPath);
    this.testOnly = !!options.testOnly;
  }

  private resolveSafePath(filePath: string): string {
    // filePath can be relative to service, relative to worktree, or absolute within worktree
    let resolved = path.resolve(this.allowedAbsPath, filePath);
    if (!resolved.startsWith(this.worktreeRoot)) {
      // try resolving against worktree root
      resolved = path.resolve(this.worktreeRoot, filePath);
    }

    if (!resolved.startsWith(this.worktreeRoot)) {
      throw new Error(`Security Violation: Path '${filePath}' is outside the sandbox worktree root '${this.worktreeRoot}'`);
    }

    return resolved;
  }

  private isTestFile(absPath: string): boolean {
    const base = path.basename(absPath).toLowerCase();
    const rel = path.relative(this.worktreeRoot, absPath).toLowerCase();
    return (
      base.includes('.test.') ||
      base.includes('.spec.') ||
      rel.includes('/test/') ||
      rel.includes('/tests/') ||
      rel.includes('/__tests__/')
    );
  }

  async readFile(args: { path: string; startLine?: number; endLine?: number }): Promise<string> {
    const absPath = this.resolveSafePath(args.path);
    if (!fs.existsSync(absPath)) {
      return `Error: File not found: ${args.path}`;
    }

    const content = fs.readFileSync(absPath, 'utf-8');
    const lines = content.split('\n');

    if (args.startLine !== undefined || args.endLine !== undefined) {
      const start = Math.max(1, args.startLine ?? 1);
      const end = Math.min(lines.length, args.endLine ?? lines.length);
      const slice = lines.slice(start - 1, end);
      return slice.map((line, idx) => `${start + idx}: ${line}`).join('\n');
    }

    return lines.map((line, idx) => `${idx + 1}: ${line}`).join('\n');
  }

  async writeFile(args: { path: string; content: string }): Promise<string> {
    const absPath = this.resolveSafePath(args.path);

    if (this.testOnly && !this.isTestFile(absPath)) {
      return `Error (Separation of Duties): Tester agents are restricted to writing test files (*.test.ts, *.spec.ts, test/**). Modification of production source '${args.path}' is forbidden.`;
    }

    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, args.content, 'utf-8');
    return `Successfully wrote ${args.content.length} characters to ${args.path}`;
  }

  async editFile(args: { path: string; targetText: string; replacementText: string }): Promise<string> {
    const absPath = this.resolveSafePath(args.path);

    if (this.testOnly && !this.isTestFile(absPath)) {
      return `Error (Separation of Duties): Tester agents are restricted to editing test files (*.test.ts, *.spec.ts, test/**). Modification of production source '${args.path}' is forbidden.`;
    }

    if (!fs.existsSync(absPath)) {
      return `Error: File not found: ${args.path}`;
    }

    const content = fs.readFileSync(absPath, 'utf-8');
    if (!content.includes(args.targetText)) {
      return `Error: targetText not found in ${args.path}. Please read the file first to ensure exact line matching.`;
    }

    const updated = content.replace(args.targetText, args.replacementText);
    fs.writeFileSync(absPath, updated, 'utf-8');
    return `Successfully updated ${args.path}`;
  }

  async listFiles(args: { subDir?: string }): Promise<string> {
    const targetDir = args.subDir
      ? this.resolveSafePath(args.subDir)
      : this.allowedAbsPath;

    if (!fs.existsSync(targetDir)) {
      return `Directory does not exist: ${args.subDir || this.allowedRelPath}`;
    }

    const files: string[] = [];
    const scan = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(full);
        } else {
          files.push(path.relative(this.allowedAbsPath, full));
        }
      }
    };

    scan(targetDir);
    return files.slice(0, 150).join('\n') || '(Empty directory)';
  }

  getDeclarations(): any[] {
    return [
      {
        name: 'read_file',
        description: 'Read contents of a file within the service directory with optional line numbers',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path to file' },
            startLine: { type: 'number', description: 'Optional 1-based start line' },
            endLine: { type: 'number', description: 'Optional 1-based end line' },
          },
          required: ['path'],
        },
      },
      {
        name: 'write_file',
        description: 'Write or overwrite a file with given content within the service directory',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path to file' },
            content: { type: 'string', description: 'Full file content to write' },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'edit_file',
        description: 'Replace exact targetText in a file with replacementText',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path to file' },
            targetText: { type: 'string', description: 'Exact string to find and replace' },
            replacementText: { type: 'string', description: 'Replacement string' },
          },
          required: ['path', 'targetText', 'replacementText'],
        },
      },
      {
        name: 'list_files',
        description: 'List all source files in the service directory or subfolder',
        parameters: {
          type: 'object',
          properties: {
            subDir: { type: 'string', description: 'Optional subdirectory to inspect' },
          },
        },
      },
    ];
  }
}
