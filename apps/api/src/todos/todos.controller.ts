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
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { ZodResponse } from "nestjs-zod";
import { CreateTodoDto, TodoDto, UpdateTodoDto } from "./todos.dto";
import { TodosService } from "./todos.service";

@ApiTags("todos")
@ApiBearerAuth()
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: "No valid session." })
@Controller("todos")
export class TodosController {
  constructor(private readonly todos: TodosService) {}

  /** Lists the signed-in user's todos, newest first. */
  @Get()
  @ZodResponse({ status: 200, type: [TodoDto] })
  list(@Session() session: UserSession) {
    return this.todos.list(session.user.id);
  }

  /** Gets one of the signed-in user's todos. */
  @Get(":id")
  @ZodResponse({ status: 200, type: TodoDto })
  @ApiNotFoundResponse()
  get(@Session() session: UserSession, @Param("id", ParseUUIDPipe) id: string) {
    return this.todos.get(session.user.id, id);
  }

  /** Creates a todo for the signed-in user. */
  @Post()
  @ZodResponse({ status: 201, type: TodoDto })
  create(@Session() session: UserSession, @Body() body: CreateTodoDto) {
    return this.todos.create(session.user.id, body);
  }

  /** Updates the title or completion state of a todo. */
  @Patch(":id")
  @ZodResponse({ status: 200, type: TodoDto })
  @ApiNotFoundResponse()
  update(
    @Session() session: UserSession,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateTodoDto,
  ) {
    return this.todos.update(session.user.id, id, body);
  }

  /** Deletes a todo. */
  @Delete(":id")
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  remove(@Session() session: UserSession, @Param("id", ParseUUIDPipe) id: string) {
    return this.todos.remove(session.user.id, id);
  }
}
