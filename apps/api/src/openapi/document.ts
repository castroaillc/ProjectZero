import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from "@nestjs/swagger";
import { AUTH_BASE_PATH } from "@projectzero/auth";
import type { Auth } from "@projectzero/auth";
import { AuthService } from "@thallesp/nestjs-better-auth";
import { cleanupOpenApiDoc } from "nestjs-zod";

/**
 * Builds the API's OpenAPI document: the Nest controllers (described by zod schemas and
 * decorators) merged with Better Auth's own endpoints under `/api/auth`.
 */
export async function buildOpenApiDocument(app: INestApplication): Promise<OpenAPIObject> {
  // 3.1: Better Auth's schemas use 3.1 JSON Schema features (type arrays, propertyNames).
  const config = new DocumentBuilder()
    .setOpenAPIVersion("3.1.0")
    .setTitle("ProjectZero API")
    .setDescription("REST API shared by the ProjectZero web, desktop and mobile apps.")
    .setVersion("1")
    .addBearerAuth()
    .addCookieAuth("better-auth.session_token")
    .build();
  const doc = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config), { version: "3.1" });

  const auth = app.get<AuthService<Auth>>(AuthService);
  const authDoc = (await auth.api.generateOpenAPISchema()) as unknown as OpenAPIObject;
  for (const [path, item] of Object.entries(authDoc.paths ?? {})) {
    doc.paths[`${AUTH_BASE_PATH}${path}`] = item;
  }
  doc.components ??= {};
  doc.components.schemas = { ...authDoc.components?.schemas, ...doc.components.schemas };
  return doc;
}
