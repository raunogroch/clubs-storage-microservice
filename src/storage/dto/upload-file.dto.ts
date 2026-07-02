import { IsNotEmpty, IsString, IsEnum, IsOptional } from "class-validator";
import { FileType } from "../enums/file-type.enum";

export class UploadFileDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsOptional()
  base64Data?: string;

  @IsOptional()
  buffer?: Buffer | Uint8Array;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsString()
  @IsNotEmpty()
  originalName!: string;

  @IsNotEmpty()
  @IsEnum(FileType, {
    message: `type must be a valid type ${Object.values(FileType).join(", ")}`,
  })
  type!: FileType;

  @IsOptional()
  @IsString()
  description?: string;
}
