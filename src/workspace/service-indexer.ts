import fs from 'node:fs';
import path from 'node:path';
import { RepoTopology, ServiceMetadata } from '../types/plan.schema.js';

const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.worktrees',
  '.turbo',
  '.next',
  '.cache',
  'coverage',
]);

export class ServiceIndexer {
  static async indexWorkspace(rootPath: string): Promise<RepoTopology> {
    const absRoot = path.resolve(rootPath);
    if (!fs.existsSync(absRoot)) {
      throw new Error(`Workspace path does not exist: ${absRoot}`);
    }

    const services: ServiceMetadata[] = [];
    const packages: ServiceMetadata[] = [];
    let isMonorepo = false;

    // Check for services/ or packages/ or apps/
    const serviceDirs = ['services', 'packages', 'apps'];
    for (const sub of serviceDirs) {
      const dirPath = path.join(absRoot, sub);
      if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        isMonorepo = true;
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !IGNORED_DIRS.has(entry.name)) {
            const serviceAbsPath = path.join(dirPath, entry.name);
            const metadata = this.inspectDirectory(serviceAbsPath, absRoot, `${sub}/${entry.name}`);
            if (sub === 'packages') {
              packages.push(metadata);
            } else {
              services.push(metadata);
            }
          }
        }
      }
    }

    // If no services or packages found, inspect the root directory as a standalone service
    if (services.length === 0 && packages.length === 0) {
      const rootMeta = this.inspectDirectory(absRoot, absRoot, '.');
      services.push(rootMeta);
    }

    // Identify root shared files
    const rootFiles = fs.readdirSync(absRoot, { withFileTypes: true })
      .filter((d) => d.isFile() && !d.name.startsWith('.'))
      .map((d) => d.name);

    return {
      rootPath: absRoot,
      isMonorepo,
      services,
      packages,
      sharedFiles: rootFiles,
    };
  }

  private static inspectDirectory(absPath: string, rootPath: string, relPath: string): ServiceMetadata {
    const pkgJsonPath = path.join(absPath, 'package.json');
    let packageJson: any = undefined;
    let testScript: string | undefined;
    let buildScript: string | undefined;
    let typecheckScript: string | undefined;

    if (fs.existsSync(pkgJsonPath)) {
      try {
        const raw = fs.readFileSync(pkgJsonPath, 'utf-8');
        packageJson = JSON.parse(raw);
        if (packageJson.scripts) {
          testScript = packageJson.scripts.test;
          buildScript = packageJson.scripts.build;
          typecheckScript = packageJson.scripts.typecheck;
        }
      } catch (err) {
        // ignore parse errors
      }
    }

    const fileTree = this.collectFiles(absPath, absPath);
    const hasTests = fileTree.some((f) =>
      f.includes('.test.') || f.includes('.spec.') || f.startsWith('test/') || f.startsWith('tests/')
    );

    const commonEntrypoints = [
      'src/index.ts',
      'src/main.ts',
      'src/app.ts',
      'src/server.ts',
      'src/routes.ts',
      'index.ts',
      'main.ts',
    ];
    const entrypoints = commonEntrypoints.filter((ep) => fs.existsSync(path.join(absPath, ep)));

    const id = path.basename(absPath);
    const name = packageJson?.name || id;

    return {
      id,
      name,
      relPath,
      absPath,
      packageJson,
      hasTests,
      testScript,
      buildScript,
      typecheckScript,
      entrypoints,
      fileTree: fileTree.slice(0, 100), // Cap for prompt size safety
    };
  }

  private static collectFiles(dir: string, baseDir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = this.collectFiles(fullPath, baseDir);
        results.push(...subFiles);
      } else if (entry.isFile()) {
        results.push(path.relative(baseDir, fullPath));
      }
    }

    return results;
  }
}
