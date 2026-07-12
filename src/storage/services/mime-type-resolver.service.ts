import { Injectable } from "@nestjs/common";
import { lookup } from "mime-types";

/**
 * MIME Type resolver service
 * Handles MIME type to extension mapping
 * Single Responsibility: Only handles MIME type resolution
 */
@Injectable()
export class MimeTypeResolverService {
  /**
   * Get file extension from MIME type
   * Falls back to common extensions if lookup fails
   */
  getExtensionFromMimeType(mimeType: string): string {
    if (!mimeType) return "bin";

    // Try to lookup extension from mime-types library
    const extension = lookup(mimeType);
    if (extension) {
      return extension;
    }

    // Fallback to manual parsing for known types
    const parts = mimeType.split("/");
    if (parts.length >= 2) {
      let ext = parts[1];
      // Handle special cases
      if (ext === "jpeg") ext = "jpg";
      if (ext === "x-png") ext = "png";
      return ext;
    }

    return "bin";
  }

  /**
   * Get extension from filename
   */
  getExtensionFromFilename(filename: string): string | undefined {
    if (!filename) return undefined;
    const parts = filename.split(".");
    return parts.length > 1 ? parts.pop() : undefined;
  }

  /**
   * Resolve MIME type from filename extension when metadata is missing
   */
  getMimeTypeFromFilename(filename?: string): string | undefined {
    if (!filename) return undefined;
    return lookup(filename) || undefined;
  }

  /**
   * Resolve best extension from multiple sources
   * Priority: mimeType > filename > default
   */
  resolveExtension(
    mimeType?: string,
    filename?: string,
    fallback: string = "bin",
  ): string {
    if (mimeType) {
      const ext = this.getExtensionFromMimeType(mimeType);
      if (ext && ext !== "bin") return ext;
    }

    if (filename) {
      const ext = this.getExtensionFromFilename(filename);
      if (ext) return ext;
    }

    return fallback;
  }

  /**
   * Get MIME type for resized images
   * Jimp processor returns JPEG, so always use image/jpeg for resized
   */
  getMimeTypeForResized(): string {
    return "image/jpeg";
  }
}
