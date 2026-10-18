import {
  ApiError,
  CreateCredentialSchema,
  getListCredentialsQueryKey,
  GITHUB_APP_CREDENTIAL,
  useCreateCredential,
  useDeleteCredential,
  useListCredentials,
  useListGitHubInstallations,
  useUpdateCredential,
  type CredentialDtoOutput,
  type CredentialScope,
} from "@projectzero/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { GitPullRequest, KeyRound, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "../components/button";
import { Card } from "../components/card";
import { Field } from "../components/field";
import { Input } from "../components/input";
import { Select } from "../components/select";

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : "Something went wrong.";

/** One stored credential: shows its name and hint, and lets the user replace or delete it. */
function CredentialRow({
  credential,
  canEdit,
}: {
  credential: CredentialDtoOutput;
  canEdit: boolean;
}) {
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
        {canEdit && (
          <>
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
          </>
        )}
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

const SCOPES: { scope: CredentialScope; title: string; hint: string }[] = [
  {
    scope: "shared",
    title: "Shared with the organization",
    hint: "Autonomous agents run with these. Owners and admins manage them.",
  },
  {
    scope: "personal",
    title: "Personal",
    hint: "Only you see these. Assistant agents use them when they work for you.",
  },
];

/**
 * Credentials in the active organization: shared ones and the caller's personal ones, plus the
 * built-in GitHub App token. Values are write-only: once saved they're never shown again.
 */
export function CredentialsPanel({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const credentials = useListCredentials();
  const installations = useListGitHubInstallations();
  const create = useCreateCredential();
  const emptyDraft = {
    scope: (isAdmin ? "shared" : "personal") as CredentialScope,
    name: "",
    value: "",
    description: "",
  };
  const [draft, setDraft] = useState(emptyDraft);
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
      setDraft(emptyDraft);
    } catch (err) {
      setError(errorText(err));
    }
  }

  const items = credentials.data ?? [];
  const githubAccounts = (installations.data ?? [])
    .filter((i) => !i.suspended)
    .map((i) => i.accountLogin);

  return (
    <Card className="flex flex-col gap-6 p-6">
      <div>
        <h2 className="text-base font-semibold">Credentials</h2>
        <p className="text-sm text-muted">
          API keys and tokens your agents use by name, e.g. <code>OPENAI_API_KEY</code> or{" "}
          <code>{"${NPM_TOKEN}"}</code> in env vars and headers. Stored encrypted; values are never
          shown again.
        </p>
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
        <GitPullRequest className="size-4 shrink-0 text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm">{GITHUB_APP_CREDENTIAL}</p>
          <p className="text-xs text-muted">
            {githubAccounts.length
              ? `Built in: a short-lived GitHub App token for ${githubAccounts.join(", ")}.`
              : "Built in: install the GitHub App (GitHub, in the sidebar) to use it."}
          </p>
        </div>
      </div>

      {credentials.isPending && <p className="text-sm text-muted">Loading…</p>}
      {credentials.error && (
        <p role="alert" className="text-sm text-danger">
          {errorText(credentials.error)}
        </p>
      )}
      {credentials.isSuccess &&
        SCOPES.map(({ scope, title, hint }) => {
          const scoped = items.filter((c) => c.scope === scope);
          return (
            <section key={scope} className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="text-xs text-muted">{hint}</p>
              <ul className="divide-y divide-border">
                {scoped.length === 0 && <li className="py-3 text-sm text-muted">None yet.</li>}
                {scoped.map((credential) => (
                  <CredentialRow
                    key={credential.id}
                    credential={credential}
                    canEdit={scope === "personal" || isAdmin}
                  />
                ))}
              </ul>
            </section>
          );
        })}

      <form
        onSubmit={handleAdd}
        className="flex flex-col gap-4 rounded-lg border border-border p-4"
      >
        <h3 className="text-sm font-semibold">Add a credential</h3>
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr_1fr]">
          <Field label="For">
            <Select
              value={draft.scope}
              onChange={(e) => setDraft({ ...draft, scope: e.target.value as CredentialScope })}
            >
              <option value="shared" disabled={!isAdmin}>
                Organization
              </option>
              <option value="personal">Just me</option>
            </Select>
          </Field>
          <Field label="Name">
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value.toUpperCase() })}
              placeholder="OPENAI_API_KEY"
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
