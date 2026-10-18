import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { AgentEvent } from "@projectzero/shared";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import type { Response } from "express";
import { ZodResponse } from "nestjs-zod";
import {
  AgentThreadDto,
  AgentThreadStateDto,
  CreateAgentThreadDto,
  RunAgentDto,
} from "./agent.dto";
import { AgentService } from "./agent.service";

@ApiTags("agent")
@ApiBearerAuth()
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: "No valid session." })
@Controller("agent/threads")
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @ApiOperation({
    operationId: "createAgentThread",
    summary: "Start a conversation with the todo agent.",
  })
  @Post()
  @ZodResponse({ status: 201, type: AgentThreadDto })
  create(@Session() session: UserSession, @Body() body: CreateAgentThreadDto) {
    return this.agent.createThread(session.user.id, body.title);
  }

  @ApiOperation({
    operationId: "listAgentThreads",
    summary: "List the signed-in user's agent conversations.",
  })
  @Get()
  @ZodResponse({ status: 200, type: [AgentThreadDto] })
  list(@Session() session: UserSession) {
    return this.agent.listThreads(session.user.id);
  }

  @ApiOperation({
    operationId: "getAgentThread",
    summary: "Get a conversation's messages and any changes waiting for approval.",
  })
  @Get(":id")
  @ZodResponse({ status: 200, type: AgentThreadStateDto })
  @ApiNotFoundResponse()
  get(@Session() session: UserSession, @Param("id", ParseUUIDPipe) id: string) {
    return this.agent.getState(session.user.id, id);
  }

  @ApiOperation({
    operationId: "deleteAgentThread",
    summary: "Delete a conversation and its history.",
  })
  @Delete(":id")
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  remove(@Session() session: UserSession, @Param("id", ParseUUIDPipe) id: string) {
    return this.agent.deleteThread(session.user.id, id);
  }
}

/**
 * The streaming endpoint lives in its own controller, tagged only "agent-stream", so the
 * generated JSON client skips it; clients use the hand-written SSE reader in api-client.
 */
@ApiTags("agent-stream")
@ApiBearerAuth()
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: "No valid session." })
@Controller("agent/threads")
export class AgentRunsController {
  constructor(private readonly agent: AgentService) {}

  @ApiOperation({
    operationId: "streamAgentRun",
    summary: "Send a message (or an approval decision) and stream the agent's response.",
    description:
      "Server-sent events, one JSON `AgentEvent` per `data:` line: `token`, `tool_call`, " +
      "`tool_result`, `approval_required`, then `done` (or `error`). A run that ends with " +
      "`approval_required` is paused; resume it with `{ resume: { approved } }`.",
  })
  @Post(":id/runs")
  @ApiProduces("text/event-stream")
  @ApiOkResponse({ description: "Event stream." })
  @ApiNotFoundResponse()
  async run(
    @Session() session: UserSession,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: RunAgentDto,
    @Res() res: Response,
  ) {
    // Ownership is checked before the stream starts so a 404 is a normal JSON error.
    const thread = await this.agent.ownedThread(session.user.id, id);

    res.status(200).set({
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    res.flushHeaders();

    const abort = new AbortController();
    res.on("close", () => abort.abort());
    const send = (event: AgentEvent) =>
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);

    try {
      for await (const event of this.agent.run(thread, body, abort.signal)) {
        if (abort.signal.aborted) break;
        send(event);
      }
    } catch (err) {
      if (!abort.signal.aborted)
        send({ type: "error", message: err instanceof Error ? err.message : "Agent run failed" });
    } finally {
      res.end();
    }
  }
}
