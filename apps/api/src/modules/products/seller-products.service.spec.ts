import { HttpStatus } from '@nestjs/common';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { AppException, ErrorCode } from '../../common/errors/error-codes';
import { ProductStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../../upload/cloudinary.service';
import { CategoriesService } from '../categories/categories.service';
import { SellerProductStatusTarget } from './dto/seller-product.dto';
import {
  MAX_IMAGES_PER_PRODUCT,
  SellerProductsService,
} from './seller-products.service';

describe('SellerProductsService (T-14)', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let categories: DeepMockProxy<CategoriesService>;
  let cloudinary: DeepMockProxy<CloudinaryService>;
  let service: SellerProductsService;

  const validPng = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);

  const makePngFile = (name = 'img.png'): Express.Multer.File =>
    ({
      fieldname: 'files',
      originalname: name,
      encoding: '7bit',
      mimetype: 'image/png',
      buffer: validPng,
      size: validPng.length,
    }) as Express.Multer.File;

  const productDetailRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'prod-1',
    name: 'Áo thun cotton nam',
    slug: 'ao-thun-cotton-nam-a1b2',
    description: 'Cotton 100%',
    status: ProductStatus.DRAFT,
    minPrice: 150000,
    ratingAvg: '0.00',
    ratingCount: 0,
    soldCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    store: { name: 'Shop An', slug: 'shop-an' },
    category: { id: 'cat-leaf', name: 'Áo nam', slug: 'ao-nam' },
    images: [],
    variants: [
      {
        id: 'var-1',
        sku: 'AT-DEN-M',
        name: 'Đen / M',
        attributes: { Màu: 'Đen', Size: 'M' },
        price: 150000,
        isActive: true,
        inventory: { quantity: 10 },
      },
      {
        id: 'var-2',
        sku: 'AT-TRANG-L',
        name: 'Trắng / L',
        attributes: { Màu: 'Trắng', Size: 'L' },
        price: 200000,
        isActive: true,
        inventory: { quantity: 5 },
      },
    ],
    ...overrides,
  });

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    (prisma.$transaction as unknown as jest.Mock).mockImplementation(
      (fn: (tx: PrismaService) => unknown) => fn(prisma),
    );
    categories = mockDeep<CategoriesService>();
    categories.assertLeafCategory.mockResolvedValue(undefined);
    cloudinary = mockDeep<CloudinaryService>();
    service = new SellerProductsService(prisma, categories, cloudinary);
  });

  describe('create', () => {
    const createDto = {
      name: 'Áo thun cotton nam',
      description: 'Cotton 100%',
      categoryId: 'cat-leaf',
      variants: [
        { sku: 'AT-DEN-M', name: 'Đen / M', price: 150000, stock: 10 },
        { sku: 'AT-TRANG-L', name: 'Trắng / L', price: 200000, stock: 5 },
      ],
    };

    it('should create a DRAFT product with variants, inventory, and computed minPrice', async () => {
      prisma.product.create.mockResolvedValue(productDetailRecord() as never);

      const created = await service.create('store-1', createDto);

      expect(categories.assertLeafCategory).toHaveBeenCalledWith('cat-leaf');
      expect(prisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            storeId: 'store-1',
            status: ProductStatus.DRAFT,
            minPrice: 150000,
          }),
        }),
      );
      expect(created.status).toBe(ProductStatus.DRAFT);
      expect(created.variants).toHaveLength(2);
    });

    it('should reject duplicate SKU in payload with 409 DUPLICATE_SKU', async () => {
      await expect(
        service.create('store-1', {
          ...createDto,
          variants: [
            { sku: 'SAME-SKU', name: 'A', price: 150000, stock: 5 },
            { sku: 'SAME-SKU', name: 'B', price: 160000, stock: 3 },
          ],
        }),
      ).rejects.toMatchObject({ code: 'DUPLICATE_SKU', status: 409 });
      expect(prisma.product.create).not.toHaveBeenCalled();
    });

    it('should reject non-leaf category with 400 CATEGORY_NOT_LEAF', async () => {
      categories.assertLeafCategory.mockRejectedValue(
        new AppException(
          ErrorCode.CATEGORY_NOT_LEAF,
          'Chỉ gán vào danh mục lá',
          HttpStatus.BAD_REQUEST,
        ),
      );

      await expect(service.create('store-1', createDto)).rejects.toMatchObject({
        code: 'CATEGORY_NOT_LEAF',
        status: 400,
      });
    });
  });

  describe('update & status', () => {
    it('should return 404 PRODUCT_NOT_FOUND when seller tries to edit another store product', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.update('store-1', 'prod-of-store-2', { name: 'Hacked Name' }),
      ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND', status: 404 });
    });

    it('should reject editing or publishing a BANNED product with 403 PRODUCT_BANNED', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        status: ProductStatus.BANNED,
        _count: { images: 2 },
        variants: [{ id: 'var-1' }],
      } as never);

      await expect(
        service.update('store-1', 'prod-1', { name: 'New Name 123' }),
      ).rejects.toMatchObject({ code: 'PRODUCT_BANNED', status: 403 });

      await expect(
        service.updateStatus('store-1', 'prod-1', {
          status: SellerProductStatusTarget.ACTIVE,
        }),
      ).rejects.toMatchObject({ code: 'PRODUCT_BANNED', status: 403 });
    });

    it('should reject publishing to ACTIVE without images with 400 PRODUCT_NOT_PUBLISHABLE', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        status: ProductStatus.DRAFT,
        _count: { images: 0 },
        variants: [{ id: 'var-1' }],
      } as never);

      await expect(
        service.updateStatus('store-1', 'prod-1', {
          status: SellerProductStatusTarget.ACTIVE,
        }),
      ).rejects.toMatchObject({
        code: 'PRODUCT_NOT_PUBLISHABLE',
        status: 400,
      });
    });

    it('should publish to ACTIVE when product has >= 1 image and >= 1 active variant', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        status: ProductStatus.DRAFT,
        _count: { images: 2 },
        variants: [{ id: 'var-1' }],
      } as never);
      prisma.product.update.mockResolvedValue({
        id: 'prod-1',
        status: ProductStatus.ACTIVE,
      } as never);

      const res = await service.updateStatus('store-1', 'prod-1', {
        status: SellerProductStatusTarget.ACTIVE,
      });

      expect(res).toEqual({ id: 'prod-1', status: ProductStatus.ACTIVE });
    });
  });

  describe('variants & minPrice recalculation', () => {
    it('should recalculate product minPrice when updating a variant price', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        status: ProductStatus.ACTIVE,
      } as never);
      prisma.productVariant.findFirst.mockResolvedValue({
        id: 'var-1',
        sku: 'AT-DEN-M',
        isActive: true,
      } as never);
      prisma.productVariant.update.mockResolvedValue({
        id: 'var-1',
        sku: 'AT-DEN-M',
        name: 'Đen / M',
        attributes: {},
        price: 120000,
        isActive: true,
        inventory: { quantity: 10 },
      } as never);
      prisma.productVariant.aggregate.mockResolvedValue({
        _min: { price: 120000 },
      } as never);
      prisma.product.update.mockResolvedValue({} as never);

      const updated = await service.updateVariant(
        'store-1',
        'prod-1',
        'var-1',
        {
          price: 120000,
        },
      );

      expect(updated.price).toBe(120000);
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { minPrice: 120000 },
      });
    });

    it('should reject disabling the last active variant with 400 LAST_ACTIVE_VARIANT', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        status: ProductStatus.ACTIVE,
      } as never);
      prisma.productVariant.findFirst.mockResolvedValue({
        id: 'var-1',
        sku: 'AT-DEN-M',
        isActive: true,
      } as never);
      prisma.productVariant.count.mockResolvedValue(0);

      await expect(
        service.updateVariant('store-1', 'prod-1', 'var-1', {
          isActive: false,
        }),
      ).rejects.toMatchObject({ code: 'LAST_ACTIVE_VARIANT', status: 400 });
    });

    it('should reject deleting a variant that has orders with 409 VARIANT_HAS_ORDERS', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        status: ProductStatus.ACTIVE,
      } as never);
      prisma.productVariant.findFirst.mockResolvedValue({
        id: 'var-1',
        isActive: true,
        _count: { orderItems: 3 },
      } as never);

      await expect(
        service.deleteVariant('store-1', 'prod-1', 'var-1'),
      ).rejects.toMatchObject({ code: 'VARIANT_HAS_ORDERS', status: 409 });
    });
  });

  describe('images', () => {
    it('should reject uploading more than 8 images per product with IMAGE_LIMIT_REACHED', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        status: ProductStatus.DRAFT,
      } as never);
      prisma.productImage.findMany.mockResolvedValue(
        Array.from({ length: MAX_IMAGES_PER_PRODUCT - 1 }, (_, i) => ({
          id: `img-${i}`,
          sortOrder: i,
        })) as never,
      );

      await expect(
        service.uploadImages('store-1', 'prod-1', [
          makePngFile('1.png'),
          makePngFile('2.png'),
        ]),
      ).rejects.toMatchObject({ code: 'IMAGE_LIMIT_REACHED', status: 400 });
      expect(cloudinary.uploadImage).not.toHaveBeenCalled();
    });

    it('should upload validated images and save sequential sortOrders', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        status: ProductStatus.DRAFT,
      } as never);
      prisma.productImage.findMany.mockResolvedValue([
        { id: 'img-0', sortOrder: 0 },
      ] as never);
      cloudinary.uploadImage.mockResolvedValueOnce({
        url: 'https://res.cloudinary.com/demo/1.png',
        publicId: 'marketplace/products/prod-1/1',
      });
      prisma.productImage.create.mockResolvedValue({
        id: 'img-1',
        url: 'https://res.cloudinary.com/demo/1.png',
        sortOrder: 1,
      } as never);

      const created = await service.uploadImages('store-1', 'prod-1', [
        makePngFile('1.png'),
      ]);

      expect(created).toEqual([
        {
          id: 'img-1',
          url: 'https://res.cloudinary.com/demo/1.png',
          sortOrder: 1,
        },
      ]);
    });

    it('should delete image from DB and trigger best-effort Cloudinary deletion', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        status: ProductStatus.DRAFT,
      } as never);
      prisma.productImage.findFirst.mockResolvedValue({
        id: 'img-1',
        publicId: 'marketplace/products/prod-1/1',
      } as never);
      prisma.productImage.delete.mockResolvedValue({} as never);
      cloudinary.deleteImage.mockResolvedValue(undefined);

      await service.deleteImage('store-1', 'prod-1', 'img-1');

      expect(prisma.productImage.delete).toHaveBeenCalledWith({
        where: { id: 'img-1' },
      });
      expect(cloudinary.deleteImage).toHaveBeenCalledWith(
        'marketplace/products/prod-1/1',
      );
    });
  });
});
