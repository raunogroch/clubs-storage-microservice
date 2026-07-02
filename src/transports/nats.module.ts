import { Module } from "@nestjs/common";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { envs, NATS_SERVICE } from "../config";
import { NatsClientService } from "./nats-client.service";

@Module({
  imports: [
    ClientsModule.register([
      {
        name: NATS_SERVICE,
        transport: Transport.NATS,
        options: {
          servers: envs.natsServers,
        },
      },
    ]),
  ],
  providers: [NatsClientService],
  exports: [NatsClientService],
})
export class NatsModule {}
