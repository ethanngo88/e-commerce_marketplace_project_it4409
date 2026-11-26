import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from '../auth/token.service';
import { MAX_ADDRESSES_PER_USER, UsersService } from './users.service';

describe('UsersService (T-11)', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let tokens: DeepMockProxy<TokenService>;
  let service: UsersService;

  const userRecord = {
    id: 'user-1',
    email: 'an@example.com',
    fullName: 'Nguyễn Văn An',
    phone: '0901234567',
    avatarUrl: null,
    userRoles: [{ role: { name: 'CUSTOMER' } }],
    seller: null,
  };

  const addressInput = {
    recipientName: 'Nguyễn Văn An',
    phone: '0901234567',
    province: 'Hà Nội',
    district: 'Hai Bà Trưng',
    ward: 'Bách Khoa',
    street: 'Số 1 Đại Cồ Việt',
  };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    (prisma.$transaction as unknown as jest.Mock).mockImplementation(
      (fn: (tx: PrismaService) => unknown) => fn(prisma),
    );
    tokens = mockDeep<TokenService>();
    tokens.revokeOtherForUser.mockResolvedValue(undefined);
    const config = {
      get: (key: string, defaultValue?: unknown) =>
        key === 'BCRYPT_ROUNDS' ? 4 : defaultValue,
    } as unknown as ConfigService;
    service = new UsersService(prisma, tokens, config);
  });

  describe('profile', () => {
    it('should return the current user profile without passwordHash', async () => {
      prisma.user.findUnique.mockResolvedValue(userRecord as never);

      const profile = await service.getProfile('user-1');

      expect(profile).toEqual({
        id: 'user-1',
        email: 'an@example.com',
        fullName: 'Nguyễn Văn An',
        phone: '0901234567',
        avatarUrl: null,
        roles: ['CUSTOMER'],
        sellerStatus: null,
      });
    });

    it('should update fullName and phone for the current user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1' } as never);
      prisma.user.update.mockResolvedValue({
        ...userRecord,
        fullName: 'Nguyễn An Mới',
        phone: '0987654321',
      } as never);

      const updated = await service.updateProfile('user-1', {
        fullName: 'Nguyễn An Mới',
        phone: '0987654321',
      });

      expect(updated.fullName).toBe('Nguyễn An Mới');
      expect(updated.phone).toBe('0987654321');
    });
  });

  describe('changePassword', () => {
    const oldHash = bcrypt.hashSync('OldPass123', 4);

    it('should reject when currentPassword is wrong with WRONG_PASSWORD', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: oldHash,
      } as never);

      await expect(
        service.changePassword('user-1', {
          currentPassword: 'WrongPassword1',
          newPassword: 'NewPass123',
        }),
      ).rejects.toMatchObject({ code: 'WRONG_PASSWORD', status: 400 });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(tokens.revokeOtherForUser).not.toHaveBeenCalled();
    });

    it('should hash the new password and revoke other refresh tokens', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: oldHash,
      } as never);
      prisma.user.update.mockResolvedValue({ id: 'user-1' } as never);

      await service.changePassword(
        'user-1',
        { currentPassword: 'OldPass123', newPassword: 'NewPass456' },
        'current-cookie',
      );

      const savedHash = prisma.user.update.mock.calls[0][0].data
        .passwordHash as string;
      await expect(bcrypt.compare('NewPass456', savedHash)).resolves.toBe(true);
      expect(tokens.revokeOtherForUser).toHaveBeenCalledWith(
        'user-1',
        'current-cookie',
        prisma,
      );
    });
  });

  describe('addresses', () => {
    it('should automatically set the first address as default', async () => {
      prisma.address.count.mockResolvedValue(0);
      prisma.address.create.mockResolvedValue({
        id: 'addr-1',
        ...addressInput,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const created = await service.createAddress('user-1', {
        ...addressInput,
        isDefault: false,
      });

      expect(prisma.address.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isDefault: true }),
        }),
      );
      expect(prisma.address.updateMany).not.toHaveBeenCalled();
      expect(created.isDefault).toBe(true);
    });

    it('should unset previous default address when creating a new default address', async () => {
      prisma.address.count.mockResolvedValue(2);
      prisma.address.updateMany.mockResolvedValue({ count: 1 });
      prisma.address.create.mockResolvedValue({
        id: 'addr-3',
        ...addressInput,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      await service.createAddress('user-1', {
        ...addressInput,
        isDefault: true,
      });

      expect(prisma.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDefault: true },
        data: { isDefault: false },
      });
    });

    it('should reject creating an 11th address with ADDRESS_LIMIT_REACHED', async () => {
      prisma.address.count.mockResolvedValue(MAX_ADDRESSES_PER_USER);

      await expect(
        service.createAddress('user-1', addressInput),
      ).rejects.toMatchObject({
        code: 'ADDRESS_LIMIT_REACHED',
        status: 400,
      });
      expect(prisma.address.create).not.toHaveBeenCalled();
    });

    it('should return 404 ADDRESS_NOT_FOUND when editing another user address (IDOR protection)', async () => {
      prisma.address.findFirst.mockResolvedValue(null);

      await expect(
        service.updateAddress('user-1', 'addr-of-user-2', { street: 'Hacked' }),
      ).rejects.toMatchObject({
        code: 'ADDRESS_NOT_FOUND',
        status: 404,
      });
    });

    it('should unset old default when promoting another address to default', async () => {
      prisma.address.findFirst.mockResolvedValue({
        id: 'addr-2',
        isDefault: false,
      } as never);
      prisma.address.updateMany.mockResolvedValue({ count: 1 });
      prisma.address.update.mockResolvedValue({
        id: 'addr-2',
        ...addressInput,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const updated = await service.updateAddress('user-1', 'addr-2', {
        isDefault: true,
      });

      expect(prisma.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDefault: true },
        data: { isDefault: false },
      });
      expect(updated.isDefault).toBe(true);
    });

    it('should promote the newest remaining address when deleting the default address', async () => {
      prisma.address.findFirst
        .mockResolvedValueOnce({ id: 'addr-1', isDefault: true } as never)
        .mockResolvedValueOnce({ id: 'addr-2' } as never);
      prisma.address.delete.mockResolvedValue({ id: 'addr-1' } as never);
      prisma.address.update.mockResolvedValue({
        id: 'addr-2',
        isDefault: true,
      } as never);

      await service.deleteAddress('user-1', 'addr-1');

      expect(prisma.address.delete).toHaveBeenCalledWith({
        where: { id: 'addr-1' },
      });
      expect(prisma.address.update).toHaveBeenCalledWith({
        where: { id: 'addr-2' },
        data: { isDefault: true },
      });
    });

    it('should throw 404 ADDRESS_NOT_FOUND when deleting another user address', async () => {
      prisma.address.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteAddress('user-1', 'addr-of-user-2'),
      ).rejects.toMatchObject({
        code: 'ADDRESS_NOT_FOUND',
        status: 404,
      });
    });
  });
});
