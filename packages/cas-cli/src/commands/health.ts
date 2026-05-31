import chalk from 'chalk';
import { get } from '../client.js';

export async function check(): Promise<void> {
  try {
    const data = await get<{ status: string; timestamp: number }>('/health');
    const ok = data.status === 'ok';
    console.log(ok
      ? chalk.green(`\n  ✓ CaS server is ${chalk.bold('healthy')}`)
      : chalk.yellow(`\n  ⚠ CaS server status: ${data.status}`));
    console.log(chalk.dim(`    ${new Date(data.timestamp).toLocaleString()}`));
  } catch (err) {
    console.error(chalk.red(`\n  ✗ CaS server is ${chalk.bold('unreachable')}`));
    console.error(chalk.dim(`    ${(err as Error).message}`));
    process.exit(1);
  }
}
