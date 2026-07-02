import { join } from "path";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { Logger, ValidationPipe } from "@nestjs/common";
import { envs } from "./config";
import { MicroserviceOptions, Transport } from "@nestjs/microservices";

async function bootstrap() {
  const logger = new Logger("StorageMicroservice");
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useStaticAssets(join(process.cwd(), envs.storagePath), {
    prefix: "/storage",
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.NATS,
    options: {
      servers: envs.natsServers,
    },
  });

  await app.startAllMicroservices();
  await app.listen(envs.port);

  logger.log(`Storage microservice is running on: ${envs.port}`);
}
bootstrap();
