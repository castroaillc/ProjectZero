import {
  CreateCredentialSchema,
  CredentialSchema,
  UpdateCredentialSchema,
} from "@projectzero/shared";
import { createZodDto } from "nestjs-zod";

export class CredentialDto extends createZodDto(CredentialSchema) {}
export class CreateCredentialDto extends createZodDto(CreateCredentialSchema) {}
export class UpdateCredentialDto extends createZodDto(UpdateCredentialSchema) {}
