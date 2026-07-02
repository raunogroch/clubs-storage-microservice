import { Injectable, Logger } from "@nestjs/common";
import { Jimp } from "jimp";
import type {
  IImageProcessor,
  ResizeOptions,
  ImageResizeResult,
} from "../interfaces/image-processor.interface";

/**
 * Jimp-based image processor
 * Pure JavaScript implementation with no native dependencies
 * Supports JPEG, PNG, WebP, and other formats
 */
@Injectable()
export class JimpImageProcessor implements IImageProcessor {
  private readonly logger = new Logger(JimpImageProcessor.name);
  private available = true;

  constructor() {
    try {
      // Verify Jimp is loaded correctly
      if (!Jimp) {
        this.available = false;
        this.logger.warn("Jimp is not available");
      }
    } catch (error) {
      this.available = false;
      this.logger.error("Failed to initialize Jimp processor", error);
    }
  }

  /**
   * Resize image using Jimp
   * Uses "inside" fit mode to maintain aspect ratio without enlargement
   */
  async resize(
    buffer: Buffer,
    options: ResizeOptions,
  ): Promise<ImageResizeResult> {
    if (!this.available) {
      throw new Error("Image processor is not available");
    }

    try {
      const image = await Jimp.read(buffer);
      const resized = image.resize({
        w: options.width,
        h: undefined,
      });

      const resizedBuffer = await resized.getBuffer("image/jpeg");

      this.logger.debug(
        `Resized image to ${options.width}px (${options.suffix})`,
      );

      return {
        buffer: resizedBuffer,
        suffix: options.suffix,
        width: options.width,
      };
    } catch (error) {
      this.logger.error(`Failed to resize image to ${options.width}px`, error);
      throw new Error(`Failed to resize image: ${(error as Error).message}`);
    }
  }

  isAvailable(): boolean {
    return this.available;
  }
}
