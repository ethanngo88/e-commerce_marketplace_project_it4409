import { ConfigService } from '@nestjs/config';
import {
  CloudinaryService,
  detectImageTypeByMagicBytes,
  MAX_IMAGE_FILE_SIZE_BYTES,
  validateImageFile,
} from './cloudinary.service';

describe('CloudinaryService & image validation', () => {
  const validPng = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);
  const validJpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ]);
  const validWebp = Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0x24, 0x00, 0x00, 0x00]),
    Buffer.from('WEBP'),
  ]);
  const fakeExe = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00');

  const makeFile = (
    overrides: Partial<Express.Multer.File> = {},
  ): Express.Multer.File =>
    ({
      fieldname: 'file',
      originalname: 'photo.png',
      encoding: '7bit',
      mimetype: 'image/png',
      buffer: validPng,
      size: validPng.length,
      ...overrides,
    }) as Express.Multer.File;

  it('should detect JPEG, PNG, and WebP by magic bytes and reject disguised executables', () => {
    expect(detectImageTypeByMagicBytes(validJpeg)).toBe('image/jpeg');
    expect(detectImageTypeByMagicBytes(validPng)).toBe('image/png');
    expect(detectImageTypeByMagicBytes(validWebp)).toBe('image/webp');
    expect(detectImageTypeByMagicBytes(fakeExe)).toBeNull();
  });

  it('should accept valid JPEG/PNG/WebP images within 5MB', () => {
    expect(() => validateImageFile(makeFile())).not.toThrow();
    expect(() =>
      validateImageFile(
        makeFile({
          mimetype: 'image/jpeg',
          buffer: validJpeg,
          size: validJpeg.length,
        }),
      ),
    ).not.toThrow();
    expect(() =>
      validateImageFile(
        makeFile({
          mimetype: 'image/webp',
          buffer: validWebp,
          size: validWebp.length,
        }),
      ),
    ).not.toThrow();
  });

  it('should reject disguised .exe files renamed to .jpg with INVALID_FILE', () => {
    expect(() =>
      validateImageFile(
        makeFile({
          originalname: 'virus.jpg',
          mimetype: 'image/jpeg',
          buffer: fakeExe,
          size: fakeExe.length,
        }),
      ),
    ).toThrow(expect.objectContaining({ code: 'INVALID_FILE', status: 400 }));
  });

  it('should reject images larger than 5MB with INVALID_FILE', () => {
    expect(() =>
      validateImageFile(makeFile({ size: MAX_IMAGE_FILE_SIZE_BYTES + 1 })),
    ).toThrow(expect.objectContaining({ code: 'INVALID_FILE', status: 400 }));
  });

  it('should throw 503 SERVICE_UNAVAILABLE if Cloudinary credentials are missing on upload', async () => {
    const config = { get: () => undefined } as unknown as ConfigService;
    const service = new CloudinaryService(config);

    await expect(
      service.uploadImage(makeFile(), 'marketplace/stores'),
    ).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      status: 503,
    });
  });
});
