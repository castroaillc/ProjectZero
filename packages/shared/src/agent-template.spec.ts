import { describe, expect, it } from "vitest";
import { AGENT_TEMPLATES, findAgentTemplate } from "./agent-template";
import { AGENT_IDENTITIES, CreateCodingAgentSchema, requiredCredentials } from "./coding-agent";

describe.each(AGENT_TEMPLATES.map((t) => [t.id, t] as const))("template %s", (_id, template) => {
  it.each(AGENT_IDENTITIES)("creates a valid %s agent", (identity) => {
    const result = CreateCodingAgentSchema.safeParse({
      ...template.config,
      identity,
      templateId: template.id,
    });
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it("documents every credential its config uses", () => {
    const documented = template.credentials.map((c) => c.name).sort();
    expect(requiredCredentials(template.config)).toEqual(documented);
  });

  it("mentions every skill it ships in the system prompt", () => {
    for (const skill of template.config.skills)
      expect(template.config.systemPrompt).toContain(skill.name);
  });
});

describe("findAgentTemplate", () => {
  it("finds built-in templates by id", () => {
    expect(findAgentTemplate("project-manager")?.name).toBe("Project manager");
    expect(findAgentTemplate("nope")).toBeUndefined();
  });

  it("has unique ids", () => {
    const ids = AGENT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
