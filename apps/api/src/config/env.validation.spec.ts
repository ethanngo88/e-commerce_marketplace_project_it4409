import 'reflect-metadata';
import { NodeEnv, validateEnv } from './env.validation';

describe('validateEnv', () => {
  const baseEnv = {
    DATABASE_URL:
      'postgresql://postgres:postgres@localhost:5432/marketplace_dev',
  };

  it('should coerce string numeric env vars from process.env into numbers', () => {
    const result = validateEnv({
      ...baseEnv,
      NODE_ENV: 'development',
      API_PORT: '4000',
      CORS_ORIGIN: 'http://localhost:3000',
      TRUST_PROXY_HOPS: '1',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'a'.repeat(48),
      JWT_ACCESS_EXPIRES_IN: '15m',
      REFRESH_TOKEN_EXPIRES_DAYS: '7',
      BCRYPT_ROUNDS: '10',
      PAYMENT_EXPIRES_MINUTES: '15',
      SHIPPING_FEE_PER_SELLER_ORDER: '30000',
    });

    expect(result.NODE_ENV).toBe(NodeEnv.Development);
    expect(result.API_PORT).toBe(4000);
    expect(result.TRUST_PROXY_HOPS).toBe(1);
    expect(result.REFRESH_TOKEN_EXPIRES_DAYS).toBe(7);
    expect(result.BCRYPT_ROUNDS).toBe(10);
    expect(result.PAYMENT_EXPIRES_MINUTES).toBe(15);
    expect(result.SHIPPING_FEE_PER_SELLER_ORDER).toBe(30000);
  });

  it('should apply defaults when optional variables are omitted or empty', () => {
    const result = validateEnv({
      ...baseEnv,
      REDIS_URL: '',
      JWT_ACCESS_SECRET: '',
    });

    expect(result.NODE_ENV).toBe(NodeEnv.Development);
    expect(result.API_PORT).toBe(4000);
    expect(result.CORS_ORIGIN).toBe('http://localhost:3000');
    expect(result.TRUST_PROXY_HOPS).toBe(0);
    expect(result.REFRESH_TOKEN_EXPIRES_DAYS).toBe(7);
    expect(result.BCRYPT_ROUNDS).toBe(10);
    expect(result.PAYMENT_EXPIRES_MINUTES).toBe(15);
    expect(result.SHIPPING_FEE_PER_SELLER_ORDER).toBe(30000);
    expect(result.REDIS_URL).toBeUndefined();
    expect(result.JWT_ACCESS_SECRET).toBeUndefined();
  });

  it('should apply defaults when numeric variables are empty or blank', () => {
    const result = validateEnv({
      ...baseEnv,
      NODE_ENV: '',
      API_PORT: '',
      TRUST_PROXY_HOPS: ' ',
      REFRESH_TOKEN_EXPIRES_DAYS: '',
      BCRYPT_ROUNDS: '   ',
      PAYMENT_EXPIRES_MINUTES: '',
      SHIPPING_FEE_PER_SELLER_ORDER: '',
    });

    expect(result.NODE_ENV).toBe(NodeEnv.Development);
    expect(result.API_PORT).toBe(4000);
    expect(result.TRUST_PROXY_HOPS).toBe(0);
    expect(result.REFRESH_TOKEN_EXPIRES_DAYS).toBe(7);
    expect(result.BCRYPT_ROUNDS).toBe(10);
    expect(result.PAYMENT_EXPIRES_MINUTES).toBe(15);
    expect(result.SHIPPING_FEE_PER_SELLER_ORDER).toBe(30000);
  });

  it('should throw when DATABASE_URL is missing', () => {
    expect(() => validateEnv({})).toThrow('Invalid environment configuration');
  });

  it('should throw when DATABASE_URL is blank', () => {
    expect(() => validateEnv({ DATABASE_URL: '  ' })).toThrow('DATABASE_URL');
  });

  it('should throw when API_PORT is not a valid port number', () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        API_PORT: 'not-a-port',
      }),
    ).toThrow('API_PORT');
  });

  it('should throw when JWT_ACCESS_SECRET is shorter than 32 characters', () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        JWT_ACCESS_SECRET: 'too-short',
      }),
    ).toThrow('JWT_ACCESS_SECRET');
  });

  it('should require JWT_ACCESS_SECRET in production', () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        NODE_ENV: 'production',
      }),
    ).toThrow('JWT_ACCESS_SECRET');

    expect(() =>
      validateEnv({
        ...baseEnv,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: '',
      }),
    ).toThrow('JWT_ACCESS_SECRET');
  });

  it('should accept a production config that sets JWT_ACCESS_SECRET', () => {
    const result = validateEnv({
      ...baseEnv,
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'a'.repeat(48),
    });

    expect(result.NODE_ENV).toBe(NodeEnv.Production);
    expect(result.JWT_ACCESS_SECRET).toBe('a'.repeat(48));
  });
});
