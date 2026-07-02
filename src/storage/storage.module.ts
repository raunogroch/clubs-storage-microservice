import { Module } from "@nestjs/common";
import { StorageService } from "./storage.service";
import { StorageController } from "./storage.controller";
import { StorageRepository } from "./storage.repository";
import { PrismaService } from "../prisma.service";
import { NatsModule } from "../transports/nats.module";
import { FileValidatorService } from "./services/file-validator.service";
import { MimeTypeResolverService } from "./services/mime-type-resolver.service";
import { FileSystemManagerService } from "./services/file-system-manager.service";
import { JimpImageProcessor } from "./processors/jimp-image.processor";

@Module({
  imports: [NatsModule],
  controllers: [StorageController],
  providers: [
    StorageService,
    StorageRepository,
    PrismaService,
    FileValidatorService,
    MimeTypeResolverService,
    FileSystemManagerService,
    JimpImageProcessor,
    {
      provide: "IImageProcessor",
      useClass: JimpImageProcessor,
    },
  ],
})
export class StorageModule {}
