import { Test, TestingModule } from '@nestjs/testing';
import { ToolsRegistryService } from '../../src/tools-registry/tools-registry.service';
import {
  ToolDescriptor,
  ToolParameter,
  ToolSecurity,
} from '../../src/shared/types';

describe('ToolsRegistryService', () => {
  let service: ToolsRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ToolsRegistryService],
    }).compile();

    service = module.get<ToolsRegistryService>(ToolsRegistryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── Register and retrieve ─────────────────────────────

  describe('register and retrieve', () => {
    it('should register a new tool and retrieve it by id', () => {
      const tool = new ToolDescriptor(
        'custom_tool',
        'Custom Tool',
        '1.0.0',
        'general',
        'shell' as any,
        'A custom registered tool',
        [],
        new ToolSecurity(),
      );
      service.registerTool(tool);

      const retrieved = service.getTool('custom_tool');
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe('custom_tool');
      expect(retrieved!.name).toBe('Custom Tool');
    });

    it('should return undefined for a non-existent tool', () => {
      const retrieved = service.getTool('non_existent_tool');
      expect(retrieved).toBeUndefined();
    });

    it('should return all seeded tools', () => {
      const tools = service.getTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThanOrEqual(8); // 8 seeded tools
    });
  });

  // ── Filter by domain ──────────────────────────────────

  describe('filter by domain', () => {
    it('should return only tools matching the requested domain', () => {
      const financeTools = service.getTools('finance');
      expect(financeTools.length).toBeGreaterThan(0);
      expect(financeTools.every((t) => t.domain === 'finance')).toBe(true);
    });

    it('should return devops tools', () => {
      const devopsTools = service.getTools('devops');
      expect(devopsTools.length).toBeGreaterThan(0);
      expect(devopsTools.every((t) => t.domain === 'devops')).toBe(true);
    });

    it('should return all tools when no domain is specified', () => {
      const allTools = service.getTools();
      const financeTools = service.getTools('finance');
      expect(allTools.length).toBeGreaterThan(financeTools.length);
    });

    it('should return empty array for a domain with no tools', () => {
      const result = service.getTools('nonexistent-domain');
      expect(result).toEqual([]);
    });
  });

  // ── Get by id + version ───────────────────────────────

  describe('get by id and version', () => {
    it('should get a tool with matching id and version', () => {
      const tool = service.getTool('run_sql_query', '1.0.0');
      expect(tool).toBeDefined();
      expect(tool!.id).toBe('run_sql_query');
      expect(tool!.version).toBe('1.0.0');
    });

    it('should return undefined when version does not exist', () => {
      const tool = service.getTool('run_sql_query', '99.99.99');
      expect(tool).toBeUndefined();
    });

    it('should return latest version when no version is specified', () => {
      // Register a second version
      const v2 = new ToolDescriptor(
        'run_sql_query',
        'Run SQL Query v2',
        '2.0.0',
        'finance',
        'data' as any,
        'v2',
        [],
        new ToolSecurity(),
      );
      service.registerTool(v2);

      const tool = service.getTool('run_sql_query');
      expect(tool).toBeDefined();
      expect(tool!.version).toBe('2.0.0');
    });
  });

  // ── Get by runner type ────────────────────────────────

  describe('get by runner type', () => {
    it('should return shell runner tools', () => {
      const shellTools = service.getToolsByRunner('shell' as any);
      expect(shellTools.length).toBeGreaterThan(0);
      expect(shellTools.every((t) => t.runner === 'shell')).toBe(true);
    });

    it('should return data runner tools', () => {
      const dataTools = service.getToolsByRunner('data' as any);
      expect(dataTools.length).toBeGreaterThan(0);
      expect(dataTools.every((t) => t.runner === 'data')).toBe(true);
    });

    it('should return empty array for runner type with no tools', () => {
      const result = service.getToolsByRunner('cicd' as any);
      expect(result).toEqual([]);
    });
  });
});
