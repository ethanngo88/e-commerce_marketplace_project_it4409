/**
 * Seed data (T-09). Chạy: `npx prisma db seed` trong thư mục apps/api.
 *
 * - Development/test: roles, Admin, cây danh mục, 2 seller đã duyệt kèm store và
 *   sản phẩm, 1 customer có địa chỉ (tài khoản test ở doc 08 mục 5).
 * - NODE_ENV=production: chỉ roles, Admin và danh mục (doc 09 mục 6.2).
 *
 * Chạy lại nhiều lần không lỗi: mỗi bản ghi chỉ được tạo khi chưa có (tìm theo
 * email, slug...), bản ghi đã có giữ nguyên. Muốn dữ liệu về trạng thái ban đầu thì
 * chạy `npx prisma migrate reset` rồi seed lại.
 *
 * Ảnh sản phẩm là ảnh giữ chỗ (placehold.co), không nằm trên Cloudinary;
 * `public_id` của chúng có tiền tố `seed/`.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import {
  PrismaClient,
  ProductStatus,
  SellerStatus,
} from '../src/generated/prisma/client';
import {
  CATEGORY_TREE,
  MIN_ACTIVE_PRODUCTS,
  ROLE_NAMES,
  RoleName,
  SEED_CUSTOMER,
  SEED_SELLERS,
  SeedProduct,
  SeedUser,
} from './seed-data';

const IMAGES_PER_PRODUCT = 2;

type Stats = Map<string, { created: number; existing: number }>;

function track(stats: Stats, label: string, created: boolean): void {
  const entry = stats.get(label) ?? { created: 0, existing: 0 };
  if (created) {
    entry.created += 1;
  } else {
    entry.existing += 1;
  }
  stats.set(label, entry);
}

// ---------------------------------------------------------------------------
// Biến môi trường
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Thiếu biến môi trường ${name}. Xem apps/api/.env.example và docs/09_Deployment_Guide.md mục 3.`,
    );
  }
  return value;
}

/** Cùng quy tắc mật khẩu với API đăng ký (doc 05 mục 3), để đăng nhập được qua giao diện. */
function requirePassword(name: string): string {
  const value = requireEnv(name);
  const valid =
    value.length >= 8 &&
    value.length <= 72 &&
    /[A-Za-z]/.test(value) &&
    /\d/.test(value);
  if (!valid) {
    throw new Error(
      `${name} phải dài 8–72 ký tự, có ít nhất một chữ cái và một chữ số.`,
    );
  }
  return value;
}

function bcryptRounds(): number {
  const rounds = Number(process.env.BCRYPT_ROUNDS?.trim() || 10);
  if (!Number.isInteger(rounds) || rounds < 4) {
    throw new Error('BCRYPT_ROUNDS phải là số nguyên ≥ 4.');
  }
  return rounds;
}

// ---------------------------------------------------------------------------
// Kiểm tra dữ liệu mẫu trước khi ghi
// ---------------------------------------------------------------------------

/** Bắt lỗi trong seed-data.ts sớm, thay vì để database báo lỗi giữa chừng. */
function assertSeedDataValid(): void {
  const errors: string[] = [];
  const leafSlugs = new Set<string>();
  const categorySlugs = new Set<string>();

  for (const parent of CATEGORY_TREE) {
    for (const category of [parent, ...(parent.children ?? [])]) {
      if (categorySlugs.has(category.slug)) {
        errors.push(`Trùng slug danh mục: ${category.slug}`);
      }
      categorySlugs.add(category.slug);
    }
    if ((parent.children ?? []).length === 0) {
      leafSlugs.add(parent.slug);
    }
    for (const child of parent.children ?? []) {
      if ((child.children ?? []).length > 0) {
        errors.push(`Danh mục ${child.slug} vượt quá 2 cấp`);
      }
      leafSlugs.add(child.slug);
    }
  }

  const productSlugs = new Set<string>();
  const storeSlugs = new Set<string>();
  let activeCount = 0;

  for (const seller of SEED_SELLERS) {
    if (storeSlugs.has(seller.store.slug)) {
      errors.push(`Trùng slug store: ${seller.store.slug}`);
    }
    storeSlugs.add(seller.store.slug);

    for (const product of seller.products) {
      const where = `Sản phẩm ${product.slug}`;
      if (productSlugs.has(product.slug)) {
        errors.push(`${where}: trùng slug`);
      }
      productSlugs.add(product.slug);

      if (!leafSlugs.has(product.categorySlug)) {
        errors.push(
          `${where}: danh mục ${product.categorySlug} không tồn tại hoặc không phải danh mục lá`,
        );
      }

      const skus = new Set<string>();
      for (const variant of product.variants) {
        if (skus.has(variant.sku)) {
          errors.push(`${where}: trùng SKU ${variant.sku}`);
        }
        skus.add(variant.sku);
        if (!Number.isInteger(variant.price) || variant.price <= 0) {
          errors.push(`${where}: giá của ${variant.sku} phải là số nguyên > 0`);
        }
        if (!Number.isInteger(variant.stock) || variant.stock < 0) {
          errors.push(
            `${where}: tồn kho của ${variant.sku} phải là số nguyên ≥ 0`,
          );
        }
      }

      if (!product.variants.some((variant) => variant.isActive !== false)) {
        errors.push(`${where}: cần ít nhất một variant đang bật`);
      }
      if ((product.status ?? 'ACTIVE') === 'ACTIVE') {
        activeCount += 1;
      }
    }
  }

  if (activeCount < MIN_ACTIVE_PRODUCTS) {
    errors.push(
      `Chỉ có ${activeCount} sản phẩm ACTIVE, cần ít nhất ${MIN_ACTIVE_PRODUCTS}`,
    );
  }

  if (errors.length > 0) {
    throw new Error(`Dữ liệu seed không hợp lệ:\n- ${errors.join('\n- ')}`);
  }
}

