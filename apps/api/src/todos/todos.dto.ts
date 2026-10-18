import { CreateTodoSchema, TodoSchema, UpdateTodoSchema } from "@projectzero/shared";
import { createZodDto } from "nestjs-zod";

export class TodoDto extends createZodDto(TodoSchema) {}
export class CreateTodoDto extends createZodDto(CreateTodoSchema) {}
export class UpdateTodoDto extends createZodDto(UpdateTodoSchema) {}
