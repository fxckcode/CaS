import { Injectable } from '@nestjs/common';
import { ToolDescriptor, RunnerType, ToolParameter, ToolSecurity } from '../shared/types';

@Injectable()
export class ToolsRegistryService {
  private readonly tools: Map<string, ToolDescriptor> = new Map();

  constructor() {
    this.seedTools();
  }

  registerTool(descriptor: ToolDescriptor): void {
    const key = `${descriptor.id}@${descriptor.version}`;
    this.tools.set(key, descriptor);
  }

  getTools(domain?: string): ToolDescriptor[] {
    const all = Array.from(this.tools.values());
    if (domain) {
      return all.filter((t) => t.domain === domain);
    }
    return all;
  }

  getTool(id: string, version?: string): ToolDescriptor | undefined {
    if (version) {
      return this.tools.get(`${id}@${version}`);
    }
    // Return the latest version if no version specified
    const candidates = Array.from(this.tools.entries())
      .filter(([key]) => key.startsWith(`${id}@`))
      .sort(([a], [b]) => b.localeCompare(a));
    if (candidates.length > 0) {
      return candidates[0][1];
    }
    return undefined;
  }

  getToolsByRunner(runner: RunnerType): ToolDescriptor[] {
    return Array.from(this.tools.values()).filter((t) => t.runner === runner);
  }

  private seedTools(): void {
    const tools: ToolDescriptor[] = [
      new ToolDescriptor(
        'run_sql_query',
        'Run SQL Query',
        '1.0.0',
        'finance',
        'data' as RunnerType,
        'Execute a SQL query against a database',
        [
          new ToolParameter('query', 'string', true, 'SQL query to execute'),
          new ToolParameter('database', 'string', true, 'Target database name'),
        ],
        new ToolSecurity('outbound-only', undefined, undefined, 60),
      ),
      new ToolDescriptor(
        'kubectl_apply',
        'Kubectl Apply',
        '1.0.0',
        'devops',
        'shell' as RunnerType,
        'Apply a Kubernetes manifest',
        [
          new ToolParameter('manifest', 'string', true, 'YAML/JSON manifest content'),
          new ToolParameter('namespace', 'string', false, 'Target namespace'),
        ],
        new ToolSecurity('outbound-only', undefined, undefined, 120),
      ),
      new ToolDescriptor(
        'terraform_plan',
        'Terraform Plan',
        '1.0.0',
        'devops',
        'shell' as RunnerType,
        'Generate and show a Terraform execution plan',
        [
          new ToolParameter('directory', 'string', true, 'Terraform working directory'),
          new ToolParameter('variables', 'object', false, 'Terraform variables'),
        ],
        new ToolSecurity('outbound-only', undefined, undefined, 180),
      ),
      new ToolDescriptor(
        'send_email',
        'Send Email',
        '1.0.0',
        'general',
        'shell' as RunnerType,
        'Send an email notification',
        [
          new ToolParameter('to', 'string', true, 'Recipient email address'),
          new ToolParameter('subject', 'string', true, 'Email subject'),
          new ToolParameter('body', 'string', true, 'Email body text'),
        ],
        new ToolSecurity('outbound-only', undefined, undefined, 30),
      ),
      new ToolDescriptor(
        'render_report',
        'Render Report',
        '1.0.0',
        'finance',
        'data' as RunnerType,
        'Render a report in the specified format',
        [
          new ToolParameter('format', 'string', true, 'Output format (pdf, html, csv)'),
          new ToolParameter('data', 'object', true, 'Report data'),
          new ToolParameter('template', 'string', false, 'Report template name'),
        ],
        new ToolSecurity('none', undefined, undefined, 60),
      ),
      new ToolDescriptor(
        'run_shell',
        'Run Shell Command',
        '1.0.0',
        'general',
        'shell' as RunnerType,
        'Execute an arbitrary shell command inside the sandbox',
        [
          new ToolParameter('command', 'string', true, 'Shell command to execute'),
          new ToolParameter('workdir', 'string', false, 'Working directory'),
        ],
        new ToolSecurity('none', undefined, undefined, 60),
      ),
      new ToolDescriptor(
        'db_migrate',
        'Database Migration',
        '1.0.0',
        'devops',
        'shell' as RunnerType,
        'Run database migrations',
        [
          new ToolParameter('migration_dir', 'string', true, 'Migration files directory'),
          new ToolParameter('database_url', 'string', true, 'Database connection string'),
          new ToolParameter('direction', 'string', false, 'up or down'),
        ],
        new ToolSecurity('outbound-only', undefined, undefined, 300),
      ),
      new ToolDescriptor(
        'api_call',
        'API Call',
        '1.0.0',
        'marketing',
        'shell' as RunnerType,
        'Make an HTTP API call',
        [
          new ToolParameter('url', 'string', true, 'Request URL'),
          new ToolParameter('method', 'string', true, 'HTTP method (GET, POST, PUT, DELETE)'),
          new ToolParameter('headers', 'object', false, 'Request headers'),
          new ToolParameter('body', 'object', false, 'Request body'),
        ],
        new ToolSecurity('outbound-only', undefined, undefined, 60),
      ),
    ];

    for (const tool of tools) {
      this.registerTool(tool);
    }
  }
}
