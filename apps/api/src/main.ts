import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { loadRootEnv } from "@projectzero/db";
import { apiReference } from "@scalar/nestjs-api-reference";
import { AppModule } from "./app.module";
import { ENV } from "./config/config.module";
import { trustedOrigins, type Env } from "./config/env";
import { buildOpenApiDocument } from "./openapi/document";

async function bootstrap() {
  loadRootEnv();
  // Better Auth needs the raw body on its routes; the auth module re-adds parsers for the rest.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const env = app.get<Env>(ENV);

  app.setGlobalPrefix("v1");
  app.enableCors({ origin: trustedOrigins(env), credentials: true });
  app.enableShutdownHooks();

  const doc = await buildOpenApiDocument(app);
  app.getHttpAdapter().get("/openapi.json", (_req, res) => res.json(doc));
  app.use("/docs", apiReference({ content: doc }));

  await app.listen(env.API_PORT);
  console.log(`API on http://localhost:${env.API_PORT} (docs at /docs)`);
}

void bootstrap();
