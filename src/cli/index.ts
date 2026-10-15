#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'node:path';
import { Orchestrator } from '../orchestrator/orchestrator.js';
import { ServiceIndexer } from '../workspace/service-indexer.js';
import { globalEventBus } from '../orchestrator/event-bus.js';
import { startServer } from '../server/app.js';
import { config } from '../config/env.js';

const program = new Command();

program
  .name('agentic-dev')
  .description('Autonomous multi-service software engineering orchestrator powered by Gemini and Git worktrees')
  .version('1.0.0');

program
  .command('run')
  .description('Run an autonomous engineering workflow for a prompt across monorepo services')
  .argument('<prompt>', 'The feature, bugfix, or refactor request')
  .option('-r, --repo <path>', 'Path to target monorepo/repository', process.cwd())
  .option('--auto-approve', 'Automatically approve generated execution plan', true)
  .action(async (userPrompt: string, options: { repo: string; autoApprove: boolean }) => {
    const targetRepo = path.resolve(options.repo);
    console.log(chalk.bold.cyan('\n🤖 Agentic Multi-Service Developer Orchestrator'));
    console.log(chalk.dim(`Repository: ${targetRepo}`));
    console.log(chalk.dim(`Prompt: "${userPrompt}"\n`));

    const spinner = ora('Initializing orchestrator...').start();

    // Subscribe to real-time events for CLI terminal output
    globalEventBus.subscribe((event) => {
      switch (event.type) {
        case 'INDEX_COMPLETED': {
          spinner.succeed(chalk.green(`Indexed repository: found ${event.topology.services.length} service(s), ${event.topology.packages.length} package(s)`));
          for (const svc of event.topology.services) {
            console.log(chalk.gray(`  • Service: ${svc.id} (${svc.relPath}) [tests: ${svc.hasTests ? 'yes' : 'no'}]`));
          }
          spinner.start(chalk.blue('Generating architectural execution plan with Gemini...'));
          break;
        }

        case 'PLAN_GENERATED': {
          spinner.succeed(chalk.green('Architectural Execution Plan Generated'));
          console.log(chalk.bold.yellow('\n--- Architectural Notes ---'));
          console.log(chalk.white(event.plan.architecturalNotes));

          if (event.plan.sharedContracts.length > 0) {
            console.log(chalk.bold.yellow('\n--- Shared Contracts ---'));
            for (const c of event.plan.sharedContracts) {
              console.log(chalk.magenta(`  [Contract] ${c.contractName} (${c.producerService} ➔ ${c.consumerServices.join(', ')})`));
              console.log(chalk.dim(`  ${c.description}`));
            }
          }

          console.log(chalk.bold.yellow('\n--- Affected Services ---'));
          for (const s of event.plan.affectedServices) {
            console.log(chalk.cyan(`  • [Wave ${s.executionWave}] ${s.serviceId}: ${s.impactReason}`));
          }
          console.log('');
          spinner.start(chalk.blue('Spawning isolated ServicePods...'));
          break;
        }

        case 'POD_INITIALIZED': {
          console.log(chalk.blue(`[Pod: ${event.serviceId}] Provisioned isolated worktree (Wave ${event.executionWave})`));
          break;
        }

        case 'POD_STATUS_CHANGED': {
          const color =
            event.status === 'PASSED' ? chalk.green :
            event.status === 'FAILED' ? chalk.red :
            event.status === 'TESTING' ? chalk.yellow : chalk.cyan;
          console.log(color(`[Pod: ${event.serviceId}] Status: ${event.status} (Iteration ${event.iteration}) ${event.message ? '- ' + event.message : ''}`));
          break;
        }

        case 'TOOL_CALLED': {
          console.log(chalk.dim(`  ⚡ [${event.serviceId || 'root'}:${event.agentRole}] tool: ${event.toolCall.name}(${JSON.stringify(event.toolCall.args).slice(0, 70)}...)`));
          break;
        }

        case 'HANDOFF_PRODUCED': {
          console.log(chalk.greenBright(`  📝 [${event.serviceId}] Developer Handoff (Iter ${event.iteration}): ${event.handoff.summary}`));
          if (event.handoff.filesChanged.length > 0) {
            console.log(chalk.gray(`     Files: ${event.handoff.filesChanged.join(', ')}`));
          }
          break;
        }

        case 'TEST_VERDICT': {
          const v = event.verdict;
          const tag = v.status === 'PASSED' ? chalk.bgGreen.black(' PASSED ') : chalk.bgRed.white(' FAILED ');
          console.log(`  🧪 [${event.serviceId}] Test Verdict: ${tag} (${v.passedCount}/${v.testCount} tests passed)`);
          console.log(chalk.dim(`     Summary: ${v.summary}`));
          if (v.failures.length > 0) {
            for (const f of v.failures) {
              console.log(chalk.red(`     ✗ ${f.testName}: ${f.error}`));
            }
          }
          break;
        }

        case 'INTEGRATION_MERGED': {
          console.log(chalk.green.bold(`\n🔀 Unified Integration: Merged ${event.mergedBranches.length} branch(es) into ${event.integrationBranch}`));
          break;
        }

        case 'RUN_COMPLETED': {
          if (event.success) {
            spinner.succeed(chalk.green.bold(`\n🎉 Orchestration Completed Successfully!\n${event.summary}\n`));
          } else {
            spinner.fail(chalk.red.bold(`\n❌ Orchestration Ended with Failures:\n${event.summary}\n`));
          }
          break;
        }

        case 'RUN_ERROR': {
          spinner.fail(chalk.red.bold(`\n❌ Orchestrator Error: ${event.error}\n`));
          break;
        }
      }
    });

    const orchestrator = new Orchestrator();
    const result = await orchestrator.run({
      userPrompt,
      repoPath: targetRepo,
      autoApprove: options.autoApprove,
    });

    if (!result.success) {
      process.exit(1);
    }
  });

program
  .command('serve')
  .description('Start the Fastify HTTP + WebSocket real-time dashboard server')
  .option('-p, --port <port>', 'Port number to listen on', String(config.port))
  .option('-h, --host <host>', 'Host address to bind to', config.host)
  .action(async (options: { port: string; host: string }) => {
    const port = parseInt(options.port, 10);
    console.log(chalk.bold.cyan('Starting Agentic Dev Dashboard Server...'));
    await startServer(port, options.host);
  });

program
  .command('index')
  .description('Inspect and display the topology of a monorepo')
  .option('-r, --repo <path>', 'Path to monorepo', process.cwd())
  .action(async (options: { repo: string }) => {
    const targetRepo = path.resolve(options.repo);
    console.log(chalk.cyan(`Scanning repository at ${targetRepo}...`));
    const topology = await ServiceIndexer.indexWorkspace(targetRepo);
    console.log(chalk.bold(`\nMonorepo: ${topology.isMonorepo ? 'Yes' : 'No'}`));
    console.log(chalk.bold(`Services found: ${topology.services.length}`));
    for (const s of topology.services) {
      console.log(chalk.green(`  • ${s.id} (${s.relPath})`));
      console.log(chalk.gray(`    Scripts: ${Object.keys(s.packageJson?.scripts || {}).join(', ') || 'none'}`));
      console.log(chalk.gray(`    Has tests: ${s.hasTests}`));
      console.log(chalk.gray(`    Files: ${s.fileTree.length}`));
    }
    if (topology.packages.length > 0) {
      console.log(chalk.bold(`\nShared Packages found: ${topology.packages.length}`));
      for (const p of topology.packages) {
        console.log(chalk.yellow(`  • ${p.name} (${p.relPath})`));
      }
    }
  });

program.parse(process.argv);
