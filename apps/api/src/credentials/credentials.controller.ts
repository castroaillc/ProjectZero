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
import { CreateCredentialDto, CredentialDto, UpdateCredentialDto } from "./credentials.dto";
import { CredentialsService } from "./credentials.service";

@ApiTags("credentials")
@ApiBearerAuth()
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: "No valid session." })
@Controller("credentials")
export class CredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  @ApiOperation({
    operationId: "listCredentials",
    summary: "List the signed-in user's credentials (names and hints, never values).",
  })
  @Get()
  @ZodResponse({ status: 200, type: [CredentialDto] })
  list(@Session() session: UserSession) {
    return this.credentials.list(session.user.id);
  }

  @ApiOperation({
    operationId: "createCredential",
    summary: "Store a secret, encrypted, for agents to use by name.",
  })
  @Post()
  @ZodResponse({ status: 201, type: CredentialDto })
  @ApiConflictResponse({ description: "A credential with this name already exists." })
  create(@Session() session: UserSession, @Body() body: CreateCredentialDto) {
    return this.credentials.create(session.user.id, body);
  }

  @ApiOperation({
    operationId: "updateCredential",
    summary: "Replace a credential's value or description. The name can't change.",
  })
  @Patch(":id")
  @ZodResponse({ status: 200, type: CredentialDto })
  @ApiNotFoundResponse()
  update(
    @Session() session: UserSession,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateCredentialDto,
  ) {
    return this.credentials.update(session.user.id, id, body);
  }

  @ApiOperation({ operationId: "deleteCredential", summary: "Delete a credential." })
  @Delete(":id")
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  remove(@Session() session: UserSession, @Param("id", ParseUUIDPipe) id: string) {
    return this.credentials.remove(session.user.id, id);
  }
}
