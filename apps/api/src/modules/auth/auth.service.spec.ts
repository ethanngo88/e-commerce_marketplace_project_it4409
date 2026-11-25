import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

describe('AuthService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let tokens: DeepMockProxy<TokenService>;
  let service: AuthService;

  const refresh = { token: 'refresh-token', expiresAt: new Date() };

  const userRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'user-1',
    email: 'an@example.com',
    fullName: 'Nguyễn Văn An',
    phone: null,
    avatarUrl: null,
    status: 'ACTIVE',
    userRoles: [{ role: { name: 'CUSTOMER' } }],
    seller: null,
    ...overrides,
  });

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    (prisma.$transaction as unknown as jest.Mock).mockImplementation(
      (fn: (tx: PrismaService) => unknown) => fn(prisma),
    );
    tokens = mockDeep<TokenService>();
    tokens.signAccessToken.mockResolvedValue('access-token');
    tokens.issueRefreshToken.mockResolvedValue(refresh);
    const config = {
      get: (key: string, defaultValue?: unknown) =>
        key === 'BCRYPT_ROUNDS' ? 4 : defaultValue,
    } as unknown as ConfigService;
    service = new AuthService(prisma, tokens, config);
  });

  describe('register', () => {
    const dto = {
      email: 'an@example.com',
      password: 'matkhau123',
      fullName: 'Nguyễn Văn An',
    };

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue({ id: 1, name: 'CUSTOMER' });
      prisma.user.create.mockResolvedValue(userRecord() as never);
    });

    it('should hash the password and assign the CUSTOMER role when registering', async () => {
      const session = await service.register(dto);

      const { data } = prisma.user.create.mock.calls[0][0];
      expect(data.passwordHash).not.toBe(dto.password);
      await expect(
        bcrypt.compare(dto.password, data.passwordHash),
      ).resolves.toBe(true);
      expect(data.userRoles).toEqual({ create: { roleId: 1 } });
      expect(session.user.roles).toEqual(['CUSTOMER']);
      expect(session.user).not.toHaveProperty('passwordHash');
      expect(session.accessToken).toBe('access-token');
      expect(session.refresh).toBe(refresh);
    });

    it('should reject an email that is already registered', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'other' } as never);

      await expect(service.register(dto)).rejects.toMatchObject({
        code: 'EMAIL_ALREADY_EXISTS',
        status: 409,
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('should return EMAIL_ALREADY_EXISTS when a concurrent request wins the unique constraint', async () => {
      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(service.register(dto)).rejects.toMatchObject({
        code: 'EMAIL_ALREADY_EXISTS',
      });
    });
  });

  describe('login', () => {
    const passwordHash = bcrypt.hashSync('matkhau123', 4);

    it('should return tokens and the profile when credentials are correct', async () => {
      prisma.user.findUnique.mockResolvedValue(
        userRecord({ passwordHash }) as never,
      );

      const session = await service.login({
        email: 'an@example.com',
        password: 'matkhau123',
      });

      expect(session.accessToken).toBe('access-token');
      expect(session.user).toEqual({
        id: 'user-1',
        email: 'an@example.com',
        fullName: 'Nguyễn Văn An',
        phone: null,
        avatarUrl: null,
        roles: ['CUSTOMER'],
        sellerStatus: null,
      });
    });

    it('should return INVALID_CREDENTIALS when the password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue(
        userRecord({ passwordHash }) as never,
      );

      await expect(
        service.login({ email: 'an@example.com', password: 'sai-mat-khau1' }),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401 });
      expect(tokens.issueRefreshToken).not.toHaveBeenCalled();
    });

    it('should return INVALID_CREDENTIALS when the email does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'matkhau123' }),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401 });
    });

    it('should reject a BANNED account with ACCOUNT_BANNED', async () => {
      prisma.user.findUnique.mockResolvedValue(
        userRecord({ passwordHash, status: 'BANNED' }) as never,
      );

      await expect(
        service.login({ email: 'an@example.com', password: 'matkhau123' }),
      ).rejects.toMatchObject({ code: 'ACCOUNT_BANNED', status: 403 });
      expect(tokens.issueRefreshToken).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    beforeEach(() => {
      tokens.rotateRefreshToken.mockResolvedValue({
        userId: 'user-1',
        refresh,
      });
    });

    it('should sign a new access token with the current roles', async () => {
      prisma.user.findUnique.mockResolvedValue(
        userRecord({
          userRoles: [
            { role: { name: 'CUSTOMER' } },
            { role: { name: 'SELLER' } },
          ],
          seller: { status: 'APPROVED' },
        }) as never,
      );

      const result = await service.refresh('old-token');

      expect(tokens.signAccessToken).toHaveBeenCalledWith({
        id: 'user-1',
        email: 'an@example.com',
        roles: ['CUSTOMER', 'SELLER'],
      });
      expect(result).toEqual({ accessToken: 'access-token', refresh });
    });

    it('should revoke every session and reject when the user is BANNED', async () => {
      prisma.user.findUnique.mockResolvedValue(
        userRecord({ status: 'BANNED' }) as never,
      );

      await expect(service.refresh('old-token')).rejects.toMatchObject({
        code: 'INVALID_REFRESH_TOKEN',
      });
      expect(tokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
      expect(tokens.signAccessToken).not.toHaveBeenCalled();
    });
  });

  it('should revoke the refresh token on logout', async () => {
    await service.logout('refresh-token');

    expect(tokens.revokeRefreshToken).toHaveBeenCalledWith('refresh-token');
  });
});
