import {
  CodingAgentSchema,
  CreateCodingAgentSchema,
  UpdateCodingAgentSchema,
} from "@projectzero/shared";
import { createZodDto } from "nestjs-zod";

export class CodingAgentDto extends createZodDto(CodingAgentSchema) {}
export class CreateCodingAgentDto extends createZodDto(CreateCodingAgentSchema) {}
export class UpdateCodingAgentDto extends createZodDto(UpdateCodingAgentSchema) {}
