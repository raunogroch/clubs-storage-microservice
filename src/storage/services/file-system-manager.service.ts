import { Injectable, Logger } from "@nestjs/common";
import { promises as fs } from "fs";
import { dirname, isAbsolute, resolve } from "path";
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
    const folder = await this.resolveStorageFolderPath(folderName);
    const fullPath = resolve(folder, filename);
    const publicUrl = this.buildPublicFileUrl(folderName, filename);

    const existingFile = await this.storageRepository.findByUserAndType(
      userId,
      type,
    );
    const targetPath = fullPath;
    const targetUrl = publicUrl;
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

  private async resolveStorageFolderPath(folderName: string): Promise<string> {
    const cwd = process.cwd();
    const configuredPath = envs.storagePath || "./storage";
    const candidates = new Set<string>();

    candidates.add(resolve(cwd, configuredPath, folderName));

    if (!isAbsolute(configuredPath)) {
      candidates.add(resolve(cwd, "..", configuredPath, folderName));
      candidates.add(resolve(cwd, "..", "..", configuredPath, folderName));
    }

    candidates.add(resolve(cwd, "..", "storage_data", folderName));
    candidates.add(resolve(cwd, "storage_data", folderName));
    candidates.add(resolve(cwd, "..", "..", "storage_data", folderName));

    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // Try next candidate
      }
    }

    return resolve(cwd, configuredPath, folderName);
  }

  buildPublicFileUrl(folderName: string, filename: string): string {
    const normalizedBaseUrl = envs.gatewayBaseUrl.replace(/\/$/, "");
    return `${normalizedBaseUrl}/api/${folderName}/${filename}`;
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
