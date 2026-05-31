import chalk from 'chalk';
import { get } from '../client.js';

interface Tool {
  id: string;
  name: string;
  version: string;
  domain: string;
  runner: string;
  description: string;
}

export async function list(): Promise<void> {
  const data = await get<{ tools: Tool[]; total: number }>('/tools');
  if (data.tools.length === 0) {
    console.log(chalk.dim('  No tools registered.'));
    return;
  }
  console.log('');
  for (const t of data.tools) {
    const name = chalk.cyan(t.name);
    const domain = chalk.dim(`(${t.domain})`);
    const runner = chalk.gray(`[${t.runner}]`);
    console.log(`  ${name}  ${domain}  ${runner}`);
    if (t.description) {
      console.log(`  ${chalk.dim(t.description)}`);
    }
    console.log('');
  }
  console.log(chalk.dim(`  ${data.total} tool(s) total`));
}
