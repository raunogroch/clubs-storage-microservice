import {
  Injectable,
  Logger,
  BadRequestException,
  Inject,
} from "@nestjs/common";
import { UploadFileDto } from "./dto/upload-file.dto";
import { FileType } from "./enums/file-type.enum";
import { FileValidatorService } from "./services/file-validator.service";
import { MimeTypeResolverService } from "./services/mime-type-resolver.service";
import {
  FileSystemManagerService,
  FileSaveResult,
} from "./services/file-system-manager.service";
import { StorageRepository } from "./storage.repository";
import { envs } from "../config";
import { resolve } from "path";
import { promises as fs } from "fs";
import type {
  UploadFilePayload,
  StoredFileMetadata,
} from "./types/upload-file.types";

type ImageProcessor = {
  isAvailable(): boolean;
  resize(
    buffer: Buffer,
    options: { width: number; suffix: string },
  ): Promise<{ buffer: Buffer; suffix: string; width: number }>;
};

export interface ProfileImageUrls {
  small: string;
  medium: string;
  large: string;
}

export interface UploadFileResponse {
  id: string;
  url?: string;
  urls?: ProfileImageUrls;
  mimeType: string;
  type: FileType;
  size: number;
  createdAt: Date;
}

/**
 * Storage service - Main orchestrator
 * Handles file upload workflow by coordinating specialized services
 * Dependency Inversion: Depends on abstractions (IImageProcessor), not concrete implementations
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  // Profile image resize configurations
  private readonly profileImageSizes = [
    { suffix: "small", width: 50 },
    { suffix: "medium", width: 100 },
    { suffix: "large", width: 300 },
  ];

  constructor(
    private readonly fileValidator: FileValidatorService,
    private readonly mimeTypeResolver: MimeTypeResolverService,
    private readonly fileSystemManager: FileSystemManagerService,
    @Inject("IImageProcessor") private readonly imageProcessor: ImageProcessor,
    private readonly storageRepository: StorageRepository,
  ) {}

  /**
   * Upload a file with optional image resizing for profile images
   */
  async uploadFile(uploadFileDto: UploadFileDto): Promise<UploadFileResponse> {
    const { userId, buffer, mimeType, originalName, type } = uploadFileDto;

    const normalizedPayload: UploadFilePayload = {
      userId,
      mimeType,
      originalName,
      type,
      buffer: this.resolveFileBuffer(buffer),
    };

    this.validateUploadInput(normalizedPayload);

    const fileBuffer = normalizedPayload.buffer;
    const fileId = this.fileSystemManager.generateFileId();
    const folderName = this.fileSystemManager.getFolderName(type);
    const extension = this.mimeTypeResolver.resolveExtension(
      mimeType,
      originalName,
    );

    // Handle profile image with resizing
    if (this.fileValidator.isImageTypeRequiringResize(type)) {
      return await this.uploadProfileImage(
        fileId,
        fileBuffer,
        userId,
        type,
        folderName,
        extension,
      );
    }

    // Handle other file types
    return await this.uploadRegularFile(
      fileId,
      fileBuffer,
      userId,
      type,
      folderName,
      extension,
      mimeType,
    );
  }

  /**
   * Get file metadata and buffer
   * Reads file from disk after verifying it exists
   */
  async getFile(
    folderName: string,
    filename: string,
  ): Promise<{
    buffer: Buffer;
    mimeType: string;
    size: number;
    userId?: string;
    type?: string;
  } | null> {
    try {
      const filePath = this.resolveStoragePath(folderName, filename);
      this.logger.log(`Attempting to read file from: ${filePath}`);

      const [metadata, buffer] = await Promise.all([
        this.loadFileMetadata(filename),
        fs.readFile(filePath).catch((error) => {
          this.logger.error(
            `File not found at path: ${filePath}`,
            (error as Error).message,
          );
          return null;
        }),
      ]);

      if (!buffer) {
        return null;
      }

      this.logger.log(
        `Successfully read file ${filename} (${buffer.length} bytes)`,
      );
      return {
        buffer,
        mimeType: metadata.mimeType || "application/octet-stream",
        size: buffer.length,
        userId: metadata.userId,
        type: metadata.type,
      };
    } catch (error) {
      this.logger.error(
        `Error retrieving file ${filename}`,
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  /**
   * Private method: Upload profile image with resizing
   */
  private async uploadProfileImage(
    fileId: string,
    buffer: Buffer,
    userId: string,
    type: FileType,
    folderName: string,
    extension: string,
  ): Promise<UploadFileResponse> {
    if (!this.imageProcessor.isAvailable()) {
      throw new BadRequestException(
        "Image processor is not available for image resizing",
      );
    }

    const urls: ProfileImageUrls = { small: "", medium: "", large: "" };
    let largeFileResult: FileSaveResult | null = null;
    const mimeType = this.mimeTypeResolver.getMimeTypeForResized();

    for (const size of this.profileImageSizes) {
      const resizeResult = await this.imageProcessor.resize(buffer, {
        width: size.width,
        suffix: size.suffix,
      });

      const filename = `${fileId}_${size.suffix}.${extension}`;
      const fileResult = await this.fileSystemManager.saveFile(
        `${fileId}_${size.suffix}`,
        resizeResult.buffer,
        mimeType,
        type,
        folderName,
        filename,
        userId,
      );

      (urls as unknown as Record<string, string>)[size.suffix] = fileResult.url;

      if (size.suffix === "large") {
        largeFileResult = fileResult;
      }
    }

    if (!largeFileResult) {
      throw new Error("Failed to create large profile image variant");
    }

    return {
      id: fileId,
      urls,
      mimeType,
      type,
      size: largeFileResult.size,
      createdAt: new Date(),
    };
  }

  /**
   * Private method: Upload regular file (non-image)
   */
  private async uploadRegularFile(
    fileId: string,
    buffer: Buffer,
    userId: string,
    type: FileType,
    folderName: string,
    extension: string,
    mimeType: string,
  ): Promise<UploadFileResponse> {
    const filename = `${fileId}.${extension}`;

    const fileResult = await this.fileSystemManager.saveFile(
      fileId,
      buffer,
      mimeType,
      type,
      folderName,
      filename,
      userId,
    );

    return {
      id: fileResult.id,
      url: fileResult.url,
      mimeType: fileResult.mimeType,
      type,
      size: fileResult.size,
      createdAt: new Date(),
    };
  }

  private async loadFileMetadata(filename: string) {
    try {
      const meta = await this.storageRepository.findByFilename(filename);
      const metadata = {
        mimeType: meta?.mimeType || undefined,
        userId: meta?.userId || undefined,
        type: meta?.type?.toString() || undefined,
      };

      this.logger.debug(
        `Found metadata for ${filename}: mimeType=${metadata.mimeType}, userId=${metadata.userId}, type=${metadata.type}`,
      );
      return metadata;
    } catch {
      this.logger.warn(
        `Could not find metadata in DB for ${filename}, will use default MIME type`,
      );
      return { mimeType: undefined, userId: undefined, type: undefined };
    }
  }

  private resolveStoragePath(folderName: string, filename: string): string {
    return resolve(process.cwd(), envs.storagePath, folderName, filename);
  }

  /**
   * Private method: Validate upload input
   */
  private validateUploadInput(payload: UploadFilePayload): void {
    const { userId, mimeType, type, buffer } = payload;
    // Validate user ID
    const userValidation = this.fileValidator.validateUserId(userId);
    if (!userValidation.valid) {
      throw new BadRequestException(userValidation.error);
    }

    // Validate file type
    const typeValidation = this.fileValidator.validateFileType(type);
    if (!typeValidation.valid) {
      throw new BadRequestException(typeValidation.error);
    }

    // Validate MIME type
    const mimeValidation = this.fileValidator.validateMimeType(type, mimeType);
    if (!mimeValidation.valid) {
      throw new BadRequestException(mimeValidation.error);
    }

    // Validate file data
    if (!buffer) {
      throw new BadRequestException("File data is required");
    }
  }

  private resolveFileBuffer(buffer: Buffer | Uint8Array | undefined): Buffer {
    if (buffer) {
      return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    }

    throw new BadRequestException("File data is required");
  }
}
