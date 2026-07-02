import { Inject, Injectable } from "@nestjs/common";
import { ClientProxy, RpcException } from "@nestjs/microservices";
import { firstValueFrom } from "rxjs";
import { NATS_SERVICE } from "../config";

@Injectable()
export class NatsClientService {
  constructor(@Inject(NATS_SERVICE) private readonly client: ClientProxy) {}

  async send<T = unknown, R = unknown>(
    pattern: string,
    payload: R,
  ): Promise<T> {
    try {
      return await firstValueFrom(this.client.send<T, R>(pattern, payload));
    } catch (error: unknown) {
      this.handleError(error);
    }
  }

  async emit<T = void, R = unknown>(pattern: string, payload: R): Promise<T> {
    try {
      return await firstValueFrom(this.client.emit<T, R>(pattern, payload));
    } catch (error: unknown) {
      this.handleError(error);
    }
  }

  private handleError(error: unknown): never {
    if (error instanceof RpcException) {
      throw error;
    }

    if (error && typeof error === "object" && "message" in error) {
      throw new RpcException({
        status: 500,
        message:
          (error as { message: string }).message ||
          "Remote service communication failed",
      });
    }

    throw new RpcException({
      status: 500,
      message: "Remote service communication failed",
    });
  }
}
