"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import {
  updateStaffRole,
  assignStaffToOrg,
  removeStaffFromOrg,
  getOrCreateJoinCode,
  regenerateJoinCode,
} from "./actions";
import { ROLE_LABELS, ROLE_DESCRIPTIONS } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs } from "@/components/ui/tabs";

type StaffMember = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  created_at: string;
};

type AuditLog = {
  id: string;
  actor_name: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type Props = {
  staff: StaffMember[];
  auditLogs: AuditLog[];
  currentUserId: string;
  currentUserRole: string;
};

const ASSIGNABLE_ROLES = [
  "admin",
  "warehouse",
  "dispatcher",
  "driver",
  "staff",
];

export default function StaffClient({
  staff: initialStaff,
  auditLogs,
  currentUserId,
  currentUserRole,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Local state for optimistic updates
  const [staff, setStaff] = useState(initialStaff);

  // Per-action loading
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const [tab, setTab] = useState("team");
  const [showAssign, setShowAssign] = useState(false);
  const [removeFor, setRemoveFor] = useState<StaffMember | null>(null);

  const [assignForm, setAssignForm] = useState({ email: "", role: "driver" });

  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [joinCodeError, setJoinCodeError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const canManage = currentUserRole === "owner" || currentUserRole === "admin";
  const canSeeJoinCode = canManage;

  // Join code is owner/admin only — fetch on demand when the tab is opened.
  useEffect(() => {
    if (tab !== "join" || !canSeeJoinCode || joinCode || joinCodeError) return;
    startTransition(async () => {
      const result = await getOrCreateJoinCode() as { error?: string; code?: string; orgName?: string };
      if (result?.error) {
        setJoinCodeError(result.error);
      } else {
        setJoinCode(result.code ?? null);
        setOrgName(result.orgName ?? null);
      }
    });
  }, [tab, canSeeJoinCode, joinCode, joinCodeError]);

  // ---- Optimistic handlers ----

  const handleRoleChange = useCallback((staffId: string, newRole: string) => {
    setError(null);
    setSuccess(null);

    // Snapshot for rollback
    const member = staff.find((s) => s.id === staffId);
    const prevRole = member?.role;

    // Optimistic local update — change role instantly
    setStaff((prev) =>
      prev.map((s) => (s.id === staffId ? { ...s, role: newRole } : s)),
    );
    setPendingAction(`role-${staffId}`);

    startTransition(async () => {
      const result = await updateStaffRole(staffId, newRole);
      setPendingAction(null);
      if (result?.error) {
        setError(result.error);
        // Rollback
        if (prevRole) {
          setStaff((prev) =>
            prev.map((s) => (s.id === staffId ? { ...s, role: prevRole } : s)),
          );
        }
      } else {
        setSuccess("Role updated.");
        router.refresh();
      }
    });
  }, [staff, router]);

  const handleAssign = useCallback(() => {
    setError(null);
    setSuccess(null);

    // Close modal + reset INSTANTLY
    const formData = { ...assignForm };
    setShowAssign(false);
    setAssignForm({ email: "", role: "driver" });
    setPendingAction("assign-staff");

    startTransition(async () => {
      const result = await assignStaffToOrg(formData.email, formData.role);
      setPendingAction(null);
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess(`${formData.email} added to the team.`);
        router.refresh();
      }
    });
  }, [assignForm, router]);

  const handleRemove = useCallback(() => {
    if (!removeFor) return;
    setError(null);
    setSuccess(null);

    const removed = removeFor;
    const removedId = removeFor.id;

    // Close modal INSTANTLY
    setRemoveFor(null);
    setPendingAction(`remove-${removedId}`);

    // Optimistic local update — remove from list instantly
    setStaff((prev) => prev.filter((s) => s.id !== removedId));

    startTransition(async () => {
      const result = await removeStaffFromOrg(removedId);
      setPendingAction(null);
      if (result?.error) {
        setError(result.error);
        // Rollback — re-add
        setStaff((prev) => [...prev, removed]);
      } else {
        setSuccess(`${removed.full_name || removed.email || "Member"} removed.`);
        router.refresh();
      }
    });
  }, [removeFor, router]);

  const handleRegenerate = useCallback(() => {
    setError(null);
    setSuccess(null);
    setPendingAction("regenerate-code");

    startTransition(async () => {
      const result = await regenerateJoinCode() as { error?: string; code?: string };
      setPendingAction(null);
      if (result?.error) {
        setError(result.error);
      } else {
        setJoinCode(result.code ?? null);
        setSuccess("Join code regenerated. The old code no longer works.");
      }
    });
  }, []);

  async function handleCopy() {
    if (!joinCode) return;
    try {
      await navigator.clipboard.writeText(joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy automatically — select the code and copy it manually.");
    }
  }

  return (
    <div className="min-w-0 space-y-6 overflow-x-[clip]">
      {error && (
        <div
          role="alert"
          className="rounded-control border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-control border border-brand/20 bg-brand-soft px-4 py-3 text-sm text-brand-ink">
          {success}
        </div>
      )}

      <div className="border-b border-line">
        <Tabs
          items={[
            { id: "team", label: "Team", count: staff.length },
            ...(canSeeJoinCode ? [{ id: "join", label: "Join code" }] : []),
            { id: "audit", label: "Audit log", count: auditLogs.length },
          ]}
          active={tab}
          onChange={setTab}
          className="border-b-0"
        />
      </div>

      {/* ---- Team ---- */}
      {tab === "team" && (
        <section className="rounded-card border border-line bg-surface ring-1 ring-black/[0.02]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h2 className="text-base font-medium tracking-[-0.01em] text-ink">
              Team members
            </h2>
            {canManage && (
              <Button size="sm" onClick={() => setShowAssign(true)}>
                <UserPlus size={14} aria-hidden="true" />
                Add member
              </Button>
            )}
          </div>

          {staff.length === 0 ? (
            <EmptyState
              icon={<Users size={22} strokeWidth={1.75} />}
              title="No team members yet"
              description="Add a member by their email, or share your join code."
            />
          ) : (
            <div className="max-w-full overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-sunken text-[11px] uppercase tracking-[0.08em] text-ink-muted">
                  <tr>
                    <th className="px-3 py-2.5 sm:px-5 font-medium">Member</th>
                    <th className="px-3 py-2.5 sm:px-5 font-medium">Role</th>
                    <th className="hidden px-3 py-2.5 font-medium sm:table-cell sm:px-5">Joined</th>
                    {canManage && (
                      <th className="px-3 py-2.5 sm:px-5 text-right font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {staff.map((member) => {
                    const isSelf = member.id === currentUserId;
                    return (
                      <tr
                        key={member.id}
                        className="transition-colors hover:bg-sunken/60"
                      >
                        <td className="px-3 py-3 sm:px-5">
                          <div className="flex items-center gap-3">
                            <span
                              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-ink"
                              aria-hidden="true"
                            >
                              {(member.full_name || member.email || "?")
                                .charAt(0)
                                .toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 font-medium text-ink">
                                {member.full_name || "Unnamed"}
                                {isSelf && (
                                  <span className="text-[10px] font-normal uppercase tracking-[0.08em] text-ink-faint">
                                    You
                                  </span>
                                )}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-ink-muted">
                                {member.email || "—"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 sm:px-5">
                          {canManage && !isSelf ? (
                            <select
                              value={member.role}
                              onChange={(e) =>
                                handleRoleChange(member.id, e.target.value)
                              }
                              disabled={pendingAction === `role-${member.id}`}
                              aria-label={`Role for ${member.full_name || member.email}`}
                              className="h-8 rounded-control border border-line-strong bg-surface px-2.5 text-xs text-ink transition-colors hover:border-ink-faint focus:border-brand focus:outline-none disabled:opacity-50"
                            >
                              {["owner", ...ASSIGNABLE_ROLES].map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABELS[r] ?? r}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <Badge tone={member.role === "owner" ? "brand" : "muted"}>
                              {ROLE_LABELS[member.role] ?? member.role}
                            </Badge>
                          )}
                        </td>
<td className="hidden whitespace-nowrap px-3 py-3 text-xs text-ink-faint sm:table-cell sm:px-5">
                          {new Date(member.created_at).toLocaleDateString()}
                        </td>
                        {canManage && (
                          <td className="px-3 py-3 sm:px-5 text-right">
                            {!isSelf && (
                              <button
                                onClick={() => setRemoveFor(member)}
                                aria-label={`Remove ${member.full_name || member.email}`}
                                className="text-ink-faint transition-colors hover:text-danger"
                              >
                                <Trash2 size={15} aria-hidden="true" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ---- Join code ---- */}
      {tab === "join" && canSeeJoinCode && (
        <section className="rounded-card border border-line bg-surface ring-1 ring-black/[0.02]">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-base font-medium tracking-[-0.01em] text-ink">
              Organization join code
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {orgName
                ? `Share this code with new team members so they can join ${orgName}.`
                : "Share this code with new team members so they can join your organization."}
            </p>
          </div>
          <div className="p-5">
            {joinCodeError && (
              <div
                role="alert"
                className="rounded-control border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger"
              >
                {joinCodeError}
              </div>
            )}
            {joinCode ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-control border border-line bg-sunken px-4 py-3">
                  <KeyRound size={16} className="shrink-0 text-brand" aria-hidden="true" />
                  <code className="flex-1 font-mono text-base font-semibold tracking-[0.1em] text-ink sm:text-lg sm:tracking-[0.2em]">
                    {joinCode}
                  </code>
                  <Button size="sm" variant="outline" onClick={handleCopy}>
                    <Copy size={13} aria-hidden="true" />
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="text-xs text-ink-muted">
                  A new team member signs up at the login page, then enters this code
                  on the onboarding screen to join your organization.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRegenerate}
                  loading={pendingAction === "regenerate-code"}
                >
                  <RefreshCw size={13} aria-hidden="true" />
                  Regenerate code
                </Button>
              </div>
            ) : !joinCodeError ? (
              <div className="flex items-center justify-center py-10">
                <div className="size-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              </div>
            ) : null}
          </div>
        </section>
      )}

      {/* ---- Audit log ---- */}
      {tab === "audit" && (
        <section className="rounded-card border border-line bg-surface ring-1 ring-black/[0.02]">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-base font-medium tracking-[-0.01em] text-ink">
              Audit log
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Recent changes made by members of your organization.
            </p>
          </div>
          {auditLogs.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck size={22} strokeWidth={1.75} />}
              title="No activity yet"
              description="Actions like creating dispatches, changing roles, and recording stock movements will appear here."
            />
          ) : (
            <div className="max-w-full overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-sunken text-[11px] uppercase tracking-[0.08em] text-ink-muted">
                  <tr>
                    <th className="px-3 py-2.5 sm:px-5 font-medium">Time</th>
                    <th className="px-3 py-2.5 sm:px-5 font-medium">Actor</th>
                    <th className="px-3 py-2.5 sm:px-5 font-medium">Action</th>
<th className="hidden px-3 py-2.5 font-medium sm:table-cell sm:px-5">Entity</th>
                    <th className="hidden px-3 py-2.5 font-medium sm:table-cell sm:px-5">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="transition-colors hover:bg-sunken/60">
                      <td className="whitespace-nowrap px-3 py-3 sm:px-5 text-xs text-ink-faint">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-3 sm:px-5 font-medium text-ink">
                        {log.actor_name}
                      </td>
                      <td className="px-3 py-3 sm:px-5">
                        <Badge tone="muted">{log.action}</Badge>
                      </td>
<td className="hidden px-3 py-3 font-mono text-xs text-ink-muted sm:table-cell sm:px-5">
                        {log.entity_type ?? "—"}
                        {log.entity_id ? ` · ${log.entity_id.slice(0, 8)}` : ""}
                      </td>
                      <td className="hidden px-3 py-3 text-xs text-ink-muted sm:table-cell sm:px-5">
                        {log.metadata
                          ? Object.entries(log.metadata)
                              .map(([k, v]) => `${k}: ${String(v)}`)
                              .join(", ")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ---- Modals ---- */}

      <Modal
        open={showAssign}
        onClose={() => setShowAssign(false)}
        title="Add member"
      >
        <div className="space-y-4">
          <Input
            label="Email address"
            type="email"
            value={assignForm.email}
            onChange={(e) =>
              setAssignForm({ ...assignForm, email: e.target.value })
            }
            placeholder="teammate@company.com"
          />
          <Select
            label="Role"
            value={assignForm.role}
            onChange={(e) =>
              setAssignForm({ ...assignForm, role: e.target.value })
            }
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r] ?? r} — {ROLE_DESCRIPTIONS[r]}
              </option>
            ))}
          </Select>
          <p className="text-xs text-ink-muted">
            The user must already have signed up at the login page. Their profile
            will be attached to your organization with the chosen role.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowAssign(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAssign}
              loading={pendingAction === "assign-staff"}
              disabled={!assignForm.email.trim()}
            >
              <UserPlus size={15} aria-hidden="true" />
              Add member
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={removeFor !== null}
        onClose={() => setRemoveFor(null)}
        title="Remove member"
      >
        <p className="text-sm text-ink-muted">
          Remove {removeFor?.full_name || removeFor?.email} from the organization?
          Their account stays, but they lose access to this workspace.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setRemoveFor(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleRemove} loading={!!removeFor && pendingAction === `remove-${removeFor.id}`}>
            Remove member
          </Button>
        </div>
      </Modal>
    </div>
  );
}
