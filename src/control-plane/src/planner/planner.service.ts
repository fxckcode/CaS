import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { Goal, Plan, PlanStep, ToolDescriptor } from '../shared/types';
import { ToolsRegistryService } from '../tools-registry/tools-registry.service';
import { MemoryReaderService } from '../memory/memory-reader.service';

@Injectable()
export class PlannerService {
  private readonly logger = new Logger(PlannerService.name);

  constructor(
    private readonly toolsRegistry: ToolsRegistryService,
    private readonly memoryReader: MemoryReaderService,
  ) {}

  /**
   * Create a Plan from a Goal using template-based matching.
   * MVP: keyword-driven templates. Replace with LLM-based planning later.
   */
  async createPlan(goal: Goal, _tools?: ToolDescriptor[]): Promise<Plan> {
    const description = goal.description.toLowerCase();
    const tools = _tools ?? this.toolsRegistry.getTools();

    // Recuperar contexto de memoria antes de planificar
    const memoryContext = await this.memoryReader.getContextForPlanning(goal);
    if (memoryContext) {
      this.logger.log(`Memory context retrieved for goal ${goal.id}:\n${memoryContext}`);
    }

    if (description.includes('report') || description.includes('reporte')) {
      return this.buildReportPlan(goal, tools);
    }

    if (description.includes('deploy') || description.includes('desplegar')) {
      return this.buildDeployPlan(goal, tools);
    }

    if (description.includes('migrate') || description.includes('migración') || description.includes('migrar')) {
      return this.buildMigrationPlan(goal, tools);
    }

    if (description.includes('email') || description.includes('correo') || description.includes('notificar')) {
      return this.buildNotificationPlan(goal, tools);
    }

    if (description.includes('terraform') || description.includes('infra')) {
      return this.buildInfraPlan(goal, tools);
    }

    if (description.includes('api') || description.includes('integration') || description.includes('integración')) {
      return this.buildApiPlan(goal, tools);
    }

    // Fallback: generic plan with a single shell step
    return this.buildGenericPlan(goal, tools);
  }

  /**
   * Build an organizational/memory context string for the goal.
   */
  createQueryContext(goal: Goal): string {
    const parts: string[] = [
      `Goal: ${goal.description}`,
      `Project: ${goal.projectId}`,
      `User: ${goal.userId}`,
      `Autonomy Mode: ${goal.autonomyMode}`,
      `Created: ${goal.createdAt.toISOString()}`,
    ];
    if (goal.channelMetadata) {
      parts.push(`Channel Metadata: ${JSON.stringify(goal.channelMetadata)}`);
    }
    return parts.join('\n');
  }

  /** ─── Template builders ───────────────────────────────────── */

  private buildReportPlan(goal: Goal, tools: ToolDescriptor[]): Plan {
    const steps: PlanStep[] = [];
    const sqlTool = this.findTool(tools, 'run_sql_query');
    const renderTool = this.findTool(tools, 'render_report');
    const emailTool = this.findTool(tools, 'send_email');

    if (sqlTool) {
      steps.push(
        new PlanStep(
          uuid(),
          'Execute SQL query to fetch report data',
          sqlTool.id,
          { query: 'SELECT * FROM reports WHERE project_id = $1', database: 'analytics' },
          [],
        ),
      );
    }

    if (renderTool) {
      const deps = sqlTool ? [steps[steps.length - 1].id] : [];
      steps.push(
        new PlanStep(
          uuid(),
          'Render report document',
          renderTool.id,
          { format: 'pdf', data: { projectId: goal.projectId } },
          deps,
        ),
      );
    }

    if (emailTool) {
      const deps = renderTool ? [steps[steps.length - 1].id] : [];
      steps.push(
        new PlanStep(
          uuid(),
          'Send report via email',
          emailTool.id,
          { to: 'user@org.com', subject: `Report: ${goal.description}`, body: 'Please find attached the generated report.' },
          deps,
        ),
      );
    }

    return new Plan(uuid(), goal.id, steps.length > 0 ? steps : this.fallbackSteps(), 'Template: report generation plan');
  }

