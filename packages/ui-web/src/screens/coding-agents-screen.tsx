import {
  ApiError,
  BUILTIN_TOOLS,
  CreateCodingAgentSchema,
  DEFAULT_AGENT_PERSONA,
  requiredCredentials,
  getListCodingAgentsQueryKey,
  MODEL_PROVIDERS,
  useCreateCodingAgent,
  useDeleteCodingAgent,
  useListCodingAgents,
  useListCredentials,
  useUpdateCodingAgent,
  type AgentIdentity,
  type AgentPersona,
  type BuiltinToolName,
  type CodingAgentDtoOutput,
  type CreateCodingAgent,
  type McpServerConfig,
  type ModelConfig,
  type ModelProvider,
  type SandboxConfig,
  type Skill,
} from "@projectzero/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Check, CircleAlert, KeyRound, Plus, Trash2, User, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { cn } from "../cn";
import { Button } from "../components/button";
import { Card } from "../components/card";
import { Field } from "../components/field";
import { Input } from "../components/input";
import { Select } from "../components/select";
import { Textarea } from "../components/textarea";
import { CredentialsPanel } from "./credentials-panel";

export interface CodingAgentsScreenProps {
  /** Links or buttons shown in the header, e.g. to get back to the todo list. */
  nav?: ReactNode;
}

const MODEL_DEFAULTS: Record<ModelProvider, { model: string; apiKeyCredential?: string }> = {
  ollama: { model: "gpt-oss:20b" },
  anthropic: { model: "claude-sonnet-5-5", apiKeyCredential: "ANTHROPIC_API_KEY" },
  openai: { model: "gpt-5", apiKeyCredential: "OPENAI_API_KEY" },
};

const TOOL_NAMES = Object.keys(BUILTIN_TOOLS) as BuiltinToolName[];

/** The form's state: like a create body, except identity starts unchosen. */
type Draft = Omit<CreateCodingAgent, "identity"> & { identity?: AgentIdentity };

const IDENTITY_OPTIONS = [
  {
    value: "assistant",
    title: "A person's assistant",
    body: "Works for whoever is chatting with it, with their credentials. Each person connects their own accounts the first time.",
    icon: User,
  },
  {
    value: "autonomous",
    title: "Runs on its own",
    body: "Acts with credentials you connect, the same for every run. Needed for scheduled and triggered work.",
    icon: Bot,
  },
] as const satisfies { value: AgentIdentity; title: string; body: string; icon: unknown }[];

function newDraft(): Draft {
  return {
    name: "",
    description: "",
    systemPrompt: "",
    persona: DEFAULT_AGENT_PERSONA,
    model: { provider: "ollama", model: MODEL_DEFAULTS.ollama.model },
    sandbox: {
      image: "node:24-bookworm",
      workdir: "/workspace",
      setupCommands: [],
      network: "bridge",
      cpus: 2,
      memoryMb: 4096,
      timeoutSeconds: 3600,
      env: {},
    },
    tools: TOOL_NAMES.map((name) => ({ name, approval: "auto" })),
    mcpServers: [],
    skills: [],
  };
}

function toDraft({
  id: _id,
  createdAt: _c,
  updatedAt: _u,
  requiredCredentials: _r,
  ...agent
}: CodingAgentDtoOutput) {
  return agent as Draft;
}

const optional = (s: string) => s.trim() || undefined;
const optionalNumber = (s: string) => (s === "" ? undefined : Number(s));

const lines = {
  parse: (text: string) =>
    text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  format: (value: string[]) => value.join("\n"),
};

