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
import { isAbsolute, resolve } from "path";
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
    const { userId, base64Data, mimeType, type } = uploadFileDto;

    const fileBuffer = this.decodeBase64File(base64Data);
    const normalizedPayload: UploadFilePayload = {
      userId,
      mimeType,
      type,
      buffer: fileBuffer,
    };

    this.validateUploadInput(normalizedPayload);

    const fileId = this.fileSystemManager.generateFileId();
    const folderName = this.fileSystemManager.getFolderName(type);
    const extension = this.mimeTypeResolver.resolveExtension(mimeType);

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
      const filePath = await this.resolveExistingStoragePath(
        folderName,
        filename,
      );

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

      const mimeType =
        metadata.mimeType ||
        this.mimeTypeResolver.getMimeTypeFromFilename(filename) ||
        "application/octet-stream";

      return {
        buffer,
        mimeType,
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

  async getLatestFileForUser(
    userId?: string,
    fileType?: string,
    size?: string,
  ): Promise<{
    buffer: Buffer;
    mimeType: string;
    size: number;
    userId?: string;
    type?: string;
    filename?: string;
  } | null> {
    if (!userId || !fileType) {
      return null;
    }

    const normalizedFileType = fileType.toUpperCase() as FileType;
    const entity = await this.storageRepository.findByUserAndType(
      userId,
      normalizedFileType,
    );

    if (!entity?.path) {
      return null;
    }

    const normalizedSize = this.normalizeProfileImageSize(size);
    const filename = this.resolveRequestedFilename(entity, normalizedSize);
    const filePath = this.resolveFilePath(entity.path, entity.url, filename);

    try {
      const buffer = await fs.readFile(filePath);
      return {
        buffer,
        mimeType: entity.mimeType || "application/octet-stream",
        size: buffer.length,
        userId: entity.userId,
        type: entity.type?.toString(),
        filename,
      };
    } catch (error) {
      this.logger.error(
        `Error reading latest file for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private normalizeProfileImageSize(size?: string): string | undefined {
    const normalized = size?.toLowerCase();
    return normalized === "small" ||
      normalized === "medium" ||
      normalized === "large"
      ? normalized
      : undefined;
  }

  private resolveRequestedFilename(
    entity: { path?: string | null; url?: string | null },
    size?: string,
  ): string | undefined {
    const baseName = (entity.path || entity.url || "").split(/[\\/]/).pop();

    if (!baseName) {
      return undefined;
    }

    const extension = baseName.includes(".")
      ? baseName.substring(baseName.lastIndexOf("."))
      : "";

    if (!size) {
      return baseName;
    }

    const nameWithoutExtension = extension
      ? baseName.slice(0, baseName.lastIndexOf(extension))
      : baseName;
    const existingSizeSuffix = ["small", "medium", "large"].find((suffix) =>
      nameWithoutExtension.endsWith(`_${suffix}`),
    );
    const stem = existingSizeSuffix
      ? nameWithoutExtension.slice(0, -existingSizeSuffix.length - 1)
      : nameWithoutExtension;

    return `${stem}_${size}${extension}`;
  }

  private resolveFilePath(
    path: string | null | undefined,
    url: string | null | undefined,
    filename?: string,
  ): string {
    if (!path) {
      const fallback = url?.split(/[\\/]/).pop() || "";
      return resolve(process.cwd(), fallback);
    }

    if (filename) {
      const directory = path.split(/[\\/]/).slice(0, -1).join("/");
      return resolve(directory, filename);
    }

    return path;
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

  private async resolveExistingStoragePath(
    folderName: string,
    filename: string,
  ): Promise<string> {
    const candidates = this.getStoragePathCandidates(folderName, filename);

    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // Try next candidate
      }
    }

    return this.resolveStoragePath(folderName, filename);
  }

  private getStoragePathCandidates(
    folderName: string,
    filename: string,
  ): string[] {
    const cwd = process.cwd();
    const configuredPath = envs.storagePath || "./storage";
    const candidates = new Set<string>();

    candidates.add(resolve(cwd, configuredPath, folderName, filename));

    if (!isAbsolute(configuredPath)) {
      candidates.add(resolve(cwd, "..", configuredPath, folderName, filename));
      candidates.add(
        resolve(cwd, "..", "..", configuredPath, folderName, filename),
      );
    }

    candidates.add(resolve(cwd, "..", "storage_data", folderName, filename));
    candidates.add(resolve(cwd, "storage_data", folderName, filename));
    candidates.add(
      resolve(cwd, "..", "..", "storage_data", folderName, filename),
    );

    return Array.from(candidates);
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

  private decodeBase64File(base64Data: string): Buffer {
    if (!base64Data || typeof base64Data !== "string") {
      throw new BadRequestException("Base64 file data is required");
    }

    const matches = base64Data.match(/^data:(.+);base64,(.+)$/i);
    const normalizedBase64 = matches ? matches[2] : base64Data;

    try {
      return Buffer.from(normalizedBase64, "base64");
    } catch {
      throw new BadRequestException("Invalid base64 file data");
    }
  }
}
