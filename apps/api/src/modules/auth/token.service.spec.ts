import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { Role } from '../../common/auth/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { hashRefreshToken, TokenService } from './token.service';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('TokenService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let jwt: JwtService;
  let service: TokenService;

  const storedToken = (overrides: Record<string, unknown> = {}) => ({
    id: 'token-1',
    userId: 'user-1',
    tokenHash: hashRefreshToken('old-token'),
    expiresAt: new Date(Date.now() + DAY_MS),
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    (prisma.$transaction as unknown as jest.Mock).mockImplementation(
      (fn: (tx: PrismaService) => unknown) => fn(prisma),
    );
    prisma.refreshToken.create.mockResolvedValue(storedToken() as never);
    jwt = new JwtService({
      secret: 'unit-test-secret-at-least-32-characters',
      signOptions: { expiresIn: '15m' },
    });
    const config = {
      get: (key: string, defaultValue?: unknown) =>
        key === 'REFRESH_TOKEN_EXPIRES_DAYS' ? 7 : defaultValue,
    } as unknown as ConfigService;
    service = new TokenService(prisma, jwt, config);
  });

  it('should sign an access token with sub, email and roles', async () => {
    const token = await service.signAccessToken({
      id: 'user-1',
      email: 'an@example.com',
      roles: [Role.CUSTOMER],
    });

    await expect(jwt.verifyAsync(token)).resolves.toMatchObject({
      sub: 'user-1',
      email: 'an@example.com',
      roles: ['CUSTOMER'],
    });
  });

  it('should store only the SHA-256 hash when issuing a refresh token', async () => {
    const { token, expiresAt } = await service.issueRefreshToken('user-1');

    const { data } = prisma.refreshToken.create.mock.calls[0][0];
    expect(data.tokenHash).toBe(hashRefreshToken(token));
    expect(data.tokenHash).not.toContain(token);
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(7 * DAY_MS - 5000);
  });

  it('should revoke the old token and issue a new one when rotating', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(storedToken() as never);
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.rotateRefreshToken('old-token');

    expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashRefreshToken('old-token') },
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'token-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(result.userId).toBe('user-1');
    expect(result.refresh.token).not.toBe('old-token');
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('should revoke all tokens of the user when a revoked token is reused', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(
      storedToken({ revokedAt: new Date() }) as never,
    );

    await expect(service.rotateRefreshToken('old-token')).rejects.toMatchObject(
      { code: 'INVALID_REFRESH_TOKEN' },
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('should treat a token rotated concurrently by another request as reused', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(storedToken() as never);
    prisma.refreshToken.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 2 });

    await expect(service.rotateRefreshToken('old-token')).rejects.toMatchObject(
      { code: 'INVALID_REFRESH_TOKEN' },
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenLastCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('should reject an expired refresh token', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(
      storedToken({ expiresAt: new Date(Date.now() - 1000) }) as never,
    );

    await expect(service.rotateRefreshToken('old-token')).rejects.toMatchObject(
      { code: 'INVALID_REFRESH_TOKEN', status: 401 },
    );
  });

  it.each([undefined, 'unknown-token'])(
    'should reject a missing or unknown refresh token (%p)',
    async (token) => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.rotateRefreshToken(token)).rejects.toMatchObject({
        code: 'INVALID_REFRESH_TOKEN',
      });
    },
  );

  it('should revoke only the given token on logout', async () => {
    await service.revokeRefreshToken('old-token');

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: hashRefreshToken('old-token'), revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
