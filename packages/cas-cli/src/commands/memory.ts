import chalk from 'chalk';
import { get } from '../client.js';

interface MemoryItem {
  id: string;
  summary: string;
  type: string;
  source: string;
  content?: string;
  tags: string[];
  createdAt: string;
}

interface MemoryResponse {
  items: MemoryItem[];
  total: number;
}

export async function search(query?: string): Promise<void> {
  let url = '/memory?limit=15';
  if (query) url += `&keywords=${encodeURIComponent(query)}`;

  const data = await get<MemoryResponse>(url);
  if (data.items.length === 0) {
    console.log(chalk.dim(query
      ? `  No memory items matching "${query}".`
      : '  No memory items yet.'));
    return;
  }
  console.log('');
  for (const m of data.items) {
    const typeBadge = typeColor(m.type);
    console.log(`  ${typeBadge} ${chalk.white(m.summary)}`);
    const meta = chalk.dim(`${m.source} · ${new Date(m.createdAt).toLocaleString()}`);
    console.log(`           ${meta}`);
    if (m.tags.length) {
      console.log(`           ${chalk.dim(`tags: ${m.tags.join(', ')}`)}`);
    }
    console.log('');
  }
  console.log(chalk.dim(`  ${data.total} item(s) total`));
}

function typeColor(t: string): string {
  switch (t) {
    case 'decision': return chalk.bgBlue.white(' DECISION ');
    case 'artifact': return chalk.bgYellow.black(' ARTIFACT ');
    case 'convention': return chalk.bgGreen.black(' CONVENTION ');
    default: return chalk.dim(` ${t.toUpperCase()} `);
  }
}
