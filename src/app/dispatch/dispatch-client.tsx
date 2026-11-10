"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  CircleDot,
  MapPin,
  Package,
  Plus,
  Search,
  Trash2,
  Truck,
  User,
} from "lucide-react";
import {
  createDispatch,
  updateDispatchStatus,
  assignDispatch,
  addProofOfDelivery,
  createVehicle,
  deleteDispatch,
} from "./actions";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs } from "@/components/ui/tabs";

type DispatchItem = {
  product_id: string;
  product_name: string;
  quantity: number;
};

export type Dispatch = {
  id: string;
  status: string;
  customer_name: string | null;
  customer_address: string | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
  assigned_to: string | null;
  driver_name: string | null;
  vehicle: string | null;
  notes: string | null;
  proof_of_delivery_url: string | null;
  created_at: string;
  items: DispatchItem[];
};

type Product = { id: string; name: string; sku: string; unit: string };
type Warehouse = { id: string; name: string };
type Staff = { id: string; full_name: string; role: string };
type Vehicle = { id: string; plate_number: string; description: string | null };

type Props = {
  dispatches: Dispatch[];
  products: Product[];
  warehouses: Warehouse[];
  staff: Staff[];
  vehicles: Vehicle[];
  stockMap: Record<string, number>;
  role: string;
  currentUserId: string;
};

const STATUS_TONES: Record<
  string,
  { tone: "neutral" | "info" | "warn" | "brand" | "danger"; label: string }
> = {
  created: { tone: "neutral", label: "Created" },
  assigned: { tone: "info", label: "Assigned" },
  in_transit: { tone: "warn", label: "In transit" },
  delivered: { tone: "brand", label: "Delivered" },
  failed: { tone: "danger", label: "Failed" },
  cancelled: { tone: "danger", label: "Cancelled" },
};

const STATUS_FLOW: Record<string, string[]> = {
  created: ["assigned", "cancelled"],
  assigned: ["in_transit", "cancelled"],
  in_transit: ["delivered", "failed"],
  delivered: [],
  failed: [],
  cancelled: [],
};

type StatusFilter = "all" | "open" | "delivered";

