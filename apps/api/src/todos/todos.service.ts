import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { todos, type Db, type TodoRow } from "@projectzero/db";
import type { CreateTodo, Todo, UpdateTodo } from "@projectzero/shared";
import { and, desc, eq } from "drizzle-orm";
import { DB } from "../db/db.module";

function toTodo(row: TodoRow): Todo {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Todo business logic. Every method is scoped to one user. */
@Injectable()
export class TodosService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(userId: string): Promise<Todo[]> {
    const rows = await this.db
      .select()
      .from(todos)
      .where(eq(todos.userId, userId))
      .orderBy(desc(todos.createdAt));
    return rows.map(toTodo);
  }

  async get(userId: string, id: string): Promise<Todo> {
    const [row] = await this.db
      .select()
      .from(todos)
      .where(and(eq(todos.id, id), eq(todos.userId, userId)));
    if (!row) throw new NotFoundException(`Todo ${id} not found`);
    return toTodo(row);
  }

  async create(userId: string, input: CreateTodo): Promise<Todo> {
    const [row] = await this.db.insert(todos).values({ userId, title: input.title }).returning();
    return toTodo(row!);
  }

  async update(userId: string, id: string, input: UpdateTodo): Promise<Todo> {
    const [row] = await this.db
      .update(todos)
      .set(input)
      .where(and(eq(todos.id, id), eq(todos.userId, userId)))
      .returning();
    if (!row) throw new NotFoundException(`Todo ${id} not found`);
    return toTodo(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.db
      .delete(todos)
      .where(and(eq(todos.id, id), eq(todos.userId, userId)))
      .returning({ id: todos.id });
    if (deleted.length === 0) throw new NotFoundException(`Todo ${id} not found`);
  }
}
