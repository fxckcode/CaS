import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('API Gateway (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: false,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── GET /health ───────────────────────────────────────

  describe('GET /health', () => {
    it('should return 200 with status ok', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('ok');
          expect(typeof res.body.timestamp).toBe('number');
        });
    });
  });

  // ── POST /goals ───────────────────────────────────────

  describe('POST /goals', () => {
    it('should return 201 with a new goal and valid id', () => {
      return request(app.getHttpServer())
        .post('/goals')
        .send({ goal: 'generate monthly report', projectId: 'proj-42' })
        .expect(201)
        .expect((res) => {
          expect(res.body.id).toBeDefined();
          expect(['PENDING', 'PLANNING', 'AWAITING_APPROVAL', 'APPROVED', 'IN_PROGRESS']).toContain(res.body.status);
          expect(res.body.description).toBe('generate monthly report');
          expect(res.body.createdAt).toBeDefined();
          expect(res.body.updatedAt).toBeDefined();
        });
    });

    it('should accept optional autonomyMode field', () => {
      return request(app.getHttpServer())
        .post('/goals')
        .send({
          goal: 'deploy to prod',
          projectId: 'proj-1',
          autonomyMode: 'autonomous',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.id).toBeDefined();
          expect(['PENDING', 'PLANNING', 'APPROVED', 'IN_PROGRESS', 'COMPLETED']).toContain(res.body.status);
        });
    });
  });

  // ── GET /goals (list) ─────────────────────────────────

  describe('GET /goals', () => {
    it('should return 200 with a goals array', async () => {
      // Create a goal first so the list is non-empty
      await request(app.getHttpServer())
        .post('/goals')
        .send({ goal: 'list test goal', projectId: 'list-test' })
        .expect(201);

      return request(app.getHttpServer())
        .get('/goals')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThanOrEqual(1);
          const g = res.body[0];
          expect(g.id).toBeDefined();
          expect(g.description).toBeDefined();
          expect(g.status).toBeDefined();
          expect(g.createdAt).toBeDefined();
          expect(g.updatedAt).toBeDefined();
        });
    });
  });

  // ── GET /goals/:id ───────────────────────────────────

  describe('GET /goals/:id', () => {
    let createdGoalId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/goals')
        .send({ goal: 'find this goal', projectId: 'proj-99' })
        .expect(201);
      createdGoalId = res.body.id;
    });

    it('should return the goal for an existing id', () => {
      return request(app.getHttpServer())
        .get(`/goals/${createdGoalId}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(createdGoalId);
          expect(res.body.description).toBe('find this goal');
          expect(res.body.status).toBeDefined();
        });
    });

    it('should return 404 for a non-existent id', () => {
      return request(app.getHttpServer())
        .get('/goals/non-existent-id-12345')
        .expect(404);
    });
  });

  // ── GET /goals/:id/plan ──────────────────────────────

  describe('GET /goals/:id/plan', () => {
    let createdGoalId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/goals')
        .send({ goal: 'plan test goal for e2e', projectId: 'plan-test' })
        .expect(201);
      createdGoalId = res.body.id;
    });

    it('should return 200 with a plan containing steps', async () => {
      // The plan may not be immediately available — retry briefly
      let plan: any = null;
      for (let i = 0; i < 5; i++) {
        const res = await request(app.getHttpServer())
          .get(`/goals/${createdGoalId}/plan`);
        if (res.status === 200) {
          plan = res.body;
          break;
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      expect(plan).not.toBeNull();
      expect(Array.isArray(plan.steps)).toBe(true);
      expect(plan.steps.length).toBeGreaterThanOrEqual(1);
      expect(plan.steps[0].toolId).toBeDefined();
      expect(plan.steps[0].description).toBeDefined();
    });

    it('should return 404 for a non-existent goal', () => {
      return request(app.getHttpServer())
        .get('/goals/non-existent-plan/plan')
        .expect(404);
    });
  });

  // ── GET /tools ──────────────────────────────────────

  describe('GET /tools', () => {
    it('should return 200 with a tools array and total count', () => {
      return request(app.getHttpServer())
        .get('/tools')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body.tools)).toBe(true);
          expect(typeof res.body.total).toBe('number');
          expect(res.body.total).toBeGreaterThan(0);
          expect(res.body.tools.length).toBe(res.body.total);
          expect(res.body.tools[0].id).toBeDefined();
        });
    });
  });

  // ── GET /memory ──────────────────────────────────────

  describe('GET /memory', () => {
    it('should return 200 with items array and total', () => {
      return request(app.getHttpServer())
        .get('/memory')
        .expect(200)
        .expect((res) => {
          expect(res.body.items).toBeDefined();
          expect(Array.isArray(res.body.items)).toBe(true);
          expect(typeof res.body.total).toBe('number');
        });
    });

    it('should support keywords query param', () => {
      return request(app.getHttpServer())
        .get('/memory?keywords=deploy')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body.items)).toBe(true);
        });
    });
  });

  // ── POST /goals with invalid body ──────────────────────

  describe('POST /goals with invalid body', () => {
    it('should return 400 when goal field is missing', () => {
      return request(app.getHttpServer())
        .post('/goals')
        .send({ projectId: 'proj-1' })
        .expect(400);
    });

    it('should return 400 when projectId is missing', () => {
      return request(app.getHttpServer())
        .post('/goals')
        .send({ goal: 'test goal' })
        .expect(400);
    });

    it('should return 400 when body is empty', () => {
      return request(app.getHttpServer())
        .post('/goals')
        .send({})
        .expect(400);
    });

    it('should return 400 with invalid autonomyMode value', () => {
      return request(app.getHttpServer())
        .post('/goals')
        .send({
          goal: 'test',
          projectId: 'proj-1',
          autonomyMode: 'super-autonomous',
        })
        .expect(400);
    });
  });
});