// ---------------------------------------------------------------------------
// Các bước seed
// ---------------------------------------------------------------------------

async function seedRoles(
  prisma: PrismaClient,
  stats: Stats,
): Promise<Map<RoleName, number>> {
  const roleIds = new Map<RoleName, number>();
  for (const name of ROLE_NAMES) {
    const existing = await prisma.role.findUnique({ where: { name } });
    const role = existing ?? (await prisma.role.create({ data: { name } }));
    track(stats, 'Role', !existing);
    roleIds.set(name, role.id);
  }
  return roleIds;
}

async function ensureUser(
  prisma: PrismaClient,
  stats: Stats,
  roleIds: Map<RoleName, number>,
  input: SeedUser & { password: string; roles: RoleName[] },
  rounds: number,
): Promise<string> {
  // Email luôn lưu chữ thường (doc 04 mục 6.1).
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  const user =
    existing ??
    (await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(input.password, rounds),
        fullName: input.fullName,
        phone: input.phone || null,
      },
    }));
  track(stats, 'Tài khoản', !existing);

  // Gán role còn thiếu, kể cả với user đã có (ví dụ lần seed trước bị dừng giữa chừng).
  await prisma.userRole.createMany({
    data: input.roles.map((role) => ({
      userId: user.id,
      roleId: roleIds.get(role)!,
    })),
    skipDuplicates: true,
  });
  return user.id;
}

async function seedCategories(
  prisma: PrismaClient,
  stats: Stats,
): Promise<Map<string, string>> {
  const categoryIds = new Map<string, string>();

  const ensure = async (
    slug: string,
    name: string,
    sortOrder: number,
    isActive: boolean,
    parentId: string | null,
  ): Promise<string> => {
    const existing = await prisma.category.findUnique({ where: { slug } });
    const category =
      existing ??
      (await prisma.category.create({
        data: { slug, name, sortOrder, isActive, parentId },
      }));
    track(stats, 'Danh mục', !existing);
    categoryIds.set(slug, category.id);
    return category.id;
  };

  for (const [index, parent] of CATEGORY_TREE.entries()) {
    const parentId = await ensure(
      parent.slug,
      parent.name,
      index,
      parent.isActive ?? true,
      null,
    );
    for (const [childIndex, child] of (parent.children ?? []).entries()) {
      await ensure(
        child.slug,
        child.name,
        childIndex,
        child.isActive ?? true,
        parentId,
      );
    }
  }
  return categoryIds;
}

/** Ảnh giữ chỗ có chữ là tên sản phẩm không dấu. */
function placeholderImageUrls(product: SeedProduct): string[] {
  const label = product.slug.replace(/-/g, ' ');
  return Array.from(
    { length: IMAGES_PER_PRODUCT },
    (_, index) =>
      `https://placehold.co/800x800/png?text=${encodeURIComponent(`${label} ${index + 1}`)}`,
  );
}

