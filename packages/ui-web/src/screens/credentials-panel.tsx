import {
  ApiError,
  CreateCredentialSchema,
  getListCredentialsQueryKey,
  useCreateCredential,
  useDeleteCredential,
  useListCredentials,
  useUpdateCredential,
  type CredentialDtoOutput,
} from "@projectzero/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "../components/button";
import { Card } from "../components/card";
import { Field } from "../components/field";
import { Input } from "../components/input";

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : "Something went wrong.";

/** One stored credential: shows its name and hint, and lets the user replace or delete it. */
function CredentialRow({ credential }: { credential: CredentialDtoOutput }) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListCredentialsQueryKey() });
  const update = useUpdateCredential();
  const remove = useDeleteCredential();
  const [value, setValue] = useState("");
  const [replacing, setReplacing] = useState(false);

  async function handleReplace(event: FormEvent) {
    event.preventDefault();
    if (!value) return;
    await update.mutateAsync({ id: credential.id, data: { value } });
    await refresh();
    setValue("");
    setReplacing(false);
  }

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-center gap-3">
        <KeyRound className="size-4 shrink-0 text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm">{credential.name}</p>
          <p className="truncate text-xs text-muted">
            {credential.hint ? `••••${credential.hint}` : "••••"}
            {credential.description && ` · ${credential.description}`}
          </p>
        </div>
        <Button type="button" variant="ghost" onClick={() => setReplacing((r) => !r)}>
          Replace
        </Button>
        <Button
          type="button"
          variant="danger"
          size="icon"
          aria-label={`Delete ${credential.name}`}
          disabled={remove.isPending}
          onClick={async () => {
            await remove.mutateAsync({ id: credential.id });
            await refresh();
          }}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
      {replacing && (
        <form onSubmit={handleReplace} className="flex gap-2 pl-7">
          <Input
            type="password"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="New value"
            aria-label={`New value for ${credential.name}`}
          />
          <Button type="submit" disabled={!value || update.isPending}>
            Save
          </Button>
        </form>
      )}
      {(update.error || remove.error) && (
        <p role="alert" className="pl-7 text-sm text-danger">
          {errorText(update.error ?? remove.error)}
        </p>
      )}
    </li>
  );
}

/**
 * The signed-in user's credentials. Autonomous agents use their owner's; assistants use those of
 * whoever is chatting with them. Values are write-only: once saved they're never shown again.
 */
export function CredentialsPanel() {
  const queryClient = useQueryClient();
  const credentials = useListCredentials();
  const create = useCreateCredential();
  const [draft, setDraft] = useState({ name: "", value: "", description: "" });
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    const parsed = CreateCredentialSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" "));
      return;
    }
    setError(null);
    try {
      await create.mutateAsync({ data: parsed.data });
      await queryClient.invalidateQueries({ queryKey: getListCredentialsQueryKey() });
      setDraft({ name: "", value: "", description: "" });
    } catch (err) {
      setError(errorText(err));
    }
  }

  const items = credentials.data ?? [];

  return (
    <Card className="flex flex-col gap-6 p-6">
      <div>
        <h2 className="text-base font-semibold">Credentials</h2>
        <p className="text-sm text-muted">
          API keys and tokens your agents use by name, e.g. <code>GITHUB_TOKEN</code> or{" "}
          <code>{"${GITHUB_TOKEN}"}</code> in env vars and headers. Stored encrypted; values are
          never shown again.
        </p>
      </div>

      <ul className="divide-y divide-border">
        {credentials.isPending && <li className="py-3 text-sm text-muted">Loading…</li>}
        {credentials.error && (
          <li role="alert" className="py-3 text-sm text-danger">
            {errorText(credentials.error)}
          </li>
        )}
        {credentials.isSuccess && items.length === 0 && (
          <li className="py-3 text-sm text-muted">No credentials yet.</li>
        )}
        {items.map((credential) => (
          <CredentialRow key={credential.id} credential={credential} />
        ))}
      </ul>

      <form
        onSubmit={handleAdd}
        className="flex flex-col gap-4 rounded-lg border border-border p-4"
      >
        <h3 className="text-sm font-semibold">Add a credential</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value.toUpperCase() })}
              placeholder="GITHUB_TOKEN"
              className="font-mono"
              maxLength={64}
            />
          </Field>
          <Field label="Value">
            <Input
              type="password"
              autoComplete="off"
              value={draft.value}
              onChange={(e) => setDraft({ ...draft, value: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Description (optional)">
          <Input
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="What it's for"
            maxLength={500}
          />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" className="self-start" disabled={create.isPending}>
          Add credential
        </Button>
      </form>
    </Card>
  );
}
