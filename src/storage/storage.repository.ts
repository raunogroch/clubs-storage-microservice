import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import type { Prisma } from "../generated/prisma/client";
import { FileType as PrismaFileType } from "../generated/prisma/enums";
import { FileType } from "./enums/file-type.enum";

@Injectable()
export class StorageRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.UserFileCreateInput) {
    return this.prisma.userFile.create({
      data,
    });
  }

  findByUserAndType(userId: string, type: FileType) {
    return this.prisma.userFile.findFirst({
      where: {
        userId,
        type: type as PrismaFileType,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  update(id: string, data: Prisma.UserFileUpdateInput) {
    return this.prisma.userFile.update({
      where: { id },
      data,
    });
  }

  findByFilename(filename: string) {
    return this.prisma.userFile.findFirst({
      where: {
        OR: [{ path: { contains: filename } }, { url: { contains: filename } }],
      },
    });
  }
}
