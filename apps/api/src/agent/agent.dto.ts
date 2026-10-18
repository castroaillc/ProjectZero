import {
  AgentThreadSchema,
  AgentThreadStateSchema,
  CreateAgentThreadSchema,
  RunAgentSchema,
} from "@projectzero/shared";
import { createZodDto } from "nestjs-zod";

export class AgentThreadDto extends createZodDto(AgentThreadSchema) {}
export class AgentThreadStateDto extends createZodDto(AgentThreadStateSchema) {}
export class CreateAgentThreadDto extends createZodDto(CreateAgentThreadSchema) {}
export class RunAgentDto extends createZodDto(RunAgentSchema) {}
