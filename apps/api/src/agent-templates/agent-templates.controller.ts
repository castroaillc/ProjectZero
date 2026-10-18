import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { AGENT_TEMPLATES, findAgentTemplate } from "@projectzero/shared";
import { ZodResponse } from "nestjs-zod";
import { AgentTemplateDto } from "./agent-templates.dto";

/** Built-in, pre-configured coding agents. They ship with the code, so there's no storage. */
@ApiTags("agent-templates")
@ApiBearerAuth()
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: "No valid session." })
@Controller("agent-templates")
export class AgentTemplatesController {
  @ApiOperation({
    operationId: "listAgentTemplates",
    summary: "List the pre-configured agents users can start from.",
  })
  @Get()
  @ZodResponse({ status: 200, type: [AgentTemplateDto] })
  list() {
    return AGENT_TEMPLATES;
  }

  @ApiOperation({ operationId: "getAgentTemplate", summary: "Get one agent template." })
  @Get(":id")
  @ZodResponse({ status: 200, type: AgentTemplateDto })
  @ApiNotFoundResponse()
  get(@Param("id") id: string) {
    const template = findAgentTemplate(id);
    if (!template) throw new NotFoundException(`Agent template ${id} not found`);
    return template;
  }
}
