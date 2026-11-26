import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { AppException, ErrorCode } from '../common/errors/error-codes';

/** Kích thước tối đa mỗi file ảnh tải lên: 5 MB (doc 05 mục 7.2). */
export const MAX_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export interface UploadedImageResult {
  url: string;
  publicId: string;
}

/**
 * Kiểm tra magic bytes thực tế của buffer ảnh (chống đổi đuôi .exe -> .jpg, doc 08 mục 6 #10).
 */
export function detectImageTypeByMagicBytes(
  buffer: Buffer,
): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buffer.length < 12) {
    return null;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WebP: RIFF....WEBP
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Xác thực file ảnh nhận từ Multer (kích thước, MIME và magic bytes).
 */
export function validateImageFile(
  file: Express.Multer.File | undefined,
): asserts file is Express.Multer.File {
  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new AppException(
      ErrorCode.INVALID_FILE,
      'Vui lòng chọn tệp ảnh hợp lệ',
      HttpStatus.BAD_REQUEST,
    );
  }

  if (
    file.size > MAX_IMAGE_FILE_SIZE_BYTES ||
    file.buffer.length > MAX_IMAGE_FILE_SIZE_BYTES
  ) {
    throw new AppException(
      ErrorCode.INVALID_FILE,
      'Kích thước ảnh không được vượt quá 5MB',
      HttpStatus.BAD_REQUEST,
    );
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
    throw new AppException(
      ErrorCode.INVALID_FILE,
      'Chỉ chấp nhận ảnh định dạng JPEG, PNG hoặc WebP',
      HttpStatus.BAD_REQUEST,
    );
  }

  const detected = detectImageTypeByMagicBytes(file.buffer);
  if (!detected) {
    throw new AppException(
      ErrorCode.INVALID_FILE,
      'Nội dung tệp không phải ảnh JPEG, PNG hoặc WebP hợp lệ',
      HttpStatus.BAD_REQUEST,
    );
  }
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private readonly isConfigured: boolean;

  constructor(configService: ConfigService) {
    const cloudName = configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = configService.get<string>('CLOUDINARY_API_SECRET');

    this.isConfigured = Boolean(cloudName && apiKey && apiSecret);
    if (this.isConfigured) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
    }
  }

  async uploadImage(
    file: Express.Multer.File,
    folder: string,
  ): Promise<UploadedImageResult> {
    validateImageFile(file);

    if (!this.isConfigured) {
      throw new AppException(
        ErrorCode.SERVICE_UNAVAILABLE,
        'Dịch vụ lưu trữ ảnh (Cloudinary) chưa được cấu hình',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return new Promise<UploadedImageResult>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
        },
        (error, result) => {
          if (error || !result) {
            this.logger.error(
              `Cloudinary upload failed: ${error?.message ?? 'empty result'}`,
            );
            reject(
              new AppException(
                ErrorCode.SERVICE_UNAVAILABLE,
                'Không thể tải ảnh lên máy chủ lưu trữ, vui lòng thử lại',
                HttpStatus.SERVICE_UNAVAILABLE,
              ),
            );
            return;
          }
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        },
      );
      stream.end(file.buffer);
    });
  }

  /** Xóa ảnh best-effort trên Cloudinary (không ném lỗi làm hỏng thao tác DB). */
  async deleteImage(publicId: string): Promise<void> {
    if (!this.isConfigured || !publicId) {
      return;
    }
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    } catch (error) {
      this.logger.warn(
        `Cloudinary delete failed for ${publicId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