export default function DispatchClient({
  dispatches,
  products,
  warehouses,
  staff,
  vehicles,
  stockMap,
  role,
  currentUserId,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [showCreate, setShowCreate] = useState(false);
  const [showVehicle, setShowVehicle] = useState(false);
  const [podFor, setPodFor] = useState<Dispatch | null>(null);
  const [podUrl, setPodUrl] = useState("");
  const [assignFor, setAssignFor] = useState<Dispatch | null>(null);
  const [assignDriver, setAssignDriver] = useState("");
  const [assignVehicle, setAssignVehicle] = useState("");
  const [deleteFor, setDeleteFor] = useState<Dispatch | null>(null);

  const [draft, setDraft] = useState({
    customer_name: "",
    customer_address: "",
    warehouse_id: "",
    notes: "",
  });
  const [draftItems, setDraftItems] = useState<
    { product_id: string; quantity: number }[]
  >([{ product_id: "", quantity: 1 }]);
  const [vehicleForm, setVehicleForm] = useState({ plate_number: "", description: "" });

  const canCreate = can(role, "dispatch.create");
  const canAssign = can(role, "dispatch.assign");
  const canUpdateAny = can(role, "dispatch.status.all");
  const canUpdateOwn = can(role, "dispatch.status.own");
  const canPod = can(role, "dispatch.pod");
  const canDelete = can(role, "dispatch.delete");
  const canManageVehicles = can(role, "vehicle.manage");

  // Drivers are staff whose role can actually carry a delivery.
  const drivers = useMemo(
    () => staff.filter((s) => s.role === "driver" || s.role === "dispatcher"),
    [staff],
  );

  const visible = useMemo(() => {
    let rows = dispatches;
    // Drivers only see their own dispatches.
    if (!canUpdateAny && role === "driver") {
      rows = rows.filter((d) => d.assigned_to === currentUserId);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (d) =>
          (d.customer_name ?? "").toLowerCase().includes(q) ||
          (d.customer_address ?? "").toLowerCase().includes(q) ||
          d.id.toLowerCase().includes(q),
      );
    }
    if (statusFilter === "open") {
      rows = rows.filter((d) => !["delivered", "failed", "cancelled"].includes(d.status));
    } else if (statusFilter === "delivered") {
      rows = rows.filter((d) => d.status === "delivered");
    }
    return rows;
  }, [dispatches, query, statusFilter, canUpdateAny, role, currentUserId]);

  const counts = useMemo(() => {
    const base = role === "driver" && !canUpdateAny
      ? dispatches.filter((d) => d.assigned_to === currentUserId)
      : dispatches;
    return {
      all: base.length,
      open: base.filter((d) => !["delivered", "failed", "cancelled"].includes(d.status)).length,
      delivered: base.filter((d) => d.status === "delivered").length,
    };
  }, [dispatches, role, canUpdateAny, currentUserId]);

  function resetDraft() {
    setDraft({
      customer_name: "",
      customer_address: "",
      warehouse_id: "",
      notes: "",
    });
    setDraftItems([{ product_id: "", quantity: 1 }]);
  }

  function handleCreate() {
    setError(null);
    setSuccess(null);
    const items = draftItems.filter((i) => i.product_id && i.quantity > 0);
    startTransition(async () => {
      const result = await createDispatch({
        customer_name: draft.customer_name,
        customer_address: draft.customer_address,
        warehouse_id: draft.warehouse_id || null,
        notes: draft.notes,
        items,
      });
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess("Dispatch created. Stock has been deducted.");
        setShowCreate(false);
        resetDraft();
        router.refresh();
      }
    });
  }

  function handleStatus(dispatch: Dispatch, next: string) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await updateDispatchStatus(
        dispatch.id,
        next as "assigned" | "in_transit" | "delivered" | "failed" | "cancelled",
      );
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess(`Dispatch marked ${STATUS_TONES[next]?.label.toLowerCase() ?? next}.`);
        router.refresh();
      }
    });
  }

  function handleAssign() {
    if (!assignFor) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await assignDispatch(
        assignFor.id,
        assignDriver || null,
        assignVehicle || null,
      );
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess("Driver assigned.");
        setAssignFor(null);
        setAssignDriver("");
        setAssignVehicle("");
        router.refresh();
      }
    });
  }

  function handlePod() {
    if (!podFor) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await addProofOfDelivery(podFor.id, podUrl);
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess("Proof of delivery recorded. Dispatch marked delivered.");
        setPodFor(null);
        setPodUrl("");
        router.refresh();
      }
    });
  }

  function handleCreateVehicle() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await createVehicle(
        vehicleForm.plate_number,
        vehicleForm.description || undefined,
      );
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess("Vehicle added.");
        setShowVehicle(false);
        setVehicleForm({ plate_number: "", description: "" });
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (!deleteFor) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await deleteDispatch(deleteFor.id);
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess("Dispatch deleted.");
        setDeleteFor(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="min-w-0 space-y-6">
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

      {/* Actions */}
      {(canCreate || canManageVehicles) && (
        <div className="flex flex-wrap gap-2">
          {canCreate && (
            <Button
              onClick={() => {
                resetDraft();
                setShowCreate(true);
              }}
            >
              <Plus size={15} aria-hidden="true" />
              New dispatch
            </Button>
          )}
          {canManageVehicles && (
            <Button variant="ghost" onClick={() => setShowVehicle(true)}>
              <Truck size={15} aria-hidden="true" />
              Vehicle
            </Button>
          )}
        </div>
      )}

      {role === "driver" && (
        <div className="rounded-control border border-line bg-sunken px-4 py-3 text-sm text-ink-muted">
          You see only the dispatches assigned to you. Update status as you move,
          and record proof of delivery when you hand over.
        </div>
      )}

      <section className="rounded-card border border-line bg-surface ring-1 ring-black/[0.02]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-base font-medium tracking-[-0.01em] text-ink">
            Dispatches
          </h2>
          <span className="text-xs text-ink-muted">
            {visible.length} of {counts.all}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <div className="relative w-full sm:min-w-[200px] flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search customer, address, or ID"
              aria-label="Search dispatches"
              className="h-9 w-full rounded-control border border-line-strong bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint transition-colors hover:border-ink-faint focus:border-brand focus:outline-none"
            />
          </div>
        </div>

        <div className="border-b border-line px-5 py-3">
          <Tabs
            items={[
              { id: "all", label: "All", count: counts.all },
              { id: "open", label: "Open", count: counts.open },
              { id: "delivered", label: "Delivered", count: counts.delivered },
            ]}
            active={statusFilter}
            onChange={(id) => setStatusFilter(id as StatusFilter)}
            className="border-b-0"
          />
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={<Truck size={22} strokeWidth={1.75} />}
            title={dispatches.length === 0 ? "No dispatches yet" : "No matching dispatches"}
            description={
              dispatches.length === 0
                ? "Create your first dispatch to move stock to a customer."
                : "Try a different search term or filter."
            }
            action={
              canCreate && dispatches.length === 0 ? (
                <Button
                  onClick={() => {
                    resetDraft();
                    setShowCreate(true);
                  }}
                >
                  <Plus size={15} aria-hidden="true" />
                  New dispatch
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="divide-y divide-line">
            {visible.map((d) => {
              const meta = STATUS_TONES[d.status] ?? STATUS_TONES.created;
              const nextStatuses = STATUS_FLOW[d.status] ?? [];
              const isMine = d.assigned_to === currentUserId;
              const mayUpdate = canUpdateAny || (canUpdateOwn && isMine);
              const totalUnits = d.items.reduce((s, i) => s + i.quantity, 0);
              return (
                <article key={d.id} className="px-5 py-4 transition-colors hover:bg-sunken/50">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-medium text-ink">
                          {d.customer_name || "Unnamed customer"}
                        </h3>
                        <Badge tone={meta.tone} dot>
                          {meta.label}
                        </Badge>
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
                        <MapPin size={12} aria-hidden="true" />
                        {d.customer_address || "No address"}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-ink-faint">
                        #{d.id.slice(0, 8)} ·{" "}
                        {new Date(d.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-semibold tabular text-ink">
                        {totalUnits}
                      </p>
                      <p className="text-[10px] uppercase tracking-[0.08em] text-ink-faint">
                        units
                      </p>
                    </div>
                  </div>

                  {/* Line items */}
                  {d.items.length > 0 && (
                    <ul className="mt-3 space-y-1 rounded-control border border-line bg-sunken/60 px-3 py-2">
                      {d.items.map((item, idx) => (
                        <li
                          key={`${item.product_id}-${idx}`}
                          className="flex items-center justify-between gap-3 text-xs"
                        >
                          <span className="flex items-center gap-1.5 text-ink-muted">
                            <Package size={11} aria-hidden="true" />
                            {item.product_name}
                          </span>
                          <span className="font-mono tabular text-ink">
                            ×{item.quantity}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Assignment */}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                    <span className="flex items-center gap-1.5">
                      <User size={12} aria-hidden="true" />
                      {d.driver_name || "No driver"}
                    </span>
                    {d.warehouse_name && (
                      <span className="flex items-center gap-1.5">
                        <CircleDot size={12} aria-hidden="true" />
                        {d.warehouse_name}
                      </span>
                    )}
                    {d.vehicle && (
                      <span className="flex items-center gap-1.5">
                        <Truck size={12} aria-hidden="true" />
                        {d.vehicle}
                      </span>
                    )}
                  </div>

                  {d.proof_of_delivery_url && (
                    <a
                      href={d.proof_of_delivery_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand transition-colors hover:text-brand-hover"
                    >
                      <CheckCircle2 size={12} aria-hidden="true" />
                      View proof of delivery
                    </a>
                  )}

                  {/* Row actions */}
                  {(mayUpdate || canAssign || canPod || canDelete) && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                      {mayUpdate &&
                        nextStatuses.map((next) => (
                          <Button
                            key={next}
                            size="sm"
                            variant={next === "delivered" ? "primary" : "outline"}
                            onClick={() => handleStatus(d, next)}
                            loading={isPending}
                          >
                            Mark {STATUS_TONES[next]?.label.toLowerCase() ?? next}
                          </Button>
                        ))}
                      {canAssign && d.status === "created" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setAssignFor(d);
                            setAssignDriver("");
                            setAssignVehicle("");
                          }}
                        >
                          <User size={13} aria-hidden="true" />
                          Assign driver
                        </Button>
                      )}
                      {canPod && ["assigned", "in_transit"].includes(d.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPodFor(d);
                            setPodUrl("");
                          }}
                        >
                          <CheckCircle2 size={13} aria-hidden="true" />
                          Proof of delivery
                        </Button>
                      )}
                      {canDelete && d.status === "created" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteFor(d)}
                        >
                          <Trash2 size={13} aria-hidden="true" />
                          Delete
                        </Button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Vehicles */}
      {vehicles.length > 0 && (
        <section className="rounded-card border border-line bg-surface ring-1 ring-black/[0.02]">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-base font-medium tracking-[-0.01em] text-ink">
              Vehicles
            </h2>
          </div>
          <div className="divide-y divide-line">
            {vehicles.map((v) => (
              <div key={v.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="font-mono text-sm font-medium text-ink">
                    {v.plate_number}
                  </p>
                  {v.description && (
                    <p className="mt-0.5 text-xs text-ink-muted">{v.description}</p>
                  )}
                </div>
                <Truck size={15} className="text-ink-faint" aria-hidden="true" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- Modals ---- */}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New dispatch">
        <div className="space-y-4">
          <Input
            label="Customer name"
            type="text"
            value={draft.customer_name}
            onChange={(e) => setDraft({ ...draft, customer_name: e.target.value })}
            placeholder="e.g. Grace Adeyemi"
          />
          <Input
            label="Delivery address"
            type="text"
            value={draft.customer_address}
            onChange={(e) => setDraft({ ...draft, customer_address: e.target.value })}
            placeholder="e.g. 14 Allen Avenue, Ikeja, Lagos"
          />
          {warehouses.length > 0 && (
            <Select
              label="Origin warehouse"
              value={draft.warehouse_id}
              onChange={(e) => setDraft({ ...draft, warehouse_id: e.target.value })}
            >
              <option value="">Not specified</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-ink">Line items</span>
              <button
                type="button"
                onClick={() =>
                  setDraftItems([...draftItems, { product_id: "", quantity: 1 }])
                }
                className="inline-flex items-center gap-1 text-xs font-medium text-brand transition-colors hover:text-brand-hover"
              >
                <Plus size={12} aria-hidden="true" />
                Add line
              </button>
            </div>
            <div className="space-y-2">
              {draftItems.map((item, idx) => (
                <div key={idx} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Select
                      label={idx === 0 ? "Product" : undefined}
                      value={item.product_id}
                      onChange={(e) => {
                        const next = [...draftItems];
                        next[idx] = { ...next[idx], product_id: e.target.value };
                        setDraftItems(next);
                      }}
                    >
                      <option value="">Select a product…</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {stockMap[p.id] ?? 0} available
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="w-24">
                    <Input
                      label={idx === 0 ? "Qty" : undefined}
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => {
                        const next = [...draftItems];
                        next[idx] = {
                          ...next[idx],
                          quantity: parseInt(e.target.value) || 1,
                        };
                        setDraftItems(next);
                      }}
                    />
                  </div>
                  {draftItems.length > 1 && (
                    <button
                      type="button"
                      aria-label="Remove line"
                      onClick={() =>
                        setDraftItems(draftItems.filter((_, i) => i !== idx))
                      }
                      className="mb-1 p-2 text-ink-faint transition-colors hover:text-danger"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <Input
            label="Notes (optional)"
            type="text"
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            placeholder="e.g. Call on arrival"
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              loading={isPending}
              disabled={!draftItems.some((i) => i.product_id)}
            >
              Create dispatch
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={assignFor !== null}
        onClose={() => setAssignFor(null)}
        title="Assign driver"
      >
        <div className="space-y-4">
          <Select
            label="Driver"
            value={assignDriver}
            onChange={(e) => setAssignDriver(e.target.value)}
          >
            <option value="">Select a driver…</option>
            {drivers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name || "Unnamed"}
              </option>
            ))}
          </Select>
          {vehicles.length > 0 && (
            <Select
              label="Vehicle (optional)"
              value={assignVehicle}
              onChange={(e) => setAssignVehicle(e.target.value)}
            >
              <option value="">Not specified</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate_number}
                  {v.description ? ` — ${v.description}` : ""}
                </option>
              ))}
            </Select>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAssignFor(null)}>
              Cancel
            </Button>
            <Button onClick={handleAssign} loading={isPending}>
              Assign
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={podFor !== null}
        onClose={() => setPodFor(null)}
        title="Proof of delivery"
      >
        <div className="space-y-4">
          <Input
            label="Proof URL"
            type="url"
            value={podUrl}
            onChange={(e) => setPodUrl(e.target.value)}
            placeholder="https://your-storage.com/delivery-photo.jpg"
          />
          <p className="text-xs text-ink-muted">
            Paste a link to the delivery photo or signature — a Supabase Storage
            URL, Google Drive share link, or any publicly reachable image. Saving
            this marks the dispatch as delivered.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setPodFor(null)}>
              Cancel
            </Button>
            <Button
              onClick={handlePod}
              loading={isPending}
              disabled={!podUrl.trim()}
            >
              <CheckCircle2 size={15} aria-hidden="true" />
              Save proof & mark delivered
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showVehicle}
        onClose={() => setShowVehicle(false)}
        title="Add vehicle"
      >
        <div className="space-y-4">
          <Input
            label="Plate number"
            type="text"
            value={vehicleForm.plate_number}
            onChange={(e) =>
              setVehicleForm({ ...vehicleForm, plate_number: e.target.value })
            }
            placeholder="e.g. ABC-123-LA"
          />
          <Input
            label="Description (optional)"
            type="text"
            value={vehicleForm.description}
            onChange={(e) =>
              setVehicleForm({ ...vehicleForm, description: e.target.value })
            }
            placeholder="e.g. Toyota Hiace, 2.5 tonnes"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowVehicle(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateVehicle}
              loading={isPending}
              disabled={!vehicleForm.plate_number.trim()}
            >
              Add vehicle
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteFor !== null}
        onClose={() => setDeleteFor(null)}
        title="Delete dispatch"
      >
        <p className="text-sm text-ink-muted">
          Delete this dispatch? Stock deducted for it will not be returned
          automatically. Only dispatches that have not been assigned can be
          deleted.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteFor(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} loading={isPending}>
            Delete dispatch
          </Button>
        </div>
      </Modal>
    </div>
  );
}
