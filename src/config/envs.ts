import "dotenv/config";
import * as joi from "joi";

interface EnvVars {
  PORT: number;
  DATABASE_URL: string;
  NATS_SERVERS?: string[];
  STORAGE_PATH?: string;
  STORAGE_BASE_URL?: string;
  GATEWAY_BASE_URL?: string;
}

const envVarsSchema = joi
  .object({
    PORT: joi.number().required(),
    DATABASE_URL: joi.string().required(),
    NATS_SERVERS: joi.array().items(joi.string()).required(),
    STORAGE_PATH: joi.string().optional(),
    STORAGE_BASE_URL: joi.string().uri().optional(),
    GATEWAY_BASE_URL: joi.string().uri().optional(),
  })
  .unknown(true);

const { error, value } = envVarsSchema.validate({
  ...process.env,
  NATS_SERVERS: process.env.NATS_SERVERS?.split(","),
});

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

const envVars: EnvVars = value;

export const envs = {
  port: envVars.PORT,
  databaseUrl: envVars.DATABASE_URL,
  natsServers: envVars.NATS_SERVERS,
  storagePath: envVars.STORAGE_PATH || "./storage",
  storageBaseUrl:
    envVars.STORAGE_BASE_URL || `http://localhost:${envVars.PORT}`,
  gatewayBaseUrl: envVars.GATEWAY_BASE_URL || "http://localhost:3000",
};
