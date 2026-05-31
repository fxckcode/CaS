import { Injectable } from '@nestjs/common';
import { PolicyInput, PolicyResult, PolicyDecision, AutonomyMode } from '../shared/types';

@Injectable()
export class PolicyEngineService {
  /**
   * Evaluate a policy decision for the given input.
   * MVP inline engine — no OPA dependency yet.
   */
  evaluate(input: PolicyInput): PolicyResult {
    const risk = this.determineRisk(input);

    // --- DENY override: production + write/execute tools for non-admin roles ---
    if (input.environment === 'prod' && input.role !== 'admin') {
      const riskLevel = risk ?? this.inferRiskFromTool(input);
      if (riskLevel === 'high' || riskLevel === 'medium') {
        return new PolicyResult(
          'DENY',
          `Production environment: tool "${input.tool.id}" requires admin role for ${riskLevel}-risk operations`,
        );
      }
    }

    // --- Evaluate based on autonomy mode ---
    switch (input.autonomyMode) {
      case 'consultative':
        return this.evaluateConsultative(input, risk);
      case 'semi-autonomous':
        return this.evaluateSemiAutonomous(input, risk);
      case 'autonomous':
        return this.evaluateAutonomous(input);
      default:
        return new PolicyResult('DENY', `Unknown autonomy mode: ${input.autonomyMode}`);
    }
  }

  /**
   * Extract the decision string from a PolicyResult.
   */
  getDecision(policyResult: PolicyResult): PolicyDecision {
    return policyResult.decision;
  }

  /** ─── Private helpers ─────────────────────────────────── */

  private evaluateConsultative(input: PolicyInput, risk?: string): PolicyResult {
    // Consultative mode: everything requires explicit approval
    return new PolicyResult(
      'REQUIRE_APPROVAL',
      `Consultative mode: all operations require human approval (tool: ${input.tool.id})`,
    );
  }

  private evaluateSemiAutonomous(input: PolicyInput, risk?: string): PolicyResult {
    const actualRisk = risk ?? this.inferRiskFromTool(input);

    if (actualRisk === 'low') {
      return new PolicyResult(
        'ALLOW',
        `Semi-autonomous: low-risk tool "${input.tool.id}" allowed`,
      );
    }

    // Analyst role: only low-risk in their own domain
    if (input.role === 'analyst' && input.domain !== input.tool.domain) {
      return new PolicyResult(
        'DENY',
        `Analyst role: tool "${input.tool.id}" is outside domain "${input.domain}"`,
      );
    }

    if (actualRisk === 'medium') {
      return new PolicyResult(
        'REQUIRE_APPROVAL',
        `Semi-autonomous: medium-risk tool "${input.tool.id}" requires approval`,
      );
    }

    // High risk in semi-autonomous always requires approval
    return new PolicyResult(
      'REQUIRE_APPROVAL',
      `Semi-autonomous: high-risk tool "${input.tool.id}" requires approval`,
    );
  }

  private evaluateAutonomous(input: PolicyInput): PolicyResult {
    // Autonomous mode: everything allowed within the sandbox
    return new PolicyResult(
      'ALLOW',
      `Autonomous mode: tool "${input.tool.id}" allowed within sandbox`,
    );
  }

  private inferRiskFromTool(input: PolicyInput): string {
    // Heuristic: read tools are low risk, write tools medium, exec tools high
    const readTools = ['run_sql_query', 'terraform_plan', 'api_call'];
    const writeTools = ['send_email', 'render_report', 'kubectl_apply', 'db_migrate'];
    const execTools = ['run_shell'];

    if (readTools.includes(input.tool.id)) return 'low';
    if (writeTools.includes(input.tool.id)) return 'medium';
    if (execTools.includes(input.tool.id)) return 'high';
    return 'medium';
  }

  private determineRisk(input: PolicyInput): string | undefined {
    return input.riskLevel;
  }
}
