import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { ZodResponse } from "nestjs-zod";
import { CodingAgentDto, CreateCodingAgentDto, UpdateCodingAgentDto } from "./coding-agents.dto";
import { CodingAgentsService } from "./coding-agents.service";

@ApiTags("coding-agents")
@ApiBearerAuth()
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: "No valid session." })
@Controller("coding-agents")
export class CodingAgentsController {
  constructor(private readonly agents: CodingAgentsService) {}

  @ApiOperation({
    operationId: "listCodingAgents",
    summary: "List the signed-in user's coding agents, newest first.",
  })
  @Get()
  @ZodResponse({ status: 200, type: [CodingAgentDto] })
  list(@Session() session: UserSession) {
    return this.agents.list(session.user.id);
  }

  @ApiOperation({ operationId: "getCodingAgent", summary: "Get one coding agent's configuration." })
  @Get(":id")
  @ZodResponse({ status: 200, type: CodingAgentDto })
  @ApiNotFoundResponse()
  get(@Session() session: UserSession, @Param("id", ParseUUIDPipe) id: string) {
    return this.agents.get(session.user.id, id);
  }

  @ApiOperation({
    operationId: "createCodingAgent",
    summary: "Create a coding agent: model, sandbox, tools, MCP servers and skills.",
  })
  @Post()
  @ZodResponse({ status: 201, type: CodingAgentDto })
  @ApiConflictResponse({ description: "An agent with this name already exists." })
  create(@Session() session: UserSession, @Body() body: CreateCodingAgentDto) {
    return this.agents.create(session.user.id, body);
  }

  @ApiOperation({
    operationId: "updateCodingAgent",
    summary: "Change a coding agent. Each field sent replaces the stored value as a whole.",
  })
  @Patch(":id")
  @ZodResponse({ status: 200, type: CodingAgentDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "An agent with this name already exists." })
  update(
    @Session() session: UserSession,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateCodingAgentDto,
  ) {
    return this.agents.update(session.user.id, id, body);
  }

  @ApiOperation({ operationId: "deleteCodingAgent", summary: "Delete a coding agent." })
  @Delete(":id")
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  remove(@Session() session: UserSession, @Param("id", ParseUUIDPipe) id: string) {
    return this.agents.remove(session.user.id, id);
  }
}
