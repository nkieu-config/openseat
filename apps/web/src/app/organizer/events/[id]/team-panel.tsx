"use client";

import { UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ConsolePanel } from "@/components/console/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, apiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

type TeamMember = {
  id: string;
  email: string;
  role: string;
  linked: boolean;
  displayName: string | null;
};

type Role = "manager" | "staff";

const SELECT_CLASS =
  "min-h-11 rounded-md border border-console-line bg-console-groove/40 px-2 text-sm";

export function TeamPanel({ eventId }: { eventId: string }) {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [busy, setBusy] = useState(false);
  const [armedRemoveId, setArmedRemoveId] = useState<string | null>(null);

  const fetchTeam = useCallback(async (): Promise<TeamMember[]> => {
    const { data } = await api.GET("/api/events/{eventId}/team", {
      params: { path: { eventId } },
    });
    return (data as unknown as TeamMember[] | undefined) ?? [];
  }, [eventId]);

  const refresh = useCallback(async () => {
    setMembers(await fetchTeam());
  }, [fetchTeam]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await fetchTeam();
      if (!cancelled) {
        setMembers(rows);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchTeam]);

  async function add(submitEvent: React.FormEvent) {
    submitEvent.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      return;
    }
    setBusy(true);
    const { error, response } = await api.POST("/api/events/{eventId}/team", {
      params: { path: { eventId } },
      body: { email: trimmed, role },
    });
    setBusy(false);
    if (!response.ok) {
      toast.error(apiErrorMessage(error, "Could not add that person"));
      return;
    }
    setEmail("");
    toast.success("Added to the team");
    await refresh();
  }

  async function changeRole(memberId: string, nextRole: Role) {
    const { error, response } = await api.PATCH(
      "/api/events/{eventId}/team/{memberId}",
      { params: { path: { eventId, memberId } }, body: { role: nextRole } },
    );
    if (!response.ok) {
      toast.error(apiErrorMessage(error, "Could not change the role"));
      return;
    }
    await refresh();
  }

  async function remove(member: TeamMember) {
    if (armedRemoveId !== member.id) {
      setArmedRemoveId(member.id);
      return;
    }
    setArmedRemoveId(null);
    const { response } = await api.DELETE(
      "/api/events/{eventId}/team/{memberId}",
      { params: { path: { eventId, memberId: member.id } } },
    );
    if (!response.ok) {
      toast.error("Could not remove that person");
      return;
    }
    toast.success("Removed from the team");
    await refresh();
  }

  return (
    <ConsolePanel label="Team">
      <div className="flex flex-col gap-4">
        <form
          onSubmit={(submitEvent) => void add(submitEvent)}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label
              htmlFor="team-email"
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
            >
              Add by email
            </label>
            <Input
              id="team-email"
              type="email"
              value={email}
              onChange={(changeEvent) => setEmail(changeEvent.target.value)}
              placeholder="crew@example.com"
              autoComplete="off"
            />
          </div>
          <select
            aria-label="Role for the new member"
            value={role}
            onChange={(changeEvent) => setRole(changeEvent.target.value as Role)}
            className={SELECT_CLASS}
          >
            <option value="staff">Staff</option>
            <option value="manager">Manager</option>
          </select>
          <Button type="submit" size="sm" disabled={busy || email.trim() === ""}>
            <UserPlus className="size-4" />
            Add
          </Button>
        </form>

        {members === null ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Loading team…
          </p>
        ) : members.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No one else on the team yet — add a manager or door staff by email.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {members.map((member) => (
              <li
                key={member.id}
                className="flex min-h-11 flex-wrap items-center gap-3 rounded-md border border-console-line px-3 py-2"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {member.displayName ?? member.email}
                  </span>
                  {member.displayName ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {member.email}
                    </span>
                  ) : null}
                </div>
                {member.linked ? null : (
                  <Badge variant="outline">pending</Badge>
                )}
                <select
                  aria-label={`Role for ${member.email}`}
                  value={member.role}
                  onChange={(changeEvent) =>
                    void changeRole(member.id, changeEvent.target.value as Role)
                  }
                  className={SELECT_CLASS}
                >
                  <option value="staff">Staff</option>
                  <option value="manager">Manager</option>
                </select>
                <Button
                  variant={armedRemoveId === member.id ? "destructive" : "outline"}
                  size="sm"
                  aria-label={`Remove ${member.email}`}
                  onClick={() => void remove(member)}
                >
                  {armedRemoveId === member.id ? (
                    "Confirm"
                  ) : (
                    <X className="size-4" />
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ConsolePanel>
  );
}
