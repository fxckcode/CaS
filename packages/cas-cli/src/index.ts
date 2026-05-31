#!/usr/bin/env node
import { Command } from 'commander';
import * as goals from './commands/goals.js';
import * as tools from './commands/tools.js';
import * as memory from './commands/memory.js';
import * as health from './commands/health.js';

const pkg = { version: '0.1.0', description: 'CLI as a Service — terminal interface' };

const program = new Command()
  .name('cas')
  .description(pkg.description)
  .version(pkg.version)
  .option('-u, --url <url>', 'CaS API server URL', process.env.CAS_API_URL || 'http://localhost:3000');

// ── goals ──────────────────────────────────────────────
const goalsCmd = program.command('goals').description('Manage goals');

goalsCmd
  .command('list')
  .alias('ls')
  .description('List all goals')
  .action(() => goals.list());

goalsCmd
  .command('get <id>')
  .description('Show goal details')
  .action((id: string) => goals.getById(id));

goalsCmd
  .command('create <description>')
  .alias('new')
  .description('Create a new goal')
  .option('-p, --project <id>', 'Project ID', 'default')
  .option('-m, --mode <mode>', 'Autonomy mode (consultative|semi-autonomous|autonomous)', 'semi-autonomous')
  .action((desc: string, opts: { project: string; mode: string }) =>
    goals.create(desc, opts.project, opts.mode));

goalsCmd
  .command('plan <id>')
  .description('Show the execution plan for a goal')
  .action((id: string) => goals.plan(id));

// ── tools ──────────────────────────────────────────────
program
  .command('tools')
  .alias('tool')
  .description('List available tools')
  .action(() => tools.list());

// ── memory ─────────────────────────────────────────────
program
  .command('memory [query]')
  .alias('mem')
  .description('Search memory items')
  .action((query?: string) => memory.search(query));

// ── health ─────────────────────────────────────────────
program
  .command('health')
  .description('Check server health')
  .action(() => health.check());

program.parse();
