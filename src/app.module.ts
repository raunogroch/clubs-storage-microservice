import { Module } from "@nestjs/common";
import { StorageModule } from "./storage/storage.module";
import { NatsModule } from "./transports/nats.module";

@Module({
  imports: [NatsModule, StorageModule],
})
export class AppModule {}
