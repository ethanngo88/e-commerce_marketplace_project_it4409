import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser, Role } from '../auth/auth-user';
import { RolesGuard } from './roles.guard';

function contextFor(user?: AuthUser): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const customer: AuthUser = {
    id: 'user-1',
    email: 'an@example.com',
    roles: [Role.CUSTOMER],
  };
  let reflector: Reflector;
  let guard: RolesGuard;

  const requireRoles = (roles: Role[] | undefined) =>
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('should allow any logged-in user when the route has no @Roles()', () => {
    requireRoles(undefined);

    expect(guard.canActivate(contextFor(customer))).toBe(true);
  });

  it('should allow a user who has one of the required roles', () => {
    requireRoles([Role.SELLER, Role.CUSTOMER]);

    expect(guard.canActivate(contextFor(customer))).toBe(true);
  });

  it('should block a user without the required role with 403', () => {
    requireRoles([Role.ADMIN]);

    expect(() => guard.canActivate(contextFor(customer))).toThrow(
      ForbiddenException,
    );
  });

  it('should return 401 when a route requires roles but nobody is logged in', () => {
    requireRoles([Role.ADMIN]);

    expect(() => guard.canActivate(contextFor(undefined))).toThrow(
      UnauthorizedException,
    );
  });
});
