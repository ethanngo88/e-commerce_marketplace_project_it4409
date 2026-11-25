process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/marketplace_test';
// Khóa giả chỉ dùng trong test, không phải secret thật.
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ??
  'test-only-jwt-secret-not-used-anywhere-else';
process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS ?? '4';
