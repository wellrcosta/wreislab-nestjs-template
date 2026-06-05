import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../src/common/types/authenticated-user.type';

// Mock guard to bypass JWKS in e2e tests
const mockUser: AuthenticatedUser = {
  sub: 'test-sub-123',
  email: 'admin@example.com',
  name: 'Test Admin',
  groups: ['admin', 'user', 'viewer'],
};

const mockUserNoAdmin: AuthenticatedUser = {
  sub: 'test-sub-456',
  email: 'viewer@example.com',
  name: 'Test Viewer',
  groups: ['viewer'],
};

class MockJwtAuthGuard {
  private isPublic = false;
  canActivate() {
    return true;
  }
}

describe('AppController (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_NAME = 'wreislab-nestjs-template-test';
    process.env.OIDC_ISSUER_URL = 'https://auth.wreislab.com';
    process.env.OIDC_JWKS_URI = 'https://auth.wreislab.com/.well-known/jwks.json';
    process.env.JWT_GROUPS_CLAIM = 'groups';
    process.env.SWAGGER_ENABLED = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: import('@nestjs/common').ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest();
          const authHeader = req.headers['authorization'] as string | undefined;
          if (authHeader?.includes('viewer-token')) {
            req.user = mockUserNoAdmin;
            return true;
          }
          if (authHeader?.includes('admin-token')) {
            req.user = mockUser;
            return true;
          }
          // No token — simulate 401 for protected routes
          const path = req.url as string;
          if (['/auth/me', '/admin', '/user', '/viewer'].includes(path)) {
            return false;
          }
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /public returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/public' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ message: string; authenticated: boolean }>();
    expect(body.message).toBe('Public endpoint');
    expect(body.authenticated).toBe(false);
  });

  it('GET /health returns 200 with status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ status: string }>().status).toBe('ok');
  });

  it('GET /metrics returns Prometheus format', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.payload).toContain('# HELP');
  });

  it('GET /auth/me without token returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /admin without token returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /admin with admin token returns 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin',
      headers: { authorization: 'Bearer admin-token' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ message: string; allowed: boolean }>();
    expect(body.allowed).toBe(true);
  });

  it('GET /admin with viewer token returns 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin',
      headers: { authorization: 'Bearer viewer-token' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /viewer with viewer token returns 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/viewer',
      headers: { authorization: 'Bearer viewer-token' },
    });
    expect(res.statusCode).toBe(200);
  });
});
