import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedRequest, Role } from '../auth/auth-user';
import { AppException, ErrorCode } from '../errors/error-codes';

/**
 * Guard bảo vệ mọi endpoint `/api/seller/*` (doc 05 mục 1.3, 1.6 và doc 08 IT-02, IT-04):
 * - Chưa đăng nhập → 401 UNAUTHORIZED.
 * - Có hồ sơ seller nhưng chưa APPROVED (PENDING, REJECTED, SUSPENDED) → 403 SELLER_NOT_APPROVED.
 * - Customer thuần (chưa đăng ký seller và không có role SELLER) → 403 FORBIDDEN.
 * - Đã APPROVED và có store → gắn `request.sellerStore` để controller dùng qua `@CurrentStore()`.
 */
@Injectable()
export class ApprovedSellerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException();
    }

    const seller = await this.prisma.seller.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        status: true,
        store: { select: { id: true, slug: true } },
      },
    });

    if (!seller) {
      if (user.roles.includes(Role.SELLER)) {
        throw sellerNotApproved();
      }
      throw new ForbiddenException();
    }

    if (seller.status !== 'APPROVED' || !seller.store) {
      throw sellerNotApproved();
    }

    request.sellerStore = {
      sellerId: seller.id,
      storeId: seller.store.id,
      storeSlug: seller.store.slug,
    };
    return true;
  }
}

function sellerNotApproved(): AppException {
  return new AppException(
    ErrorCode.SELLER_NOT_APPROVED,
    'Tài khoản người bán chưa được duyệt hoặc đang bị tạm ngưng',
    HttpStatus.FORBIDDEN,
  );
}