const keyValues = {
  parse: (text: string) =>
    Object.fromEntries(
      lines.parse(text).map((l) => {
        const i = l.indexOf("=");
        return i === -1 ? [l, ""] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
    ),
  format: (value: Record<string, string>) =>
    Object.entries(value)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n"),
};

/**
 * A textarea edited as free text but reported as structured data (lines, KEY=value pairs), so
 * half-typed lines aren't lost while the user is still typing them.
 */
function TextField<T>({
  label,
  value,
  onChange,
  codec,
  placeholder,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  codec: { parse: (text: string) => T; format: (value: T) => string };
  placeholder?: string;
}) {
  const [text, setText] = useState(() => codec.format(value));
  return (
    <Field label={label}>
      <Textarea
        value={text}
        placeholder={placeholder}
        className="font-mono text-xs"
        onChange={(e) => {
          setText(e.target.value);
          onChange(codec.parse(e.target.value));
        }}
      />
    </Field>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-border pt-6 first:border-t-0 first:pt-0">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

let keySeq = 0;
const nextKey = () => ++keySeq;

/** Stable React keys for a list the user can add to and remove from. */
function useListKeys(length: number) {
  const [keys, setKeys] = useState(() => Array.from({ length }, nextKey));
  return {
    keys,
    add: () => setKeys((k) => [...k, nextKey()]),
    remove: (index: number) => setKeys((k) => k.filter((_, i) => i !== index)),
  };
}

interface Issue {
  path: PropertyKey[];
  message: string;
}

/** Validation issues from a 400 response (nestjs-zod puts zod issues under `errors`). */
function issuesFrom(error: unknown): Issue[] | null {
  if (!(error instanceof ApiError) || error.status !== 400) return null;
  const errors = (error.body as { errors?: Issue[] } | undefined)?.errors;
  return Array.isArray(errors) ? errors : null;
}

function AgentEditor({
  agent,
  onSaved,
  onDeleted,
}: {
  agent: CodingAgentDtoOutput | null;
  onSaved: (id: string) => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListCodingAgentsQueryKey() });
  const create = useCreateCodingAgent();
  const update = useUpdateCodingAgent();
  const remove = useDeleteCodingAgent();

  const credentials = useListCredentials();
  const [draft, setDraft] = useState<Draft>(() => (agent ? toDraft(agent) : newDraft()));
  const [issues, setIssues] = useState<Issue[]>([]);
  const [saved, setSaved] = useState(false);
  const mcpKeys = useListKeys(draft.mcpServers.length);
  const skillKeys = useListKeys(draft.skills.length);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setSaved(false);
    setDraft((d) => ({ ...d, [key]: value }));
  };
  const setPersona = (patch: Partial<AgentPersona>) =>
    set("persona", { ...draft.persona, ...patch });
  const setGit = (patch: Partial<AgentPersona["git"]>) =>
    setPersona({ git: { ...draft.persona.git, ...patch } });
  const setModel = (patch: Partial<ModelConfig>) => set("model", { ...draft.model, ...patch });
  const setSandbox = (patch: Partial<SandboxConfig>) =>
    set("sandbox", { ...draft.sandbox, ...patch });
  const setMcp = (index: number, server: McpServerConfig) =>
    set(
      "mcpServers",
      draft.mcpServers.map((s, i) => (i === index ? server : s)),
    );
  const setSkill = (index: number, patch: Partial<Skill>) =>
    set(
      "skills",
      draft.skills.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = CreateCodingAgentSchema.safeParse(draft);
    if (!parsed.success) {
      setIssues(parsed.error.issues);
      return;
    }
    setIssues([]);
    try {
      const result = agent
        ? await update.mutateAsync({ id: agent.id, data: parsed.data })
        : await create.mutateAsync({ data: parsed.data });
      await refresh();
      setSaved(true);
      onSaved(result.id);
    } catch (err) {
      setIssues(
        issuesFrom(err) ?? [
          { path: [], message: err instanceof ApiError ? err.message : "Could not save." },
        ],
      );
    }
  }

  async function handleDelete() {
    if (!agent) return;
    await remove.mutateAsync({ id: agent.id });
    await refresh();
    onDeleted();
  }

  const pending = create.isPending || update.isPending;
  const connected = new Set((credentials.data ?? []).map((c) => c.name));
  const needed = requiredCredentials(draft);

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <datalist id="credential-names">
          {(credentials.data ?? []).map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>

        <Section
          title="How will this agent work?"
          hint={
            agent
              ? "Fixed when the agent was created."
              : "This decides whose accounts its actions use, and can't be changed later."
          }
        >
          <div role="radiogroup" aria-label="Identity" className="grid gap-3 sm:grid-cols-2">
            {IDENTITY_OPTIONS.map(({ value, title, body, icon: Icon }) => {
              const checked = draft.identity === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  disabled={!!agent && !checked}
                  onClick={() => !agent && set("identity", value)}
                  className={cn(
                    "flex gap-3 rounded-lg border p-4 text-left transition",
                    checked ? "border-accent bg-accent/10" : "border-border hover:border-accent",
                    agent && "cursor-default",
                    "disabled:opacity-40 disabled:hover:border-border",
                  )}
                >
                  <Icon className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
                  <span>
                    <span className="block text-sm font-medium">{title}</span>
                    <span className="block text-xs text-muted">{body}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="Agent">
          <Field label="Name">
            <Input
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. repo-maintainer"
              maxLength={100}
              required
            />
          </Field>
          <Field label="Description">
            <Input
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What is this agent for?"
              maxLength={500}
            />
          </Field>
          <Field label="System prompt">
            <Textarea
              value={draft.systemPrompt}
              onChange={(e) => set("systemPrompt", e.target.value)}
              placeholder="Extra instructions, added to the harness's base prompt."
              className="min-h-28"
            />
          </Field>
        </Section>

        <Section
          title="Persona"
          hint="How the agent presents itself, and who its commits in the sandbox are attributed to."
        >
          <div className="grid gap-4 sm:grid-cols-[6rem_1fr]">
            <Field label="Avatar">
              <Input
                value={draft.persona.avatar}
                onChange={(e) => setPersona({ avatar: e.target.value })}
                maxLength={16}
                className="text-center text-lg"
              />
            </Field>
            <Field label="Role">
              <Input
                value={draft.persona.role}
                onChange={(e) => setPersona({ role: e.target.value })}
                placeholder="e.g. Senior TypeScript engineer"
                maxLength={200}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Git author name">
              <Input
                value={draft.persona.git.name}
                onChange={(e) => setGit({ name: e.target.value })}
              />
            </Field>
            <Field label="Git author email">
              <Input
                type="email"
                value={draft.persona.git.email}
                onChange={(e) => setGit({ email: e.target.value })}
              />
            </Field>
            <Field label="Push token credential (optional)">
              <Input
                list="credential-names"
                value={draft.persona.git.tokenCredential ?? ""}
                onChange={(e) => setGit({ tokenCredential: optional(e.target.value) })}
                placeholder="GITHUB_TOKEN"
                className="font-mono"
              />
            </Field>
          </div>
        </Section>

        <Section title="Model" hint="The model must support tool calling.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Provider">
              <Select
                value={draft.model.provider}
                onChange={(e) => {
                  const provider = e.target.value as ModelProvider;
                  set("model", { provider, ...MODEL_DEFAULTS[provider] });
                }}
              >
                {MODEL_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Model">
              <Input
                value={draft.model.model}
                onChange={(e) => setModel({ model: e.target.value })}
                placeholder={MODEL_DEFAULTS[draft.model.provider].model}
              />
            </Field>
            <Field label="Base URL (optional)">
              <Input
                value={draft.model.baseUrl ?? ""}
                onChange={(e) => setModel({ baseUrl: optional(e.target.value) })}
                placeholder={
                  draft.model.provider === "ollama" ? "Server's OLLAMA_BASE_URL" : "Vendor default"
                }
              />
            </Field>
            {draft.model.provider !== "ollama" && (
              <Field label="API key credential">
                <Input
                  list="credential-names"
                  value={draft.model.apiKeyCredential ?? ""}
                  onChange={(e) => setModel({ apiKeyCredential: optional(e.target.value) })}
                  className="font-mono"
                />
              </Field>
            )}
            <Field label="Temperature (optional)">
              <Input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={draft.model.temperature ?? ""}
                onChange={(e) => setModel({ temperature: optionalNumber(e.target.value) })}
              />
            </Field>
            <Field label="Max output tokens (optional)">
              <Input
                type="number"
                min={1}
                value={draft.model.maxTokens ?? ""}
                onChange={(e) => setModel({ maxTokens: optionalNumber(e.target.value) })}
              />
            </Field>
          </div>
        </Section>

        <Section title="Sandbox" hint="The Docker container the agent's tools run in.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Image">
              <Input
                value={draft.sandbox.image}
                onChange={(e) => setSandbox({ image: e.target.value })}
                className="font-mono"
              />
            </Field>
            <Field label="Working directory">
              <Input
                value={draft.sandbox.workdir}
                onChange={(e) => setSandbox({ workdir: e.target.value })}
                className="font-mono"
              />
            </Field>
            <Field label="Repository URL (optional)">
              <Input
                value={draft.sandbox.repo?.url ?? ""}
                onChange={(e) => {
                  const url = optional(e.target.value);
                  setSandbox({ repo: url ? { ...draft.sandbox.repo, url } : undefined });
                }}
                placeholder="https://github.com/org/repo.git"
              />
            </Field>
            <Field label="Branch, tag or commit">
              <Input
                value={draft.sandbox.repo?.ref ?? ""}
                disabled={!draft.sandbox.repo}
                onChange={(e) =>
                  draft.sandbox.repo &&
                  setSandbox({ repo: { ...draft.sandbox.repo, ref: optional(e.target.value) } })
                }
                placeholder="Default branch"
              />
            </Field>
            <Field label="Network">
              <Select
                value={draft.sandbox.network}
                onChange={(e) =>
                  setSandbox({ network: e.target.value as SandboxConfig["network"] })
                }
              >
                <option value="bridge">Outbound allowed</option>
                <option value="none">No network</option>
              </Select>
            </Field>
            <Field label="Timeout (seconds)">
              <Input
                type="number"
                min={60}
                value={draft.sandbox.timeoutSeconds}
                onChange={(e) =>
                  setSandbox({ timeoutSeconds: optionalNumber(e.target.value) as number })
                }
              />
            </Field>
            <Field label="CPUs">
              <Input
                type="number"
                min={0.25}
                max={16}
                step={0.25}
                value={draft.sandbox.cpus}
                onChange={(e) => setSandbox({ cpus: optionalNumber(e.target.value) as number })}
              />
            </Field>
            <Field label="Memory (MiB)">
              <Input
                type="number"
                min={256}
                step={256}
                value={draft.sandbox.memoryMb}
                onChange={(e) => setSandbox({ memoryMb: optionalNumber(e.target.value) as number })}
              />
            </Field>
          </div>
          <TextField
            label="Setup commands (one per line)"
            value={draft.sandbox.setupCommands}
            onChange={(setupCommands) => setSandbox({ setupCommands })}
            codec={lines}
            placeholder={"corepack enable\npnpm install"}
          />
          <TextField
            label="Environment (KEY=value per line; ${NAME} inserts a credential)"
            value={draft.sandbox.env}
            onChange={(env) => setSandbox({ env })}
            codec={keyValues}
            placeholder={"CI=1\nGITHUB_TOKEN=${GITHUB_TOKEN}"}
          />
        </Section>

        <Section
          title="Tools"
          hint="Built-in tools, all run inside the sandbox. “Ask” pauses for your approval."
        >
          <ul className="divide-y divide-border rounded-lg border border-border">
            {TOOL_NAMES.map((name) => {
              const tool = draft.tools.find((t) => t.name === name);
              return (
                <li key={name} className="flex items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    id={`tool-${name}`}
                    checked={!!tool}
                    onChange={(e) =>
                      set(
                        "tools",
                        e.target.checked
                          ? TOOL_NAMES.flatMap((n) =>
                              n === name
                                ? [{ name, approval: "auto" as const }]
                                : draft.tools.filter((t) => t.name === n),
                            )
                          : draft.tools.filter((t) => t.name !== name),
                      )
                    }
                    className="size-4 accent-accent"
                  />
                  <label htmlFor={`tool-${name}`} className="flex-1 text-sm">
                    <span className="font-mono">{name}</span>
                    <span className="ml-2 text-muted">{BUILTIN_TOOLS[name]}</span>
                  </label>
                  <Select
                    aria-label={`${name} approval`}
                    value={tool?.approval ?? "auto"}
                    disabled={!tool}
                    onChange={(e) =>
                      set(
                        "tools",
                        draft.tools.map((t) =>
                          t.name === name
                            ? { ...t, approval: e.target.value as "auto" | "ask" }
                            : t,
                        ),
                      )
                    }
                    className="h-8 w-24"
                  >
                    <option value="auto">Auto</option>
                    <option value="ask">Ask</option>
                  </Select>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section
          title="MCP servers"
          hint="stdio servers start inside the sandbox; HTTP servers are called from the harness."
        >
          {draft.mcpServers.map((server, i) => (
            <div
              key={mcpKeys.keys[i]}
              className="flex flex-col gap-4 rounded-lg border border-border p-4"
            >
              <div className="grid gap-4 sm:grid-cols-[1fr_8rem_8rem_auto] sm:items-end">
                <Field label="Name">
                  <Input
                    value={server.name}
                    onChange={(e) => setMcp(i, { ...server, name: e.target.value })}
                    placeholder="github"
                    className="font-mono"
                  />
                </Field>
                <Field label="Transport">
                  <Select
                    value={server.transport}
                    onChange={(e) => {
                      const base = { name: server.name, approval: server.approval };
                      setMcp(
                        i,
                        e.target.value === "http"
                          ? { ...base, transport: "http", url: "", headers: {} }
                          : { ...base, transport: "stdio", command: "", args: [], env: {} },
                      );
                    }}
                  >
                    <option value="stdio">stdio</option>
                    <option value="http">HTTP</option>
                  </Select>
                </Field>
                <Field label="Approval">
                  <Select
                    value={server.approval}
                    onChange={(e) =>
                      setMcp(i, { ...server, approval: e.target.value as "auto" | "ask" })
                    }
                  >
                    <option value="ask">Ask</option>
                    <option value="auto">Auto</option>
                  </Select>
                </Field>
                <Button
                  type="button"
                  variant="danger"
                  size="icon"
                  aria-label={`Remove MCP server ${server.name || i + 1}`}
                  onClick={() => {
                    mcpKeys.remove(i);
                    set(
                      "mcpServers",
                      draft.mcpServers.filter((_, j) => j !== i),
                    );
                  }}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
              {server.transport === "stdio" ? (
                <>
                  <Field label="Command">
                    <Input
                      value={server.command}
                      onChange={(e) => setMcp(i, { ...server, command: e.target.value })}
                      placeholder="npx"
                      className="font-mono"
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      key={`args-${server.transport}`}
                      label="Arguments (one per line)"
                      value={server.args}
                      onChange={(args) => setMcp(i, { ...server, args })}
                      codec={lines}
                      placeholder={"-y\n@modelcontextprotocol/server-github"}
                    />
                    <TextField
                      key={`env-${server.transport}`}
                      label="Environment (KEY=value)"
                      value={server.env}
                      onChange={(env) => setMcp(i, { ...server, env })}
                      codec={keyValues}
                      placeholder="GITHUB_TOKEN=${GITHUB_TOKEN}"
                    />
                  </div>
                </>
              ) : (
                <>
                  <Field label="URL">
                    <Input
                      value={server.url}
                      onChange={(e) => setMcp(i, { ...server, url: e.target.value })}
                      placeholder="https://example.com/mcp"
                    />
                  </Field>
                  <TextField
                    key={`headers-${server.transport}`}
                    label="Headers (Name=value)"
                    value={server.headers}
                    onChange={(headers) => setMcp(i, { ...server, headers })}
                    codec={keyValues}
                    placeholder="Authorization=Bearer ${MCP_TOKEN}"
                  />
                </>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            onClick={() => {
              mcpKeys.add();
              set("mcpServers", [
                ...draft.mcpServers,
                { name: "", approval: "ask", transport: "stdio", command: "", args: [], env: {} },
              ]);
            }}
          >
            <Plus className="size-4" aria-hidden /> Add MCP server
          </Button>
        </Section>

        <Section
          title="Skills"
          hint="The model sees each description up front and loads the instructions when needed."
        >
          {draft.skills.map((skill, i) => (
            <div
              key={skillKeys.keys[i]}
              className="flex flex-col gap-4 rounded-lg border border-border p-4"
            >
              <div className="grid gap-4 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
                <Field label="Name">
                  <Input
                    value={skill.name}
                    onChange={(e) => setSkill(i, { name: e.target.value })}
                    placeholder="write-tests"
                    className="font-mono"
                  />
                </Field>
                <Field label="When to use it">
                  <Input
                    value={skill.description}
                    onChange={(e) => setSkill(i, { description: e.target.value })}
                    placeholder="Use when adding or fixing tests."
                    maxLength={1024}
                  />
                </Field>
                <Button
                  type="button"
                  variant="danger"
                  size="icon"
                  aria-label={`Remove skill ${skill.name || i + 1}`}
                  onClick={() => {
                    skillKeys.remove(i);
                    set(
                      "skills",
                      draft.skills.filter((_, j) => j !== i),
                    );
                  }}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
              <Field label="Instructions (Markdown)">
                <Textarea
                  value={skill.instructions}
                  onChange={(e) => setSkill(i, { instructions: e.target.value })}
                  className="min-h-32 font-mono text-xs"
                />
              </Field>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            onClick={() => {
              skillKeys.add();
              set("skills", [...draft.skills, { name: "", description: "", instructions: "" }]);
            }}
          >
            <Plus className="size-4" aria-hidden /> Add skill
          </Button>
        </Section>

        <Section
          title="Credentials"
          hint={
            draft.identity === "assistant"
              ? "Each person who chats with this agent connects their own. Yours are checked below."
              : "Runs use these from your credentials."
          }
        >
          {needed.length === 0 ? (
            <p className="text-sm text-muted">This config doesn't use any credentials.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {needed.map((name) => (
                <li key={name} className="flex items-center gap-2 text-sm">
                  {connected.has(name) ? (
                    <Check className="size-4 text-accent" aria-hidden />
                  ) : (
                    <CircleAlert className="size-4 text-danger" aria-hidden />
                  )}
                  <span className="font-mono">{name}</span>
                  <span className="text-muted">
                    {connected.has(name) ? "connected" : "not in your credentials yet"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {issues.length > 0 && (
          <ul role="alert" className="flex flex-col gap-1 text-sm text-danger">
            {issues.map((issue, i) => (
              <li key={i}>
                {issue.path.length > 0 && (
                  <span className="font-mono">{issue.path.map(String).join(".")}: </span>
                )}
                {issue.message}
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-3 border-t border-border pt-6">
          <Button type="submit" disabled={pending}>
            {agent ? "Save changes" : "Create agent"}
          </Button>
          {saved && <span className="text-sm text-muted">Saved.</span>}
          {agent && (
            <Button
              type="button"
              variant="danger"
              className="ml-auto"
              disabled={remove.isPending}
              onClick={handleDelete}
            >
              <Trash2 className="size-4" aria-hidden /> Delete
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

/** Lists the user's coding agents and edits one at a time. Shared by web and desktop. */
export function CodingAgentsScreen({ nav }: CodingAgentsScreenProps) {
  const agents = useListCodingAgents();
  const [selected, setSelected] = useState<string | "new" | "credentials" | null>(null);
  const items = agents.data ?? [];
  const current = items.find((a) => a.id === selected) ?? null;
  const editing = selected === "new" || current !== null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Coding agents</h1>
          <p className="text-sm text-muted">
            Identity, persona, model, sandbox, tools, MCP servers and skills.
          </p>
        </div>
        {nav}
      </header>

      <div className="mt-6 grid gap-6 md:grid-cols-[15rem_1fr] md:items-start">
        <Card className="p-2">
          <Button
            variant={selected === "new" ? "primary" : "ghost"}
            className="w-full justify-start"
            onClick={() => setSelected("new")}
          >
            <Plus className="size-4" aria-hidden /> New agent
          </Button>
          <ul className="mt-1 flex flex-col">
            {agents.isPending && <li className="px-3 py-2 text-sm text-muted">Loading…</li>}
            {agents.error && (
              <li role="alert" className="px-3 py-2 text-sm text-danger">
                {agents.error instanceof ApiError ? agents.error.message : "Could not load."}
              </li>
            )}
            {items.map((agent) => (
              <li key={agent.id}>
                <button
                  type="button"
                  onClick={() => setSelected(agent.id)}
                  aria-current={agent.id === selected}
                  className={cn(
                    "flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm transition",
                    agent.id === selected ? "bg-border/60" : "hover:bg-border/40",
                  )}
                >
                  <span className="font-medium">
                    <span aria-hidden className="mr-1.5">
                      {agent.persona.avatar}
                    </span>
                    {agent.name}
                  </span>
                  <span className="truncate text-xs text-muted">
                    {agent.identity === "assistant" ? "Assistant" : "Autonomous"} ·{" "}
                    {agent.model.model}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1 border-t border-border pt-1">
            <Button
              variant={selected === "credentials" ? "primary" : "ghost"}
              className="w-full justify-start"
              onClick={() => setSelected("credentials")}
            >
              <KeyRound className="size-4" aria-hidden /> Credentials
            </Button>
          </div>
        </Card>

        {selected === "credentials" ? (
          <CredentialsPanel />
        ) : editing ? (
          <AgentEditor
            key={selected}
            agent={current}
            onSaved={(id) => setSelected(id)}
            onDeleted={() => setSelected(null)}
          />
        ) : (
          <Card className="flex flex-col items-center gap-3 py-16 text-center">
            <Bot className="size-8 text-muted" aria-hidden />
            <p className="text-sm text-muted">
              {items.length ? "Pick an agent to edit it." : "No agents yet."}
            </p>
            <Button onClick={() => setSelected("new")}>
              <Plus className="size-4" aria-hidden /> New agent
            </Button>
          </Card>
        )}
      </div>
    </main>
  );
}
