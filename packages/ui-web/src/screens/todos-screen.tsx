import {
  ApiError,
  getListTodosQueryKey,
  useCreateTodo,
  useDeleteTodo,
  useListTodos,
  useUpdateTodo,
} from "@projectzero/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Check, LogOut, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { cn } from "../cn";
import { Button } from "../components/button";
import { Card } from "../components/card";
import { Input } from "../components/input";

export interface TodosScreenProps {
  userName: string;
  onSignOut: () => void;
}

/** The signed-in todo list, shared by the web app and the desktop renderer. */
export function TodosScreen({ userName, onSignOut }: TodosScreenProps) {
  const queryClient = useQueryClient();
  const refresh = {
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTodosQueryKey() }),
    },
  };

  const todos = useListTodos();
  const create = useCreateTodo(refresh);
  const update = useUpdateTodo(refresh);
  const remove = useDeleteTodo(refresh);
  const [title, setTitle] = useState("");

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    await create.mutateAsync({ data: { title: title.trim() } });
    setTitle("");
  }

  const items = todos.data ?? [];
  const remaining = items.filter((t) => !t.completed).length;
  const error = todos.error ?? create.error ?? update.error ?? remove.error;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Todos</h1>
          <p className="text-sm text-muted">
            Hi {userName}
            {todos.isSuccess && ` · ${remaining} remaining`}
          </p>
        </div>
        <Button variant="ghost" onClick={onSignOut}>
          <LogOut className="size-4" aria-hidden /> Sign out
        </Button>
      </header>

      <Card className="mt-6 p-4">
        <form onSubmit={handleAdd} className="flex gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing?"
            aria-label="New todo"
            maxLength={500}
          />
          <Button type="submit" disabled={create.isPending || !title.trim()}>
            Add
          </Button>
        </form>

        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error instanceof ApiError ? error.message : "Something went wrong."}
          </p>
        )}

        <ul className="mt-4 divide-y divide-border">
          {todos.isPending && <li className="py-3 text-sm text-muted">Loading…</li>}
          {todos.isSuccess && items.length === 0 && (
            <li className="py-3 text-sm text-muted">Nothing yet. Add your first todo above.</li>
          )}
          {items.map((todo) => (
            <li key={todo.id} className="group flex items-center gap-3 py-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={todo.completed}
                aria-label={
                  todo.completed ? `Mark "${todo.title}" not done` : `Mark "${todo.title}" done`
                }
                onClick={() => update.mutate({ id: todo.id, data: { completed: !todo.completed } })}
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-md border transition",
                  todo.completed
                    ? "border-accent bg-accent text-accent-fg"
                    : "border-border hover:border-accent",
                )}
              >
                {todo.completed && <Check className="size-3.5" aria-hidden />}
              </button>
              <span className={cn("flex-1 text-sm", todo.completed && "text-muted line-through")}>
                {todo.title}
              </span>
              <Button
                variant="danger"
                size="icon"
                aria-label={`Delete "${todo.title}"`}
                onClick={() => remove.mutate({ id: todo.id })}
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
