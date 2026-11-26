import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Role } from '../../common/auth/auth-user';
import { AppException, ErrorCode } from '../../common/errors/error-codes';
import { appendSlugSuffix, slugify } from '../../common/utils/slugify';
import { Prisma, SellerStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../../upload/cloudinary.service';
import {
  RegisterSellerDto,
  UpdateSellerProfileDto,
} from './dto/register-seller.dto';
import {
  SellerDailyRevenueDto,
  SellerDto,
  SellerStatsOverviewDto,
  SellerTopProductDto,
  SellerWithStoreDto,
  StoreDto,
  StorePublicDto,
} from './dto/seller-response.dto';
import {
  AdminSellerTargetStatus,
  SellerRevenueQueryDto,
  SellerStatsRangeQueryDto,
  SellerTopProductsQueryDto,
  UpdateSellerStatusDto,
  UpdateStoreDto,
} from './dto/update-store.dto';

const MAX_SLUG_ATTEMPTS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STATS_DAYS = 30;
const MAX_REVENUE_RANGE_DAYS = 90;

/** Chuyển trạng thái hợp lệ của hồ sơ seller (doc 05 mục 14.2). */
const ALLOWED_SELLER_TRANSITIONS: Record<SellerStatus, Set<SellerStatus>> = {
  PENDING: new Set<SellerStatus>([
    SellerStatus.APPROVED,
    SellerStatus.REJECTED,
  ]),
  APPROVED: new Set<SellerStatus>([SellerStatus.SUSPENDED]),
  SUSPENDED: new Set<SellerStatus>([SellerStatus.APPROVED]),
  REJECTED: new Set<SellerStatus>(),
};

const SELLER_SELECT = {
  id: true,
  userId: true,
  businessName: true,
  phone: true,
  taxCode: true,
  status: true,
  rejectionReason: true,
  approvedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SellerSelect;

const STORE_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  logoUrl: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.StoreSelect;

@Injectable()
export class SellersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Đăng ký hồ sơ người bán (doc 03 mục 6.3, doc 05 mục 5.1):
   * Tạo `sellers` (PENDING) và `stores` trong một transaction.
   */
  async register(
    userId: string,
    dto: RegisterSellerDto,
  ): Promise<SellerWithStoreDto> {
    const existing = await this.prisma.seller.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (existing) {
      throw sellerAlreadyRegistered();
    }

    const baseSlug = slugify(dto.storeName, 200);
    let candidateSlug = baseSlug;

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const seller = await tx.seller.create({
            data: {
              userId,
              businessName: dto.businessName,
              phone: dto.phone,
              taxCode: dto.taxCode ?? null,
              status: SellerStatus.PENDING,
            },
            select: SELLER_SELECT,
          });

          const store = await tx.store.create({
            data: {
              sellerId: seller.id,
              name: dto.storeName,
              slug: candidateSlug,
              description: dto.storeDescription ?? null,
            },
            select: STORE_SELECT,
          });

          return { seller, store };
        });
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }
        // Nếu xung đột ở sellers.user_id (gửi đăng ký song song) → báo đã đăng ký.
        const nowExisting = await this.prisma.seller.findUnique({
          where: { userId },
          select: { id: true },
        });
        if (nowExisting) {
          throw sellerAlreadyRegistered();
        }
        candidateSlug = appendSlugSuffix(baseSlug, undefined, 255);
      }
    }

    throw new AppException(
      ErrorCode.CONFLICT,
      'Không thể tạo đường dẫn cửa hàng duy nhất, vui lòng thử lại',
      HttpStatus.CONFLICT,
    );
  }

  async getMySeller(userId: string): Promise<SellerWithStoreDto> {
    const seller = await this.prisma.seller.findUnique({
      where: { userId },
      select: {
        ...SELLER_SELECT,
        store: { select: STORE_SELECT },
      },
    });
    if (!seller || !seller.store) {
      throw sellerNotFound();
    }

    const { store, ...sellerData } = seller;
    return { seller: sellerData, store };
  }

  /**
   * Sửa hồ sơ seller: nếu đang REJECTED thì tự động chuyển về PENDING để Admin duyệt lại;
   * nếu đang SUSPENDED thì từ chối với 409 INVALID_SELLER_STATUS (doc 05 mục 5.1).
   */
  async updateMySeller(
    userId: string,
    dto: UpdateSellerProfileDto,
  ): Promise<SellerWithStoreDto> {
    const existing = await this.prisma.seller.findUnique({
      where: { userId },
      select: {
        id: true,
        status: true,
        store: { select: { id: true } },
      },
    });
    if (!existing || !existing.store) {
      throw sellerNotFound();
    }

    if (existing.status === SellerStatus.SUSPENDED) {
      throw new AppException(
        ErrorCode.INVALID_SELLER_STATUS,
        'Hồ sơ người bán đang bị tạm ngưng, không thể chỉnh sửa',
        HttpStatus.CONFLICT,
      );
    }

    const reopenToPending = existing.status === SellerStatus.REJECTED;
    const storeId = existing.store.id;

    return this.prisma.$transaction(async (tx) => {
      const seller = await tx.seller.update({
        where: { id: existing.id },
        data: {
          ...(dto.businessName !== undefined
            ? { businessName: dto.businessName }
            : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.taxCode !== undefined ? { taxCode: dto.taxCode } : {}),
          ...(reopenToPending
            ? { status: SellerStatus.PENDING, rejectionReason: null }
            : {}),
        },
        select: SELLER_SELECT,
      });

      const store = await tx.store.update({
        where: { id: storeId },
        data: {
          ...(dto.storeName !== undefined ? { name: dto.storeName } : {}),
          ...(dto.storeDescription !== undefined
            ? { description: dto.storeDescription }
            : {}),
        },
        select: STORE_SELECT,
      });

      return { seller, store };
    });
  }

  /**
   * Duyệt / từ chối / tạm ngưng / mở lại hồ sơ seller (Admin – doc 05 mục 14.2).
   * Export để AdminModule (T-22) dùng chung cùng logic và domain event.
   */
  async updateSellerStatus(
    sellerId: string,
    dto: UpdateSellerStatusDto,
  ): Promise<SellerDto> {
    const existing = await this.prisma.seller.findUnique({
      where: { id: sellerId },
      select: { id: true, userId: true, status: true },
    });
    if (!existing) {
      throw sellerNotFound();
    }

    const targetStatus = dto.status as SellerStatus;
    if (!ALLOWED_SELLER_TRANSITIONS[existing.status]?.has(targetStatus)) {
      throw new AppException(
        ErrorCode.INVALID_SELLER_STATUS,
        `Không thể chuyển trạng thái người bán từ ${existing.status} sang ${targetStatus}`,
        HttpStatus.CONFLICT,
      );
    }

    const requiresReason =
      dto.status === AdminSellerTargetStatus.REJECTED ||
      dto.status === AdminSellerTargetStatus.SUSPENDED;
    if (requiresReason && !dto.reason) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Vui lòng nhập lý do khi từ chối hoặc tạm ngưng người bán',
        HttpStatus.BAD_REQUEST,
        [{ field: 'reason', message: 'Lý do không được để trống' }],
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const seller = await tx.seller.update({
        where: { id: existing.id },
        data: {
          status: targetStatus,
          ...(targetStatus === SellerStatus.APPROVED
            ? {
                approvedAt: new Date(),
                rejectionReason: null,
              }
            : {
                rejectionReason: dto.reason ?? null,
              }),
        },
        select: SELLER_SELECT,
      });

      // Khi được duyệt (PENDING -> APPROVED hoặc SUSPENDED -> APPROVED), đảm bảo user có role SELLER.
      if (targetStatus === SellerStatus.APPROVED) {
        const sellerRole = await tx.role.findUnique({
          where: { name: Role.SELLER },
        });
        if (!sellerRole) {
          throw new Error(
            'Bảng roles chưa có SELLER. Chạy `npx prisma db seed` để tạo roles.',
          );
        }
        await tx.userRole.upsert({
          where: {
            userId_roleId: { userId: existing.userId, roleId: sellerRole.id },
          },
          update: {},
          create: { userId: existing.userId, roleId: sellerRole.id },
        });
      }

      return seller;
    });

    // Phát domain event sau khi transaction commit (doc 03 mục 4).
    if (
      existing.status === SellerStatus.PENDING &&
      targetStatus === SellerStatus.APPROVED
    ) {
      this.events.emit('seller.approved', {
        sellerId: updated.id,
        userId: updated.userId,
      });
    } else if (targetStatus === SellerStatus.REJECTED) {
      this.events.emit('seller.rejected', {
        sellerId: updated.id,
        userId: updated.userId,
        reason: updated.rejectionReason,
      });
    }

    return updated;
  }

  /** Trang cửa hàng công khai kèm số lượng sản phẩm ACTIVE (doc 05 mục 5.2). */
  async getPublicStoreBySlug(slug: string): Promise<StorePublicDto> {
    const store = await this.prisma.store.findFirst({
      where: {
        slug,
        seller: { status: SellerStatus.APPROVED },
      },
      select: {
        ...STORE_SELECT,
        _count: {
          select: {
            products: {
              where: { status: 'ACTIVE', deletedAt: null },
            },
          },
        },
      },
    });

    if (!store) {
      throw new AppException(
        ErrorCode.STORE_NOT_FOUND,
        'Không tìm thấy cửa hàng',
        HttpStatus.NOT_FOUND,
      );
    }

    const { _count, ...storeData } = store;
    return {
      ...storeData,
      productCount: _count.products,
    };
  }

  async updateMyStore(storeId: string, dto: UpdateStoreDto): Promise<StoreDto> {
    return this.prisma.store.update({
      where: { id: storeId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
      },
      select: STORE_SELECT,
    });
  }

  async uploadStoreLogo(
    storeId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ logoUrl: string }> {
    const uploaded = await this.cloudinary.uploadImage(
      file as Express.Multer.File,
      'marketplace/stores',
    );

    await this.prisma.store.update({
      where: { id: storeId },
      data: { logoUrl: uploaded.url },
    });

    return { logoUrl: uploaded.url };
  }

  /**
   * Tổng quan doanh thu và vận hành của store (doc 05 mục 5.3).
   * Doanh thu chỉ tính seller order ở trạng thái COMPLETED.
   */
  async getStatsOverview(
    storeId: string,
    query: SellerStatsRangeQueryDto,
  ): Promise<SellerStatsOverviewDto> {
    const { fromDate, toDate } = resolveDateRange(
      query.from,
      query.to,
      DEFAULT_STATS_DAYS,
    );

    const [
      completedAgg,
      orderCount,
      pendingOrderCount,
      productCount,
      lowStockRows,
    ] = await Promise.all([
      this.prisma.sellerOrder.aggregate({
        where: {
          storeId,
          status: 'COMPLETED',
          completedAt: { gte: fromDate, lte: toDate },
        },
        _sum: { total: true },
      }),
      this.prisma.sellerOrder.count({
        where: {
          storeId,
          createdAt: { gte: fromDate, lte: toDate },
        },
      }),
      this.prisma.sellerOrder.count({
        where: { storeId, status: 'PENDING' },
      }),
      this.prisma.product.count({
        where: { storeId, deletedAt: null },
      }),
      this.prisma.$queryRaw<Array<{ count: bigint | number }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM product_variants pv
        INNER JOIN products p ON p.id = pv.product_id
        INNER JOIN inventory inv ON inv.variant_id = pv.id
        WHERE p.store_id = ${storeId}::uuid
          AND p.deleted_at IS NULL
          AND pv.is_active = true
          AND inv.quantity <= inv.low_stock_threshold
      `),
    ]);

    return {
      revenue: completedAgg._sum.total ?? 0,
      orderCount,
      pendingOrderCount,
      productCount,
      lowStockCount: Number(lowStockRows[0]?.count ?? 0),
    };
  }

  /** Doanh thu theo ngày của store (tối đa 90 ngày, chỉ tính COMPLETED). */
  async getDailyRevenue(
    storeId: string,
    query: SellerRevenueQueryDto,
  ): Promise<SellerDailyRevenueDto[]> {
    const { fromDate, toDate } = resolveDateRange(
      query.from,
      query.to,
      DEFAULT_STATS_DAYS,
      MAX_REVENUE_RANGE_DAYS,
    );

    const rows = await this.prisma.$queryRaw<
      Array<{
        date: string;
        revenue: bigint | number;
        order_count: bigint | number;
      }>
    >(Prisma.sql`
      SELECT
        to_char(completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
        COALESCE(SUM(total), 0)::bigint AS revenue,
        COUNT(*)::bigint AS order_count
      FROM seller_orders
      WHERE store_id = ${storeId}::uuid
        AND status = 'COMPLETED'::"seller_order_status"
        AND completed_at >= ${fromDate}
        AND completed_at <= ${toDate}
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    return rows.map((row) => ({
      date: row.date,
      revenue: Number(row.revenue),
      orderCount: Number(row.order_count),
    }));
  }

  /** Top sản phẩm bán chạy của store (chỉ tính đơn COMPLETED). */
  async getTopProducts(
    storeId: string,
    query: SellerTopProductsQueryDto,
  ): Promise<SellerTopProductDto[]> {
    const { fromDate, toDate } = resolveDateRange(
      query.from,
      query.to,
      DEFAULT_STATS_DAYS,
    );
    const limit = query.limit ?? 5;

    const rows = await this.prisma.$queryRaw<
      Array<{
        product_id: string;
        name: string;
        quantity_sold: bigint | number;
        revenue: bigint | number;
      }>
    >(Prisma.sql`
      SELECT
        oi.product_id AS product_id,
        COALESCE(p.name, MAX(oi.product_name)) AS name,
        SUM(oi.quantity)::bigint AS quantity_sold,
        SUM(oi.line_total)::bigint AS revenue
      FROM order_items oi
      INNER JOIN seller_orders so ON so.id = oi.seller_order_id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE so.store_id = ${storeId}::uuid
        AND so.status = 'COMPLETED'::"seller_order_status"
        AND so.completed_at >= ${fromDate}
        AND so.completed_at <= ${toDate}
      GROUP BY oi.product_id, p.name
      ORDER BY quantity_sold DESC, revenue DESC, oi.product_id ASC
      LIMIT ${limit}
    `);

    return rows.map((row) => ({
      productId: row.product_id,
      name: row.name,
      quantitySold: Number(row.quantity_sold),
      revenue: Number(row.revenue),
    }));
  }
}

export function resolveDateRange(
  from?: string,
  to?: string,
  defaultDays = DEFAULT_STATS_DAYS,
  maxDays?: number,
): { fromDate: Date; toDate: Date } {
  const now = new Date();
  const toDate = to ? parseEndOfDay(to) : now;
  const fromDate = from
    ? parseStartOfDay(from)
    : new Date(toDate.getTime() - defaultDays * DAY_MS);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new AppException(
      ErrorCode.VALIDATION_ERROR,
      'Khoảng ngày không hợp lệ',
      HttpStatus.BAD_REQUEST,
    );
  }

  if (fromDate.getTime() > toDate.getTime()) {
    throw new AppException(
      ErrorCode.VALIDATION_ERROR,
      'Ngày bắt đầu không được lớn hơn ngày kết thúc',
      HttpStatus.BAD_REQUEST,
      [{ field: 'from', message: 'from không được lớn hơn to' }],
    );
  }

  if (maxDays !== undefined) {
    const diffDays = (toDate.getTime() - fromDate.getTime()) / DAY_MS;
    if (diffDays > maxDays + 1) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        `Khoảng thời gian thống kê tối đa là ${maxDays} ngày`,
        HttpStatus.BAD_REQUEST,
        [
          {
            field: 'to',
            message: `Khoảng thời gian tối đa là ${maxDays} ngày`,
          },
        ],
      );
    }
  }

  return { fromDate, toDate };
}

function parseStartOfDay(input: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(input)
    ? new Date(`${input}T00:00:00.000Z`)
    : new Date(input);
}

function parseEndOfDay(input: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(input)
    ? new Date(`${input}T23:59:59.999Z`)
    : new Date(input);
}

function sellerNotFound(): AppException {
  return new AppException(
    ErrorCode.SELLER_NOT_FOUND,
    'Không tìm thấy hồ sơ người bán',
    HttpStatus.NOT_FOUND,
  );
}

function sellerAlreadyRegistered(): AppException {
  return new AppException(
    ErrorCode.SELLER_ALREADY_REGISTERED,
    'Tài khoản này đã gửi hồ sơ đăng ký người bán',
    HttpStatus.CONFLICT,
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
