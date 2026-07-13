import {
  Controller,
  Get,
  Param,
  NotFoundException,
  Res,
  Logger,
} from "@nestjs/common";
import { MessagePattern, Payload } from "@nestjs/microservices";
import type { Response } from "express";
import { StorageService } from "./storage.service";
import { UploadFileDto } from "./dto/upload-file.dto";

@Controller("storage")
export class StorageController {
  private readonly logger = new Logger(StorageController.name);

  constructor(private readonly storageService: StorageService) {}

  @MessagePattern("storage.upload_file")
  uploadFile(@Payload() uploadFileDto: UploadFileDto) {
    return this.storageService.uploadFile(uploadFileDto);
  }

  @MessagePattern("storage.get_file")
  async getFileByMessage(
    @Payload()
    payload: {
      userId?: string;
      fileType?: string;
      size?: string;
    },
  ) {
    const targetType = payload.fileType?.toUpperCase();
    const userFile = await this.storageService.getLatestFileForUser(
      payload.userId,
      targetType,
      payload.size,
    );

    if (!userFile) {
      return null;
    }

    return {
      data: userFile.buffer.toString("base64"),
      mimeType: userFile.mimeType,
      size: userFile.size,
      userId: userFile.userId,
      type: userFile.type,
      filename: userFile.filename,
    };
  }

  /**
   * HTTP endpoint to serve files
   * GET /storage/:folderName/:filename
   */
  @Get(":folderName/:filename")
  async getFile(
    @Param("folderName") folderName: string,
    @Param("filename") filename: string,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.storageService.getFile(folderName, filename);

    if (!file) {
      this.logger.warn(`File not found: ${folderName}/${filename}`);
      throw new NotFoundException("File not found");
    }

    response.set({
      "Content-Type": file.mimeType,
      "Content-Length": file.size,
      "Cache-Control": "public, max-age=31536000",
    });

    response.send(file.buffer);
  }
}
