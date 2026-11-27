import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { IsString, validate } from 'class-validator';
import { UpdateCategoryDto } from '../../modules/categories/dto/update-category.dto';
import {
  UpdateProductDto,
  UpdateVariantDto,
} from '../../modules/products/dto/seller-product.dto';
import { UpdateSellerProfileDto } from '../../modules/sellers/dto/register-seller.dto';
import { UpdateStoreDto } from '../../modules/sellers/dto/update-store.dto';
import { UpdateAddressDto } from '../../modules/users/dto/address.dto';
import { UpdateProfileDto } from '../../modules/users/dto/update-profile.dto';
import { IsOptionalNotNull } from './is-optional-not-null.decorator';

class Sample {
  @IsOptionalNotNull()
  @IsString()
  name?: string;
}

async function errorFields<T extends object>(
  cls: new () => T,
  body: Record<string, unknown>,
): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, body));
  return errors.map((error) => error.property);
}

describe('IsOptionalNotNull', () => {
  it('should skip validation when the field is omitted', async () => {
    await expect(errorFields(Sample, {})).resolves.toEqual([]);
  });

  it('should validate the value when the field is sent', async () => {
    await expect(errorFields(Sample, { name: 'An' })).resolves.toEqual([]);
    await expect(errorFields(Sample, { name: 42 })).resolves.toEqual(['name']);
  });

  it('should reject null instead of letting it reach the database', async () => {
    await expect(errorFields(Sample, { name: null })).resolves.toEqual([
      'name',
    ]);
  });

  // Các DTO PATCH của T-11–T-15: field ứng với cột NOT NULL phải từ chối null,
  // field ứng với cột cho phép NULL vẫn nhận null để xóa giá trị.
  it.each([
    [UpdateProfileDto, { fullName: null }, ['fullName']],
    [UpdateProfileDto, { phone: null }, []],
    [
      UpdateAddressDto,
      { street: null, isDefault: null },
      ['street', 'isDefault'],
    ],
    [
      UpdateSellerProfileDto,
      { businessName: null, storeName: null },
      ['businessName', 'storeName'],
    ],
    [UpdateSellerProfileDto, { taxCode: null, storeDescription: null }, []],
    [UpdateStoreDto, { name: null }, ['name']],
    [UpdateStoreDto, { description: null }, []],
    [
      UpdateCategoryDto,
      { name: null, sortOrder: null, isActive: null },
      ['name', 'sortOrder', 'isActive'],
    ],
    [
      UpdateProductDto,
      { name: null, categoryId: null },
      ['name', 'categoryId'],
    ],
    [UpdateProductDto, { description: null }, []],
    [
      UpdateVariantDto,
      { sku: null, name: null, attributes: null, price: null, isActive: null },
      ['sku', 'name', 'attributes', 'price', 'isActive'],
    ],
  ] as const)('%p %j should fail on %j', async (cls, body, fields) => {
    await expect(
      errorFields(cls as new () => object, body as Record<string, unknown>),
    ).resolves.toEqual(fields);
  });
});
