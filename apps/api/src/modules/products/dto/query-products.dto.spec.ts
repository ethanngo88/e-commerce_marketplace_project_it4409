import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ProductSort, QueryProductsDto } from './query-products.dto';

function parseAndValidate(raw: Record<string, unknown>) {
  const dto = plainToInstance(QueryProductsDto, raw);
  const errors = validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors };
}

describe('QueryProductsDto', () => {
  it('should apply defaults when query parameters are omitted or blank', () => {
    const { dto, errors } = parseAndValidate({
      q: '   ',
      categorySlug: '',
      minPrice: '',
      maxPrice: '  ',
      minRating: '',
      inStock: '',
      sort: '',
      page: '',
      limit: '',
    });

    expect(errors).toHaveLength(0);
    expect(dto.q).toBeUndefined();
    expect(dto.categorySlug).toBeUndefined();
    expect(dto.minPrice).toBeUndefined();
    expect(dto.maxPrice).toBeUndefined();
    expect(dto.minRating).toBeUndefined();
    expect(dto.inStock).toBeUndefined();
    expect(dto.sort).toBe(ProductSort.NEWEST);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('should parse boolean inStock strictly without turning "false" into true', () => {
    const falseCase = parseAndValidate({ inStock: 'false' });
    expect(falseCase.errors).toHaveLength(0);
    expect(falseCase.dto.inStock).toBe(false);

    const trueCase = parseAndValidate({ inStock: 'true' });
    expect(trueCase.errors).toHaveLength(0);
    expect(trueCase.dto.inStock).toBe(true);

    const invalidCase = parseAndValidate({ inStock: 'maybe' });
    expect(invalidCase.errors.some((e) => e.property === 'inStock')).toBe(true);
  });

  it('should reject limit above 100 and page below 1', () => {
    const overLimit = parseAndValidate({ limit: '101' });
    expect(overLimit.errors.some((e) => e.property === 'limit')).toBe(true);

    const zeroPage = parseAndValidate({ page: '0' });
    expect(zeroPage.errors.some((e) => e.property === 'page')).toBe(true);
  });

  it('should reject invalid sort enum, negative minPrice, out-of-range minRating, and q > 100 chars', () => {
    const { errors } = parseAndValidate({
      q: 'a'.repeat(101),
      minPrice: '-1',
      minRating: '6',
      sort: 'popular',
    });

    const fields = errors.map((e) => e.property);
    expect(fields).toEqual(
      expect.arrayContaining(['q', 'minPrice', 'minRating', 'sort']),
    );
  });
});
