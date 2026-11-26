import { EventEmitter2 } from '@nestjs/event-emitter';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { Prisma, SellerStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../../upload/cloudinary.service';
import { AdminSellerTargetStatus } from './dto/update-store.dto';
import { resolveDateRange, SellersService } from './sellers.service';

describe('SellersService (T-12)', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let cloudinary: DeepMockProxy<CloudinaryService>;
  let events: DeepMockProxy<EventEmitter2>;
  let service: SellersService;

  const sellerRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'seller-1',
    userId: 'user-1',
    businessName: 'Minh An Co.',
    phone: '0901234567',
    taxCode: '0109999999',
    status: SellerStatus.PENDING,
    rejectionReason: null,
    approvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const storeRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'store-1',
    name: 'Minh An Shop',
    slug: 'minh-an-shop',
    description: 'Thời trang',
    logoUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    (prisma.$transaction as unknown as jest.Mock).mockImplementation(
      (fn: (tx: PrismaService) => unknown) => fn(prisma),
    );
    cloudinary = mockDeep<CloudinaryService>();
    events = mockDeep<EventEmitter2>();
    service = new SellersService(prisma, cloudinary, events);
  });

  describe('register', () => {
    const dto = {
      businessName: 'Minh An Co.',
      phone: '0901234567',
      storeName: 'Minh An Shop',
      storeDescription: 'Thời trang',
    };

    it('should create seller (PENDING) and store in a transaction', async () => {
      prisma.seller.findUnique.mockResolvedValue(null);
      prisma.seller.create.mockResolvedValue(sellerRecord() as never);
      prisma.store.create.mockResolvedValue(storeRecord() as never);

      const res = await service.register('user-1', dto);

      expect(res.seller.status).toBe(SellerStatus.PENDING);
      expect(res.store.slug).toBe('minh-an-shop');
    });

    it('should reject duplicate seller registration with SELLER_ALREADY_REGISTERED', async () => {
      prisma.seller.findUnique.mockResolvedValue({ id: 'seller-1' } as never);

      await expect(service.register('user-1', dto)).rejects.toMatchObject({
        code: 'SELLER_ALREADY_REGISTERED',
        status: 409,
      });
      expect(prisma.seller.create).not.toHaveBeenCalled();
    });

    it('should retry with a suffixed store slug on P2002 collision', async () => {
      prisma.seller.findUnique.mockResolvedValue(null);
      prisma.seller.create.mockResolvedValue(sellerRecord() as never);
      prisma.store.create
        .mockRejectedValueOnce(
          new Prisma.PrismaClientKnownRequestError('Unique failed', {
            code: 'P2002',
            clientVersion: 'test',
          }),
        )
        .mockResolvedValueOnce(
          storeRecord({ slug: 'minh-an-shop-ab12' }) as never,
        );

      const res = await service.register('user-1', dto);

      expect(prisma.store.create).toHaveBeenCalledTimes(2);
      expect(res.store.slug).toBe('minh-an-shop-ab12');
    });
  });

  describe('updateMySeller', () => {
    it('should reset a REJECTED seller profile back to PENDING and clear rejectionReason', async () => {
      prisma.seller.findUnique.mockResolvedValue({
        id: 'seller-1',
        status: SellerStatus.REJECTED,
        store: { id: 'store-1' },
      } as never);
      prisma.seller.update.mockResolvedValue(
        sellerRecord({ status: SellerStatus.PENDING }) as never,
      );
      prisma.store.update.mockResolvedValue(storeRecord() as never);

      const res = await service.updateMySeller('user-1', {
        businessName: 'Minh An Fixed',
      });

      expect(prisma.seller.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: SellerStatus.PENDING,
            rejectionReason: null,
          }),
        }),
      );
      expect(res.seller.status).toBe(SellerStatus.PENDING);
    });

    it('should reject editing a SUSPENDED seller profile with INVALID_SELLER_STATUS', async () => {
      prisma.seller.findUnique.mockResolvedValue({
        id: 'seller-1',
        status: SellerStatus.SUSPENDED,
        store: { id: 'store-1' },
      } as never);

      await expect(
        service.updateMySeller('user-1', { businessName: 'New' }),
      ).rejects.toMatchObject({
        code: 'INVALID_SELLER_STATUS',
        status: 409,
      });
    });
  });

  describe('updateSellerStatus', () => {
    it('should approve PENDING seller, assign SELLER role, and emit seller.approved event', async () => {
      prisma.seller.findUnique.mockResolvedValue({
        id: 'seller-1',
        userId: 'user-1',
        status: SellerStatus.PENDING,
      } as never);
      prisma.seller.update.mockResolvedValue(
        sellerRecord({
          status: SellerStatus.APPROVED,
          approvedAt: new Date(),
        }) as never,
      );
      prisma.role.findUnique.mockResolvedValue({ id: 2, name: 'SELLER' });
      prisma.userRole.upsert.mockResolvedValue({ userId: 'user-1', roleId: 2 });

      const updated = await service.updateSellerStatus('seller-1', {
        status: AdminSellerTargetStatus.APPROVED,
      });

      expect(updated.status).toBe(SellerStatus.APPROVED);
      expect(prisma.userRole.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { userId: 'user-1', roleId: 2 },
        }),
      );
      expect(events.emit).toHaveBeenCalledWith('seller.approved', {
        sellerId: 'seller-1',
        userId: 'user-1',
      });
    });

    it('should reject invalid state transitions with 409 INVALID_SELLER_STATUS', async () => {
      prisma.seller.findUnique.mockResolvedValue({
        id: 'seller-1',
        userId: 'user-1',
        status: SellerStatus.REJECTED,
      } as never);

      await expect(
        service.updateSellerStatus('seller-1', {
          status: AdminSellerTargetStatus.APPROVED,
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_SELLER_STATUS',
        status: 409,
      });
    });

    it('should require reason when rejecting or suspending a seller', async () => {
      prisma.seller.findUnique.mockResolvedValue({
        id: 'seller-1',
        userId: 'user-1',
        status: SellerStatus.PENDING,
      } as never);

      await expect(
        service.updateSellerStatus('seller-1', {
          status: AdminSellerTargetStatus.REJECTED,
        }),
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        status: 400,
      });
    });

    it('should emit seller.rejected when rejecting with a reason', async () => {
      prisma.seller.findUnique.mockResolvedValue({
        id: 'seller-1',
        userId: 'user-1',
        status: SellerStatus.PENDING,
      } as never);
      prisma.seller.update.mockResolvedValue(
        sellerRecord({
          status: SellerStatus.REJECTED,
          rejectionReason: 'Thiếu giấy tờ',
        }) as never,
      );

      await service.updateSellerStatus('seller-1', {
        status: AdminSellerTargetStatus.REJECTED,
        reason: 'Thiếu giấy tờ',
      });

      expect(events.emit).toHaveBeenCalledWith('seller.rejected', {
        sellerId: 'seller-1',
        userId: 'user-1',
        reason: 'Thiếu giấy tờ',
      });
    });
  });

  describe('public store & stats', () => {
    it('should return approved public store with active productCount and 404 for unapproved/missing', async () => {
      prisma.store.findFirst.mockResolvedValueOnce({
        ...storeRecord(),
        _count: { products: 12 },
      } as never);

      const store = await service.getPublicStoreBySlug('minh-an-shop');
      expect(store.productCount).toBe(12);

      prisma.store.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.getPublicStoreBySlug('suspended-shop'),
      ).rejects.toMatchObject({ code: 'STORE_NOT_FOUND', status: 404 });
    });

    it('should reject revenue stats date ranges longer than 90 days or reversed', () => {
      expect(() => resolveDateRange('2026-11-20', '2026-11-01', 30)).toThrow(
        expect.objectContaining({ code: 'VALIDATION_ERROR', status: 400 }),
      );
      expect(() =>
        resolveDateRange('2026-01-01', '2026-06-01', 30, 90),
      ).toThrow(
        expect.objectContaining({ code: 'VALIDATION_ERROR', status: 400 }),
      );
    });
  });
});
