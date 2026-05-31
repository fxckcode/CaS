import chalk from 'chalk';
import { get, post } from '../client.js';

interface Goal {
  id: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface Plan {
  id: string;
  goalId: string;
  steps: Array<{
    id: string;
    description: string;
    toolId: string;
    status: string;
    dependencies: string[];
  }>;
  reasoning: string;
}

/** Resolve a partial or full goal ID to a full Goal object. */
async function resolveGoal(idOrPartial: string): Promise<Goal | undefined> {
  // Try exact match first
  try {
    return await get<Goal>(`/goals/${idOrPartial}`);
  } catch {
    // Not found with full ID — try partial match
  }

  const goals = await get<Goal[]>('/goals');
  const match = goals.find(
    (g) => g.id.startsWith(idOrPartial) || g.id === idOrPartial,
  );
  return match;
}

function statusColor(s: string): string {
  switch (s) {
    case 'COMPLETED': return chalk.green(s.replace(/_/g, ' '));
    case 'FAILED': return chalk.red(s.replace(/_/g, ' '));
    case 'PLANNING':
    case 'IN_PROGRESS': return chalk.cyan(s.replace(/_/g, ' '));
    case 'AWAITING_APPROVAL': return chalk.yellow(s.replace(/_/g, ' '));
    case 'APPROVED': return chalk.blue(s.replace(/_/g, ' '));
    case 'CANCELLED': return chalk.gray(s.replace(/_/g, ' '));
    default: return chalk.dim(s.replace(/_/g, ' '));
  }
}

export async function list(): Promise<void> {
  const goals = await get<Goal[]>('/goals');
  if (goals.length === 0) {
    console.log(chalk.dim('  No goals yet. Create one with: cas goals create <description>'));
    return;
  }
  for (const g of goals) {
    const shortId = g.id.slice(0, 8);
    const status = statusColor(g.status);
    const time = chalk.dim(new Date(g.createdAt).toLocaleString());
    console.log(`  ${shortId}  ${status}  ${chalk.white(g.description)}  ${time}`);
  }
  console.log(chalk.dim(`\n  ${goals.length} goal(s) total`));
}

export async function getById(id: string): Promise<void> {
  const g = await resolveGoal(id);
  if (!g) { console.error(chalk.red(`  Goal "${id}" not found`)); process.exit(1); }
  console.log('');
  console.log(`  ${chalk.bold('ID:')}          ${chalk.dim(g.id)}`);
  console.log(`  ${chalk.bold('Description:')}  ${chalk.white(g.description)}`);
  console.log(`  ${chalk.bold('Status:')}       ${statusColor(g.status)}`);
  console.log(`  ${chalk.bold('Created:')}      ${chalk.dim(new Date(g.createdAt).toLocaleString())}`);
  console.log(`  ${chalk.bold('Updated:')}      ${chalk.dim(new Date(g.updatedAt).toLocaleString())}`);
}

export async function create(description: string, projectId?: string, mode?: string): Promise<void> {
  const body: Record<string, unknown> = { goal: description };
  body.projectId = projectId || 'default';
  if (mode) body.autonomyMode = mode;

  const g = await post<Goal>('/goals', body);
  console.log(chalk.green(`\n  ✓ Goal created`));
  console.log(`  ${chalk.bold('ID:')}          ${chalk.dim(g.id)}`);
  console.log(`  ${chalk.bold('Description:')}  ${chalk.white(g.description)}`);
  console.log(`  ${chalk.bold('Status:')}       ${statusColor(g.status)}`);
}

export async function plan(goalId: string): Promise<void> {
  const g = await resolveGoal(goalId);
  if (!g) { console.error(chalk.red(`  Goal "${goalId}" not found`)); process.exit(1); }
  const plan = await get<Plan>(`/goals/${g.id}/plan`);
  console.log('');
  if (plan.reasoning) {
    console.log(`  ${chalk.bold('Reasoning:')} ${chalk.dim(plan.reasoning)}`);
    console.log('');
  }
  console.log(`  ${chalk.bold('Steps')} (${plan.steps.length}):`);
  console.log('');
  for (let i = 0; i < plan.steps.length; i++) {
    const s = plan.steps[i];
    const tool = chalk.cyan(s.toolId);
    const deps = s.dependencies.length ? chalk.dim(`  [depends: ${s.dependencies.join(', ')}]`) : '';
    console.log(`  ${i + 1}. ${chalk.white(s.description)}`);
    console.log(`     ${tool}${deps}`);
  }
}
