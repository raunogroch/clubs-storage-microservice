import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { envs } from "./config";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const adapter = new PrismaPg(envs.databaseUrl);
    super({ adapter });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