  private buildDeployPlan(goal: Goal, tools: ToolDescriptor[]): Plan {
    const steps: PlanStep[] = [];
    const terraformTool = this.findTool(tools, 'terraform_plan');
    const kubectlTool = this.findTool(tools, 'kubectl_apply');

    if (terraformTool) {
      steps.push(
        new PlanStep(
          uuid(),
          'Plan infrastructure changes with Terraform',
          terraformTool.id,
          { directory: './infra', variables: { project_id: goal.projectId } },
          [],
        ),
      );
    }

    if (kubectlTool) {
      const deps = steps.length > 0 ? [steps[steps.length - 1].id] : [];
      steps.push(
        new PlanStep(
          uuid(),
          'Apply Kubernetes manifests',
          kubectlTool.id,
          { manifest: `apiVersion: v1\nkind: Namespace\nmetadata:\n  name: ${goal.projectId}`, namespace: goal.projectId },
          deps,
        ),
      );
    }

    return new Plan(uuid(), goal.id, steps.length > 0 ? steps : this.fallbackSteps(), 'Template: deploy plan');
  }

  private buildMigrationPlan(goal: Goal, tools: ToolDescriptor[]): Plan {
    const steps: PlanStep[] = [];
    const migrateTool = this.findTool(tools, 'db_migrate');

    if (migrateTool) {
      steps.push(
        new PlanStep(
          uuid(),
          'Run database migrations',
          migrateTool.id,
          { migration_dir: './migrations', database_url: 'postgres://localhost/db', direction: 'up' },
          [],
        ),
      );
    }

    return new Plan(uuid(), goal.id, steps.length > 0 ? steps : this.fallbackSteps(), 'Template: database migration plan');
  }

  private buildNotificationPlan(goal: Goal, tools: ToolDescriptor[]): Plan {
    const steps: PlanStep[] = [];
    const emailTool = this.findTool(tools, 'send_email');

    if (emailTool) {
      steps.push(
        new PlanStep(
          uuid(),
          'Send notification email',
          emailTool.id,
          { to: 'user@org.com', subject: `Notification: ${goal.description}`, body: `Automated notification for goal: ${goal.description}` },
          [],
        ),
      );
    }

    return new Plan(uuid(), goal.id, steps.length > 0 ? steps : this.fallbackSteps(), 'Template: notification plan');
  }

  private buildInfraPlan(goal: Goal, tools: ToolDescriptor[]): Plan {
    const steps: PlanStep[] = [];
    const terraformTool = this.findTool(tools, 'terraform_plan');
    const kubectlTool = this.findTool(tools, 'kubectl_apply');

    if (terraformTool) {
      steps.push(
        new PlanStep(
          uuid(),
          'Generate Terraform plan',
          terraformTool.id,
          { directory: './infra', variables: { project_id: goal.projectId } },
          [],
        ),
      );
    }

    if (kubectlTool) {
      steps.push(
        new PlanStep(
          uuid(),
          'Apply infrastructure with kubectl',
          kubectlTool.id,
          { manifest: '...', namespace: goal.projectId },
          terraformTool ? [steps[0].id] : [],
        ),
      );
    }

    return new Plan(uuid(), goal.id, steps.length > 0 ? steps : this.fallbackSteps(), 'Template: infrastructure plan');
  }

  private buildApiPlan(goal: Goal, tools: ToolDescriptor[]): Plan {
    const steps: PlanStep[] = [];
    const apiTool = this.findTool(tools, 'api_call');

    if (apiTool) {
      steps.push(
        new PlanStep(
          uuid(),
          'Execute API integration call',
          apiTool.id,
          { url: 'https://api.example.com/integrate', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { projectId: goal.projectId } },
          [],
        ),
      );
    }

    return new Plan(uuid(), goal.id, steps.length > 0 ? steps : this.fallbackSteps(), 'Template: API integration plan');
  }

  private buildGenericPlan(goal: Goal, tools: ToolDescriptor[]): Plan {
    const shellTool = this.findTool(tools, 'run_shell');
    if (shellTool) {
      return new Plan(
        uuid(),
        goal.id,
        [
          new PlanStep(
            uuid(),
            `Execute goal: ${goal.description}`,
            shellTool.id,
            { command: `echo "Processing: ${goal.description}"` },
            [],
          ),
        ],
        'Template: generic fallback plan',
      );
    }
    return new Plan(uuid(), goal.id, this.fallbackSteps(), 'Template: generic fallback (no shell tool)');
  }

  private fallbackSteps(): PlanStep[] {
    return [
      new PlanStep(uuid(), 'Fallback step - no matching tools', 'run_shell', { command: 'echo "No tools available"' }, []),
    ];
  }

  private findTool(tools: ToolDescriptor[], id: string): ToolDescriptor | undefined {
    return tools.find((t) => t.id === id);
  }
}
