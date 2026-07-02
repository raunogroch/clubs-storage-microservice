export interface ResizeOptions {
  width: number;
  suffix: string;
}

export interface ImageResizeResult {
  buffer: Buffer;
  suffix: string;
  width: number;
}

export interface IImageProcessor {
  /**
   * Resize an image to specific width
   * @param buffer - Image buffer
   * @param options - Resize options
   * @returns Resized image buffer and metadata
   */
  resize(buffer: Buffer, options: ResizeOptions): Promise<ImageResizeResult>;

  /**
   * Check if image processing is available
   */
  isAvailable(): boolean;
}
