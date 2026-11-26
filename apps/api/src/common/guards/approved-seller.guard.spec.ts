import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedRequest, Role } from '../auth/auth-user';
import { ApprovedSellerGuard } from './approved-seller.guard';

describe('ApprovedSellerGuard', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let guard: ApprovedSellerGuard;

  const makeContext = (request: Partial<AuthenticatedRequest>) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    guard = new ApprovedSellerGuard(prisma);
  });

  it('should throw 401 when user is not authenticated', async () => {
    await expect(guard.canActivate(makeContext({}))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw 403 FORBIDDEN when a plain CUSTOMER without seller profile calls /api/seller/*', async () => {
    prisma.seller.findUnique.mockResolvedValue(null);

    await expect(
      guard.canActivate(
        makeContext({
          user: { id: 'u1', email: 'c@example.com', roles: [Role.CUSTOMER] },
        }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it.each(['PENDING', 'REJECTED', 'SUSPENDED'] as const)(
    'should throw 403 SELLER_NOT_APPROVED when seller status is %s',
    async (status) => {
      prisma.seller.findUnique.mockResolvedValue({
        id: 'sel-1',
        status,
        store: { id: 'store-1', slug: 'shop-1' },
      } as never);

      await expect(
        guard.canActivate(
          makeContext({
            user: { id: 'u1', email: 's@example.com', roles: [Role.CUSTOMER] },
          }),
        ),
      ).rejects.toMatchObject({
        code: 'SELLER_NOT_APPROVED',
        status: 403,
      });
    },
  );

  it('should attach sellerStore to request and allow APPROVED seller', async () => {
    prisma.seller.findUnique.mockResolvedValue({
      id: 'sel-1',
      status: 'APPROVED',
      store: { id: 'store-1', slug: 'shop-an' },
    } as never);

    const req: Partial<AuthenticatedRequest> = {
      user: {
        id: 'u1',
        email: 's@example.com',
        roles: [Role.CUSTOMER, Role.SELLER],
      },
    };

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(req.sellerStore).toEqual({
      sellerId: 'sel-1',
      storeId: 'store-1',
      storeSlug: 'shop-an',
    });
  });
});
