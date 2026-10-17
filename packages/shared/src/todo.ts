import { z } from "zod";

/** A todo item owned by a single user. */
export const TodoSchema = z
  .object({
    id: z.uuid().describe("Unique identifier of the todo."),
    userId: z.string().describe("ID of the user who owns the todo."),
    title: z.string().min(1).max(500).describe("Short description of what needs doing."),
    completed: z.boolean().describe("Whether the todo has been completed."),
    createdAt: z.iso.datetime().describe("When the todo was created (ISO 8601)."),
    updatedAt: z.iso.datetime().describe("When the todo was last changed (ISO 8601)."),
  })
  .meta({ id: "Todo", description: "A todo item owned by a single user." });

/** Body for creating a todo. */
export const CreateTodoSchema = TodoSchema.pick({ title: true }).meta({
  id: "CreateTodo",
  description: "Fields required to create a todo.",
});

/** Body for updating a todo; every field is optional. */
export const UpdateTodoSchema = TodoSchema.pick({ title: true, completed: true })
  .partial()
  .meta({ id: "UpdateTodo", description: "Fields that can be changed on a todo." });

export type Todo = z.infer<typeof TodoSchema>;
export type CreateTodo = z.infer<typeof CreateTodoSchema>;
export type UpdateTodo = z.infer<typeof UpdateTodoSchema>;
