import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GroupsGuard } from './groups.guard';
import { AuthenticatedUser } from '../types/authenticated-user.type';

const makeContext = (user: Partial<AuthenticatedUser> | undefined): ExecutionContext => {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
};

describe('GroupsGuard', () => {
  let guard: GroupsGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new GroupsGuard(reflector);
  });

  it('should allow when no groups are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = makeContext({ groups: [] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow user with required group', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    const ctx = makeContext({ groups: ['admin', 'user'] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow user matching any of multiple allowed groups', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['viewer', 'user', 'admin']);
    const ctx = makeContext({ groups: ['user'] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should deny user without required group', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    const ctx = makeContext({ groups: ['viewer'] });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should deny when user has no groups', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    const ctx = makeContext({ groups: [] });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
