import { Paginated } from './paginated';

describe('Paginated.of', () => {
  it('computes totalPages from total and limit', () => {
    const result = Paginated.of([{ id: '1' }], 1, 20, 135);

    expect(result.data).toEqual([{ id: '1' }]);
    expect(result.meta).toEqual({
      page: 1,
      limit: 20,
      total: 135,
      totalPages: 7,
    });
  });

  it('returns zero pages for an empty result', () => {
    expect(Paginated.of([], 1, 20, 0).meta.totalPages).toBe(0);
  });

  it('keeps extra meta fields without letting them override paging fields', () => {
    const summary = { ratingAvg: 4.5, ratingCount: 2 };

    const result = Paginated.of([], 2, 10, 15, { summary, page: 99 });

    expect(result.meta).toEqual({
      summary,
      page: 2,
      limit: 10,
      total: 15,
      totalPages: 2,
    });
  });
});
