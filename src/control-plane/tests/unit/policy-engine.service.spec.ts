import { Test, TestingModule } from '@nestjs/testing';
import { PolicyEngineService } from '../../src/policy-engine/policy-engine.service';
import {
  PolicyInput,
  ToolDescriptor,
  ToolParameter,
  ToolSecurity,
} from '../../src/shared/types';

describe('PolicyEngineService', () => {
  let service: PolicyEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PolicyEngineService],
    }).compile();

    service = module.get<PolicyEngineService>(PolicyEngineService);
  });

  // ── Helpers ───────────────────────────────────────────

  function makeTool(id: string, domain = 'general'): ToolDescriptor {
    return new ToolDescriptor(
      id,
      `Tool ${id}`,
      '1.0.0',
      domain,
      'shell' as any,
      `Description for ${id}`,
      [],
      new ToolSecurity(),
    );
  }

  // ── Consultative mode ─────────────────────────────────

  describe('consultative mode', () => {
    it('should always REQUIRE_APPROVAL for write tools', () => {
      const tool = makeTool('send_email');
      const input = new PolicyInput(
        'user1',
        'developer',
        'general',
        tool,
        'dev',
        'consultative',
      );
      const result = service.evaluate(input);
      expect(result.decision).toBe('REQUIRE_APPROVAL');
      expect(result.reason).toContain('Consultative');
    });

    it('should always REQUIRE_APPROVAL for read tools', () => {
      const tool = makeTool('run_sql_query');
      const input = new PolicyInput(
        'user1',
        'developer',
        'general',
        tool,
        'dev',
        'consultative',
      );
      const result = service.evaluate(input);
      expect(result.decision).toBe('REQUIRE_APPROVAL');
    });

    it('should always REQUIRE_APPROVAL for exec tools', () => {
      const tool = makeTool('run_shell');
      const input = new PolicyInput(
        'user1',
        'developer',
        'general',
        tool,
        'dev',
        'consultative',
      );
      const result = service.evaluate(input);
      expect(result.decision).toBe('REQUIRE_APPROVAL');
    });
  });

  // ── Semi-autonomous mode ─────────────────────────────

  describe('semi-autonomous mode', () => {
    it('should ALLOW for read tools (low risk)', () => {
      const tool = makeTool('run_sql_query');
      const input = new PolicyInput(
        'user1',
        'developer',
        'general',
        tool,
        'dev',
        'semi-autonomous',
      );
      const result = service.evaluate(input);
      expect(result.decision).toBe('ALLOW');
    });

    it('should REQUIRE_APPROVAL for write tools (medium risk)', () => {
      const tool = makeTool('kubectl_apply');
      const input = new PolicyInput(
        'user1',
        'developer',
        'general',
        tool,
        'dev',
        'semi-autonomous',
      );
      const result = service.evaluate(input);
      expect(result.decision).toBe('REQUIRE_APPROVAL');
    });

    it('should REQUIRE_APPROVAL for exec tools (high risk)', () => {
      const tool = makeTool('run_shell');
      const input = new PolicyInput(
        'user1',
        'developer',
        'general',
        tool,
        'dev',
        'semi-autonomous',
      );
      const result = service.evaluate(input);
      expect(result.decision).toBe('REQUIRE_APPROVAL');
    });
  });

  // ── Autonomous mode ──────────────────────────────────

  describe('autonomous mode', () => {
    it('should ALLOW for all sandbox operations (read tool)', () => {
      const tool = makeTool('run_sql_query');
      const input = new PolicyInput(
        'user1',
        'developer',
        'general',
        tool,
        'dev',
        'autonomous',
      );
      const result = service.evaluate(input);
      expect(result.decision).toBe('ALLOW');
    });

    it('should ALLOW for all sandbox operations (write tool)', () => {
      const tool = makeTool('send_email');
      const input = new PolicyInput(
        'user1',
        'developer',
        'general',
        tool,
        'dev',
        'autonomous',
      );
      const result = service.evaluate(input);
      expect(result.decision).toBe('ALLOW');
    });

    it('should ALLOW for all sandbox operations (exec tool)', () => {
      const tool = makeTool('run_shell');
      const input = new PolicyInput(
        'user1',
        'developer',
        'general',
        tool,
        'dev',
        'autonomous',
      );
      const result = service.evaluate(input);
      expect(result.decision).toBe('ALLOW');
    });
  });

  // ── Production environment ────────────────────────────

  describe('prod environment', () => {
    it('should DENY for non-admin on medium-risk tool (write)', () => {
      const tool = makeTool('send_email');
      const input = new PolicyInput(
        'user1',
        'developer',
        'general',
        tool,
        'prod',
        'semi-autonomous',
      );
      const result = service.evaluate(input);
      expect(result.decision).toBe('DENY');
      expect(result.reason).toContain('Production');
    });

    it('should DENY for non-admin on high-risk tool (exec)', () => {
      const tool = makeTool('run_shell');
      const input = new PolicyInput(
        'user1',
        'developer',
        'general',
        tool,
        'prod',
        'semi-autonomous',
      );
      const result = service.evaluate(input);
      expect(result.decision).toBe('DENY');
      expect(result.reason).toContain('Production');
    });

    it('should ALLOW for non-admin on low-risk tool in prod', () => {
      const tool = makeTool('run_sql_query');
      const input = new PolicyInput(
        'user1',
        'developer',
        'general',
        tool,
        'prod',
        'semi-autonomous',
      );
      const result = service.evaluate(input);
      expect(result.decision).toBe('ALLOW');
    });
  });

  // ── Admin role ────────────────────────────────────────

  describe('admin role', () => {
    it('should ALLOW everything for admin in dev with autonomous mode', () => {
      const tool = makeTool('run_shell');
      const input = new PolicyInput(
        'admin1',
        'admin',
        'general',
        tool,
        'dev',
        'autonomous',
      );
      const result = service.evaluate(input);
      expect(result.decision).toBe('ALLOW');
    });

    it('should bypass prod DENY for admin role on medium-risk tool', () => {
      const tool = makeTool('send_email');
      const input = new PolicyInput(
        'admin1',
        'admin',
        'general',
        tool,
        'prod',
        'autonomous',
      );
      const result = service.evaluate(input);
      expect(result.decision).toBe('ALLOW');
    });
  });
});
