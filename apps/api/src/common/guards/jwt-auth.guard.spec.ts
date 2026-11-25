import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthenticatedRequest } from '../auth/auth-user';
import { JwtAuthGuard } from './jwt-auth.guard';

function contextFor(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const jwt = new JwtService({
    secret: 'unit-test-secret-at-least-32-characters',
    signOptions: { expiresIn: '15m' },
  });
  let reflector: Reflector;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    guard = new JwtAuthGuard(jwt, reflector);
  });

  it('should allow a @Public() route without a token', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    await expect(guard.canActivate(contextFor({ headers: {} }))).resolves.toBe(
      true,
    );
  });

  it('should reject a request without an Authorization header', async () => {
    await expect(
      guard.canActivate(contextFor({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('should reject a token that fails verification', async () => {
    const request = {
      headers: { authorization: 'Bearer invalid.token.value' },
    };

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('should reject a valid signature whose payload lacks the expected claims', async () => {
    const token = await jwt.signAsync({ sub: 'user-1' });
    const request = { headers: { authorization: `Bearer ${token}` } };

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('should attach the user to the request and drop unknown roles', async () => {
    const token = await jwt.signAsync({
      sub: 'user-1',
      email: 'an@example.com',
      roles: ['CUSTOMER', 'SUPERUSER'],
    });
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: `Bearer ${token}` },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual({
      id: 'user-1',
      email: 'an@example.com',
      roles: ['CUSTOMER'],
    });
  });
});
