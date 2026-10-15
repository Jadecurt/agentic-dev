import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { FileTools } from '../src/tools/file-tools.js';

describe('FileTools Separation of Duties & Security Jailing', () => {
  const root = path.resolve('examples/demo-monorepo');
  const serviceRel = 'services/auth-service';

  it('allows developer agent to edit production code', async () => {
    const devTools = new FileTools({
      worktreeRoot: root,
      allowedRelPath: serviceRel,
      testOnly: false,
    });

    const fileContent = await devTools.readFile({ path: 'src/token.ts' });
    expect(fileContent).toContain('export function generateAccessToken');
  });

  it('forbids tester agent from writing to production source files', async () => {
    const testerTools = new FileTools({
      worktreeRoot: root,
      allowedRelPath: serviceRel,
      testOnly: true,
    });

    const writeRes = await testerTools.writeFile({
      path: 'src/malicious_patch.ts',
      content: 'export const patched = true;',
    });

    expect(writeRes).toContain('Separation of Duties');
    expect(writeRes).toContain('forbidden');
  });

  it('allows tester agent to write to test files', async () => {
    const testerTools = new FileTools({
      worktreeRoot: root,
      allowedRelPath: serviceRel,
      testOnly: true,
    });

    const testFile = 'test/temp_spec.test.ts';
    const writeRes = await testerTools.writeFile({
      path: testFile,
      content: '// test file',
    });

    expect(writeRes).toContain('Successfully wrote');

    // Clean up created test file
    const absPath = path.resolve(root, serviceRel, testFile);
    if (fs.existsSync(absPath)) {
      fs.unlinkSync(absPath);
    }
  });

  it('prevents directory traversal outside worktree', async () => {
    const devTools = new FileTools({
      worktreeRoot: root,
      allowedRelPath: serviceRel,
    });

    await expect(
      devTools.readFile({ path: '../../../../etc/passwd' })
    ).rejects.toThrow('Security Violation');
  });
});
