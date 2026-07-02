import { Injectable, Logger } from "@nestjs/common";
import { promises as fs } from "fs";
import { dirname, resolve } from "path";
import { randomUUID } from "crypto";
import { StorageRepository } from "../storage.repository";
import { NatsClientService } from "../../transports/nats-client.service";
import { envs } from "../../config";
import { FileType } from "../enums/file-type.enum";

export interface FileSaveResult {
  id: string;
  url: string;
  path: string;
  mimeType: string;
  size: number;
}

/**
 * File system manager service
 * Handles file I/O operations and database persistence
 * Single Responsibility: Only handles file system operations
 */
@Injectable()
export class FileSystemManagerService {
  private readonly logger = new Logger(FileSystemManagerService.name);

  constructor(
    private readonly storageRepository: StorageRepository,
    private readonly natsClientService: NatsClientService,
  ) {}

  /**
   * Save file to disk and database
   */
  async saveFile(
    fileId: string,
    buffer: Buffer,
    mimeType: string,
    type: FileType,
    folderName: string,
    filename: string,
    userId: string,
  ): Promise<FileSaveResult> {
    const folder = resolve(process.cwd(), envs.storagePath, folderName);
    const fullPath = resolve(folder, filename);
    const relativePath = `/storage/${folderName}/${filename}`;
    const publicUrl = `${envs.gatewayBaseUrl}${relativePath}`;

    const existingFile = await this.storageRepository.findByUserAndType(
      userId,
      type,
    );
    const targetPath = existingFile?.path || fullPath;
    const targetUrl = existingFile?.url || publicUrl;
    const targetFolder = dirname(targetPath);

    // Create folder if it doesn't exist
    await fs.mkdir(targetFolder, { recursive: true });

    // Write file to disk, overwriting the existing file when present
    await fs.writeFile(targetPath, buffer);

    const saved = existingFile
      ? await this.storageRepository.update(existingFile.id, {
          userId,
          type,
          url: targetUrl,
          path: targetPath,
          mimeType,
          size: buffer.length,
          available: true,
        })
      : await this.storageRepository.create({
          id: fileId,
          userId,
          type,
          url: targetUrl,
          path: targetPath,
          mimeType,
          size: buffer.length,
        });

    // Emit NATS event for synchronization
    await this.natsClientService.emit("users.sync_storage_file", {
      userId,
      type,
      url: targetUrl,
      path: targetPath,
      mimeType,
      size: buffer.length,
    });

    this.logger.log(`File ${saved.id} saved for user ${userId || "anonymous"}`);

    return {
      id: saved.id,
      url: targetUrl,
      path: targetPath,
      mimeType,
      size: buffer.length,
    };
  }

  /**
   * Generate unique file ID
   */
  generateFileId(): string {
    return randomUUID();
  }

  /**
   * Get storage folder name from file type
   */
  getFolderName(type: FileType): string {
    return type.toLowerCase();
  }
}
