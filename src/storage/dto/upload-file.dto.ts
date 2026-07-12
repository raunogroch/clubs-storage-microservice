import { IsNotEmpty, IsString, IsEnum, IsOptional } from "class-validator";
import { FileType } from "../enums/file-type.enum";

export class UploadFileDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  base64Data!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsNotEmpty()
  @IsEnum(FileType, {
    message: `type must be a valid type ${Object.values(FileType).join(", ")}`,
  })
  type!: FileType;
}
