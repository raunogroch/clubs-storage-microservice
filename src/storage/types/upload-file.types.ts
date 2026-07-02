import { FileType } from "../enums/file-type.enum";

export interface UploadFilePayload {
  userId: string;
  mimeType: string;
  originalName: string;
  type: FileType;
  buffer: Buffer;
}

export interface StoredFileMetadata {
  mimeType?: string;
  userId?: string;
  type?: string;
}
