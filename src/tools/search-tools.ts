import fs from 'node:fs';
import path from 'node:path';

export interface SearchToolsOptions {
  worktreeRoot: string;
  allowedRelPath: string;
}

export class SearchTools {
  private baseDir: string;

  constructor(options: SearchToolsOptions) {
    this.baseDir = path.resolve(options.worktreeRoot, options.allowedRelPath);
  }

  async grepSearch(args: { query: string; filePattern?: string }): Promise<string> {
    if (!fs.existsSync(this.baseDir)) {
      return `Base directory does not exist: ${this.baseDir}`;
    }

    const matches: string[] = [];
    const query = args.query;
    const pattern = args.filePattern ? new RegExp(args.filePattern) : null;

    const scan = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(full);
        } else if (entry.isFile()) {
          if (pattern && !pattern.test(entry.name)) continue;

          try {
            const content = fs.readFileSync(full, 'utf-8');
            const lines = content.split('\n');
            const rel = path.relative(this.baseDir, full);

            lines.forEach((line, idx) => {
              if (line.includes(query)) {
                matches.push(`${rel}:${idx + 1}: ${line.trim()}`);
              }
            });
          } catch {
            // ignore unreadable files
          }
        }
      }
    };

    scan(this.baseDir);
    return matches.slice(0, 50).join('\n') || `No occurrences of "${query}" found.`;
  }

  async findByName(args: { pattern: string }): Promise<string> {
    if (!fs.existsSync(this.baseDir)) {
      return `Base directory does not exist: ${this.baseDir}`;
    }

    const matches: string[] = [];
    const regex = new RegExp(args.pattern, 'i');

    const scan = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
        const full = path.join(dir, entry.name);
        const rel = path.relative(this.baseDir, full);
        if (regex.test(rel) || regex.test(entry.name)) {
          matches.push(rel);
        }
        if (entry.isDirectory()) {
          scan(full);
        }
      }
    };

    scan(this.baseDir);
    return matches.slice(0, 50).join('\n') || `No files matching pattern "${args.pattern}".`;
  }

  getDeclarations(): any[] {
    return [
      {
        name: 'grep_search',
        description: 'Search for text or identifier occurrences across files in the service',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'String or substring to search for' },
            filePattern: { type: 'string', description: 'Optional regex pattern for filenames' },
          },
          required: ['query'],
        },
      },
      {
        name: 'find_by_name',
        description: 'Find files matching a filename or path regex pattern',
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Pattern to search for (e.g. "auth" or "test")' },
          },
          required: ['pattern'],
        },
      },
    ];
  }
}
