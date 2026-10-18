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
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { ZodResponse } from "nestjs-zod";
import { ActiveOrg, type OrgContext } from "../orgs/active-org";
import { CodingAgentDto, CreateCodingAgentDto, UpdateCodingAgentDto } from "./coding-agents.dto";
import { CodingAgentsService } from "./coding-agents.service";

@ApiTags("coding-agents")
@ApiBearerAuth()
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: "No valid session." })
@ApiForbiddenResponse({ description: "No active organization, or not a member of it." })
@Controller("coding-agents")
export class CodingAgentsController {
  constructor(private readonly agents: CodingAgentsService) {}

  @ApiOperation({
    operationId: "listCodingAgents",
    summary: "List the signed-in user's coding agents, newest first.",
  })
  @Get()
  @ZodResponse({ status: 200, type: [CodingAgentDto] })
  list(@ActiveOrg() org: OrgContext) {
    return this.agents.list(org);
  }

  @ApiOperation({ operationId: "getCodingAgent", summary: "Get one coding agent's configuration." })
  @Get(":id")
  @ZodResponse({ status: 200, type: CodingAgentDto })
  @ApiNotFoundResponse()
  get(@ActiveOrg() org: OrgContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.agents.get(org, id);
  }

  @ApiOperation({
    operationId: "createCodingAgent",
    summary: "Create a coding agent: model, sandbox, tools, MCP servers and skills.",
  })
  @Post()
  @ZodResponse({ status: 201, type: CodingAgentDto })
  @ApiConflictResponse({ description: "An agent with this name already exists." })
  create(@ActiveOrg() org: OrgContext, @Body() body: CreateCodingAgentDto) {
    return this.agents.create(org, body);
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
    @ActiveOrg() org: OrgContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateCodingAgentDto,
  ) {
    return this.agents.update(org, id, body);
  }

  @ApiOperation({ operationId: "deleteCodingAgent", summary: "Delete a coding agent." })
  @Delete(":id")
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  remove(@ActiveOrg() org: OrgContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.agents.remove(org, id);
  }
}
