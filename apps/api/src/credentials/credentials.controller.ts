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
import { CreateCredentialDto, CredentialDto, UpdateCredentialDto } from "./credentials.dto";
import { CredentialsService } from "./credentials.service";

@ApiTags("credentials")
@ApiBearerAuth()
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: "No valid session." })
@ApiForbiddenResponse({ description: "No active organization, or not a member of it." })
@Controller("credentials")
export class CredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  @ApiOperation({
    operationId: "listCredentials",
    summary: "List the signed-in user's credentials (names and hints, never values).",
  })
  @Get()
  @ZodResponse({ status: 200, type: [CredentialDto] })
  list(@ActiveOrg() org: OrgContext) {
    return this.credentials.list(org);
  }

  @ApiOperation({
    operationId: "createCredential",
    summary: "Store a secret, encrypted, for agents to use by name.",
  })
  @Post()
  @ZodResponse({ status: 201, type: CredentialDto })
  @ApiConflictResponse({ description: "A credential with this name already exists." })
  create(@ActiveOrg() org: OrgContext, @Body() body: CreateCredentialDto) {
    return this.credentials.create(org, body);
  }

  @ApiOperation({
    operationId: "updateCredential",
    summary: "Replace a credential's value or description. The name can't change.",
  })
  @Patch(":id")
  @ZodResponse({ status: 200, type: CredentialDto })
  @ApiNotFoundResponse()
  update(
    @ActiveOrg() org: OrgContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateCredentialDto,
  ) {
    return this.credentials.update(org, id, body);
  }

  @ApiOperation({ operationId: "deleteCredential", summary: "Delete a credential." })
  @Delete(":id")
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  remove(@ActiveOrg() org: OrgContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.credentials.remove(org, id);
  }
}
