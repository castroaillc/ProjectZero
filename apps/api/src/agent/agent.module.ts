import { Module } from "@nestjs/common";
import { TodosModule } from "../todos/todos.module";
import { AgentController, AgentRunsController } from "./agent.controller";
import { agentProviders } from "./agent.providers";
import { AgentService } from "./agent.service";

@Module({
  imports: [TodosModule],
  controllers: [AgentController, AgentRunsController],
  providers: [...agentProviders, AgentService],
})
export class AgentModule {}
