import { Module } from "@nestjs/common";
import { AgentTemplatesController } from "./agent-templates.controller";

@Module({ controllers: [AgentTemplatesController] })
export class AgentTemplatesModule {}
