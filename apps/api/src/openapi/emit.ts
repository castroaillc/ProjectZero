// Writes openapi.json for client generation and the docs site. Needs no database connection.
import "reflect-metadata";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { loadRootEnv } from "@projectzero/db";
import { AppModule } from "../app.module";
import { buildOpenApiDocument } from "./document";

async function main() {
  loadRootEnv();
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: ["error"] });
  app.setGlobalPrefix("v1");
  const doc = await buildOpenApiDocument(app);
  const out = join(__dirname, "../../openapi.json");
  writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
  await app.close();
  console.log(`Wrote ${out} (${Object.keys(doc.paths).length} paths)`);
}

void main();
