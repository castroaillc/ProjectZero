import type { ReactAuthClient } from "@projectzero/auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "./button";
import { Input } from "./input";
import { Select } from "./select";

const slugify = (name: string) =>
  `${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * Shows the active organization and switches between the user's organizations. Everything the
 * API returns is scoped to the active one, so switching refetches all queries.
 */
export function OrganizationSwitcher({ authClient }: { authClient: ReactAuthClient }) {
  const queryClient = useQueryClient();
  const orgs = authClient.useListOrganizations();
  const active = authClient.useActiveOrganization();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function switchTo(organizationId: string) {
    setError(null);
    const { error } = await authClient.organization.setActive({ organizationId });
    if (error) return setError(error.message ?? "Couldn't switch organization.");
    await queryClient.invalidateQueries();
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const { data, error } = await authClient.organization.create({
      name: name.trim(),
      slug: slugify(name),
    });
    if (error || !data) return setError(error?.message ?? "Couldn't create the organization.");
    setName("");
    setCreating(false);
    await switchTo(data.id);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-1">
        <Building2 className="size-4 text-muted" aria-hidden />
        <Select
          aria-label="Organization"
          value={active.data?.id ?? ""}
          onChange={(e) => switchTo(e.target.value)}
          className="h-9 w-56"
        >
          {(orgs.data ?? []).map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </Select>
        <Button
          variant="ghost"
          size="icon"
          aria-label="New organization"
          onClick={() => setCreating((c) => !c)}
        >
          <Plus className="size-4" aria-hidden />
        </Button>
      </div>
      {creating && (
        <form onSubmit={handleCreate} className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Organization name"
            aria-label="New organization name"
            className="h-9 w-56"
            autoFocus
          />
          <Button type="submit" className="h-9" disabled={!name.trim()}>
            Create
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** The signed-in member's role in the active organization, and whether it's owner or admin. */
export function useOrgRole(authClient: ReactAuthClient) {
  const member = authClient.useActiveMember();
  const role = member.data?.role ?? "member";
  const isAdmin = role.split(",").some((r) => r.trim() === "owner" || r.trim() === "admin");
  return { role, isAdmin, isPending: member.isPending };
}
