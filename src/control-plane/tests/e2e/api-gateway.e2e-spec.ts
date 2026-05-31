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
          // Status may have already transitioned from PENDING due to
          // fire-and-forget planning running synchronously in the same tick
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
          // Autonomous mode may advance quickly past PENDING
          expect(['PENDING', 'PLANNING', 'APPROVED', 'IN_PROGRESS', 'COMPLETED']).toContain(res.body.status);
        });
    });
  });

  // ── GET /goals/:id ───────────────────────────────────

  describe('GET /goals/:id', () => {
    it('should return the goal for an existing id', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/goals')
        .send({ goal: 'find this goal', projectId: 'proj-99' })
        .expect(201);

      const goalId = createRes.body.id;

      return request(app.getHttpServer())
        .get(`/goals/${goalId}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(goalId);
          expect(res.body.description).toBe('find this goal');
          expect(res.body.status).toBeDefined();
        });
    });

    it('should return 404 for a non-existent id', () => {
      return request(app.getHttpServer())
        .get('/goals/non-existent-id-12345')
        .expect(404);
    });

    it('should return 404 for an empty id', () => {
      return request(app.getHttpServer())
        .get('/goals/ ')
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
          // Each tool should have an id
          expect(res.body.tools[0].id).toBeDefined();
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
