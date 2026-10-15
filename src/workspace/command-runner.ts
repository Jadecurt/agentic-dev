import { spawn } from 'node:child_process';
import { config } from '../config/env.js';

export interface CommandOptions {
  cwd: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  portOffset?: number;
}

export interface CommandOutput {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

export class CommandRunner {
  static async execute(command: string, args: string[], options: CommandOptions): Promise<CommandOutput> {
    const timeoutMs = options.timeoutMs ?? config.commandTimeoutMs;
    const start = Date.now();

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...options.env,
    };

    if (options.portOffset !== undefined) {
      const basePort = 3000 + options.portOffset * 10;
      env.PORT_OFFSET = String(options.portOffset);
      env.PORT = String(basePort);
    }

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const proc = spawn(command, args, {
        cwd: options.cwd,
        env,
        shell: false,
      });

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
        setTimeout(() => {
          try {
            proc.kill('SIGKILL');
          } catch {
            // ignore
          }
        }, 2000);
      }, timeoutMs);

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          exitCode: code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          timedOut,
          durationMs: Date.now() - start,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          exitCode: 1,
          stdout: stdout.trim(),
          stderr: (stderr + '\n' + err.message).trim(),
          timedOut,
          durationMs: Date.now() - start,
        });
      });
    });
  }

  static async runInShell(cmdLine: string, options: CommandOptions): Promise<CommandOutput> {
    const timeoutMs = options.timeoutMs ?? config.commandTimeoutMs;
    const start = Date.now();

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...options.env,
    };

    if (options.portOffset !== undefined) {
      const basePort = 3000 + options.portOffset * 10;
      env.PORT_OFFSET = String(options.portOffset);
      env.PORT = String(basePort);
    }

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const proc = spawn(cmdLine, {
        cwd: options.cwd,
        env,
        shell: true,
      });

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
        setTimeout(() => {
          try {
            proc.kill('SIGKILL');
          } catch {
            // ignore
          }
        }, 2000);
      }, timeoutMs);

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          exitCode: code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          timedOut,
          durationMs: Date.now() - start,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          exitCode: 1,
          stdout: stdout.trim(),
          stderr: (stderr + '\n' + err.message).trim(),
          timedOut,
          durationMs: Date.now() - start,
        });
      });
    });
  }
}
