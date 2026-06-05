jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest.fn(() => jest.fn()),
}));

import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { OidcJwksService } from './oidc-jwks.service';

// Stub req object — validate() only reads headers.authorization for userinfo fallback.
// When groups ARE in the payload the fallback is never called, so req can be minimal.
const stubReq = { headers: { authorization: 'Bearer test-token' } };

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              const config: Record<string, string> = {
                'oidc.issuerUrl': 'https://auth.wreislab.com',
                'oidc.audience': '',
                'oidc.groupsClaim': 'groups',
              };
              return config[key] ?? '';
            },
          },
        },
        {
          provide: OidcJwksService,
          useValue: {
            getJwksUri: () => 'https://auth.wreislab.com/.well-known/jwks.json',
            getUserInfoEndpoint: () => '',
          },
        },
      ],
    }).compile();

    strategy = moduleRef.get<JwtStrategy>(JwtStrategy);
  });

  it('should validate payload and normalize groups array', async () => {
    const payload = {
      sub: 'user-123',
      email: 'user@example.com',
      name: 'Test User',
      groups: ['admin', 'user'],
    };

    const result = await strategy.validate(stubReq, payload);

    expect(result.sub).toBe('user-123');
    expect(result.email).toBe('user@example.com');
    expect(result.name).toBe('Test User');
    expect(result.groups).toEqual(['admin', 'user']);
  });

  it('should normalize single string group to array', async () => {
    const payload = {
      sub: 'user-123',
      email: 'user@example.com',
      name: 'Test User',
      groups: 'admin',
    };

    const result = await strategy.validate(stubReq, payload);
    expect(result.groups).toEqual(['admin']);
  });

  it('should return empty groups when claim is missing and userinfo endpoint is not configured', async () => {
    const payload = {
      sub: 'user-123',
      email: 'user@example.com',
      name: 'Test User',
    };

    const result = await strategy.validate(stubReq, payload);
    expect(result.groups).toEqual([]);
  });
});
