import { Injectable } from "@nestjs/common";
import { FileType } from "../enums/file-type.enum";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * File validator service
 * Validates file types, MIME types, and file constraints
 * Single Responsibility: Only handles validation logic
 */
@Injectable()
export class FileValidatorService {
  private readonly mimeTypeMap: Record<string, string[] | null> = {
    PROFILE_IMAGE: ["image/jpeg", "image/png", "image/webp"],
    DNI_PDF: ["application/pdf"],
    MEDICAL_RECORD: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    CONTRACT: ["application/pdf"],
    OTHER: null,
  };

  /**
   * Validate file type is supported
   */
  validateFileType(type: FileType): ValidationResult {
    if (!type) {
      return { valid: false, error: "File type is required" };
    }

    if (!this.mimeTypeMap[type]) {
      return { valid: false, error: `File type ${type} is not supported` };
    }

    return { valid: true };
  }

  /**
   * Validate MIME type is allowed for file type
   */
  validateMimeType(type: FileType, mimeType: string): ValidationResult {
    if (!mimeType) {
      return { valid: false, error: "MIME type is required" };
    }

    const allowedMimes = this.mimeTypeMap[type];

    // If allowedMimes is null, any mime type is allowed
    if (allowedMimes === null) {
      return { valid: true };
    }

    if (Array.isArray(allowedMimes) && !allowedMimes.includes(mimeType)) {
      return {
        valid: false,
        error: `MIME type ${mimeType} is not allowed for type ${type}`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate base64 data
   */
  validateBase64Data(base64Data: string): ValidationResult {
    if (!base64Data || typeof base64Data !== "string") {
      return { valid: false, error: "Base64 data is required" };
    }

    try {
      Buffer.from(base64Data, "base64");
      return { valid: true };
    } catch {
      return { valid: false, error: "Invalid base64 data format" };
    }
  }

  /**
   * Validate user ID exists
   */
  validateUserId(userId: string): ValidationResult {
    if (!userId || typeof userId !== "string") {
      return { valid: false, error: "User ID is required" };
    }

    return { valid: true };
  }

  /**
   * Is file type an image that needs resizing?
   */
  isImageTypeRequiringResize(type: FileType): boolean {
    return type === FileType.PROFILE_IMAGE;
  }
}