async function ensureProduct(
  prisma: PrismaClient,
  stats: Stats,
  storeId: string,
  categoryId: string,
  product: SeedProduct,
): Promise<void> {
  const existing = await prisma.product.findUnique({
    where: { slug: product.slug },
    select: { id: true },
  });
  track(stats, 'Sản phẩm', !existing);
  if (existing) {
    return;
  }

  // min_price là giá thấp nhất của các variant đang bật (doc 04 mục 6.3).
  const minPrice = Math.min(
    ...product.variants
      .filter((variant) => variant.isActive !== false)
      .map((variant) => variant.price),
  );

  // Một lệnh create lồng nhau chạy trong một transaction: sản phẩm, ảnh, variant
  // và tồn kho cùng được tạo hoặc cùng không.
  await prisma.product.create({
    data: {
      storeId,
      categoryId,
      name: product.name,
      slug: product.slug,
      description: product.description,
      status: ProductStatus[product.status ?? 'ACTIVE'],
      minPrice,
      images: {
        create: placeholderImageUrls(product).map((url, index) => ({
          url,
          publicId: `seed/${product.slug}-${index + 1}`,
          sortOrder: index,
        })),
      },
      variants: {
        create: product.variants.map((variant) => ({
          sku: variant.sku,
          name: variant.name,
          attributes: variant.attributes,
          price: variant.price,
          isActive: variant.isActive ?? true,
          inventory: { create: { quantity: variant.stock } },
        })),
      },
    },
  });
}

async function seedSellers(
  prisma: PrismaClient,
  stats: Stats,
  roleIds: Map<RoleName, number>,
  categoryIds: Map<string, string>,
  password: string,
  rounds: number,
): Promise<void> {
  for (const definition of SEED_SELLERS) {
    // Seller vẫn là khách hàng: một tài khoản có thể có cả hai role (doc 04 mục 3.3).
    const userId = await ensureUser(
      prisma,
      stats,
      roleIds,
      { ...definition.user, password, roles: ['CUSTOMER', 'SELLER'] },
      rounds,
    );

    const existingSeller = await prisma.seller.findUnique({
      where: { userId },
    });
    const seller =
      existingSeller ??
      (await prisma.seller.create({
        data: {
          userId,
          businessName: definition.businessName,
          phone: definition.user.phone,
          status: SellerStatus.APPROVED,
          approvedAt: new Date(),
        },
      }));
    track(stats, 'Hồ sơ seller', !existingSeller);

    const existingStore = await prisma.store.findUnique({
      where: { sellerId: seller.id },
    });
    const store =
      existingStore ??
      (await prisma.store.create({
        data: {
          sellerId: seller.id,
          name: definition.store.name,
          slug: definition.store.slug,
          description: definition.store.description,
        },
      }));
    track(stats, 'Store', !existingStore);

    for (const product of definition.products) {
      await ensureProduct(
        prisma,
        stats,
        store.id,
        categoryIds.get(product.categorySlug)!,
        product,
      );
    }
  }
}

async function seedCustomer(
  prisma: PrismaClient,
  stats: Stats,
  roleIds: Map<RoleName, number>,
  password: string,
  rounds: number,
): Promise<void> {
  const userId = await ensureUser(
    prisma,
    stats,
    roleIds,
    { ...SEED_CUSTOMER, password, roles: ['CUSTOMER'] },
    rounds,
  );

  const addressCount = await prisma.address.count({ where: { userId } });
  if (addressCount === 0) {
    await prisma.address.create({
      data: { userId, ...SEED_CUSTOMER.address, isDefault: true },
    });
  }
  track(stats, 'Địa chỉ', addressCount === 0);
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  const rounds = bcryptRounds();
  const adminPassword = requirePassword('SEED_ADMIN_PASSWORD');
  const adminEmail = requireEnv('SEED_ADMIN_EMAIL');
  // Đọc hết biến bắt buộc trước khi ghi, để thiếu biến thì không ghi dở dang.
  const userPassword = isProduction
    ? null
    : requirePassword('SEED_USER_PASSWORD');
  if (!isProduction) {
    assertSeedDataValid();
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireEnv('DATABASE_URL') }),
  });
  const stats: Stats = new Map();

  try {
    const roleIds = await seedRoles(prisma, stats);
    await ensureUser(
      prisma,
      stats,
      roleIds,
      {
        email: adminEmail,
        fullName: 'Quản trị viên',
        phone: '',
        password: adminPassword,
        roles: ['ADMIN'],
      },
      rounds,
    );
    const categoryIds = await seedCategories(prisma, stats);

    if (userPassword !== null) {
      await seedSellers(
        prisma,
        stats,
        roleIds,
        categoryIds,
        userPassword,
        rounds,
      );
      await seedCustomer(prisma, stats, roleIds, userPassword, rounds);
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(
    `Seed xong (${isProduction ? 'production: chỉ roles, Admin, danh mục' : 'đầy đủ dữ liệu mẫu'}).`,
  );
  for (const [label, { created, existing }] of stats) {
    console.log(
      `  ${label.padEnd(14)} ${String(created + existing).padStart(3)}  (tạo mới ${created}, đã có ${existing})`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
