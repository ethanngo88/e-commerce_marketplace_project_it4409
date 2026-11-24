import 'reflect-metadata';
import { HttpStatus } from '@nestjs/common';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsString,
  Min,
  ValidateNested,
  validateSync,
} from 'class-validator';
import { AppException, ErrorCode } from '../errors/error-codes';
import {
  createValidationPipe,
  flattenValidationErrors,
} from './validation.pipe';

class AddressInput {
  @IsString()
  city!: string;
}

class ShippingInput {
  @ValidateNested()
  @Type(() => AddressInput)
  address!: AddressInput;
}

class VariantInput {
  @IsString()
  sku!: string;

  @IsInt()
  @Min(0)
  price!: number;
}

class ProductInput {
  @IsString()
  name!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantInput)
  variants!: VariantInput[];

  @ValidateNested()
  @Type(() => ShippingInput)
  shipping!: ShippingInput;
}

const validProduct = {
  name: 'Áo thun',
  variants: [
    { sku: 'A-1', price: 100 },
    { sku: 'A-2', price: 200 },
  ],
  shipping: { address: { city: 'Hà Nội' } },
};

function errorsFor(input: unknown) {
  return validateSync(plainToInstance(ProductInput, input) as object);
}

describe('flattenValidationErrors', () => {
  it('returns an empty list for valid input', () => {
    expect(flattenValidationErrors(errorsFor(validProduct))).toEqual([]);
  });

  it('keeps top-level fields as they are', () => {
    const details = flattenValidationErrors(
      errorsFor({ ...validProduct, name: 123 }),
    );

    expect(details).toEqual([
      { field: 'name', message: 'name must be a string' },
    ]);
  });

  it('builds the full path for an element of a nested array', () => {
    const details = flattenValidationErrors(
      errorsFor({
        ...validProduct,
        variants: [
          { sku: 'A-1', price: 100 },
          { sku: 'A-2', price: -5 },
        ],
      }),
    );

    expect(details).toEqual([
      { field: 'variants.1.price', message: 'price must not be less than 0' },
    ]);
  });

  it('builds the full path two levels deep', () => {
    const details = flattenValidationErrors(
      errorsFor({ ...validProduct, shipping: { address: { city: 1 } } }),
    );

    expect(details).toEqual([
      { field: 'shipping.address.city', message: 'city must be a string' },
    ]);
  });
});

describe('createValidationPipe', () => {
  it('throws VALIDATION_ERROR with flattened details', async () => {
    const pipe = createValidationPipe();
    const invalid = {
      ...validProduct,
      variants: [{ sku: 'A-1', price: -1 }],
    };

    const error = await pipe
      .transform(invalid, { type: 'body', metatype: ProductInput })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    const exception = error as AppException;
    expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(exception.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(exception.details).toEqual([
      { field: 'variants.0.price', message: 'price must not be less than 0' },
    ]);
  });

  it('rejects fields that are not declared in the DTO', async () => {
    const pipe = createValidationPipe();

    const error = await pipe
      .transform(
        { ...validProduct, isAdmin: true },
        { type: 'body', metatype: ProductInput },
      )
      .catch((e: unknown) => e);

    expect((error as AppException).details).toEqual([
      { field: 'isAdmin', message: 'property isAdmin should not exist' },
    ]);
  });
});
