import {
  ApiError,
  useListAgentTemplates,
  type AgentTemplateDtoOutput,
} from "@projectzero/api-client";
import { FilePlus2 } from "lucide-react";
import { Card } from "../components/card";

/**
 * First step of creating an agent: start blank or from a template. `onPick(null)` means blank.
 */
export function AgentTemplatePicker({
  onPick,
}: {
  onPick: (template: AgentTemplateDtoOutput | null) => void;
}) {
  const templates = useListAgentTemplates();

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div>
        <h2 className="text-base font-semibold">New agent</h2>
        <p className="text-sm text-muted">
          Start from a template and adjust it, or configure everything yourself.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {(templates.data ?? []).map((template) => (
          <li key={template.id}>
            <button
              type="button"
              onClick={() => onPick(template)}
              className="flex h-full w-full gap-3 rounded-lg border border-border p-4 text-left transition hover:border-accent"
            >
              <span aria-hidden className="text-2xl leading-none">
                {template.config.persona.avatar}
              </span>
              <span>
                <span className="block text-sm font-medium">{template.name}</span>
                <span className="block text-xs text-muted">{template.summary}</span>
              </span>
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => onPick(null)}
            className="flex h-full w-full gap-3 rounded-lg border border-dashed border-border p-4 text-left transition hover:border-accent"
          >
            <FilePlus2 className="size-6 shrink-0 text-muted" aria-hidden />
            <span>
              <span className="block text-sm font-medium">Blank agent</span>
              <span className="block text-xs text-muted">Pick every setting yourself.</span>
            </span>
          </button>
        </li>
      </ul>

      {templates.isPending && <p className="text-sm text-muted">Loading templates…</p>}
      {templates.error && (
        <p role="alert" className="text-sm text-danger">
          {templates.error instanceof ApiError
            ? templates.error.message
            : "Could not load templates."}
        </p>
      )}
    </Card>
  );
}
