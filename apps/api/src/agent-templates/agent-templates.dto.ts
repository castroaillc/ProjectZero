import { AgentTemplateSchema } from "@projectzero/shared";
import { createZodDto } from "nestjs-zod";

export class AgentTemplateDto extends createZodDto(AgentTemplateSchema) {}
