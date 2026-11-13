"use client";

import { useMemo, useState, useTransition, useCallback, useEffect } from "react";
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
  createVehicle,
  deleteDispatch,
} from "./actions";
import { can } from "@/lib/permissions";
import { transitionsFor } from "@/lib/dispatch-flow";
import { PodCapture } from "@/components/pod-capture";
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

export type PodPhoto = {
  id: string;
  /** Short-lived signed URL, generated server-side. Null if signing failed. */
  url: string | null;
  captured_at: string;
  lat: number | null;
  lng: number | null;
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
  /** Set when the office signed off on the driver's proof. */
  confirmed_at: string | null;
  confirmed_by: string | null;
  confirmed_by_name: string | null;
  items: DispatchItem[];
  pods: PodPhoto[];
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
  /** Null means delivery photos are kept permanently. */
  podRetentionDays: number | null;
};

const STATUS_TONES: Record<
  string,
  { tone: "neutral" | "info" | "warn" | "brand" | "danger"; label: string }
> = {
  created: { tone: "neutral", label: "Created" },
  assigned: { tone: "info", label: "Assigned" },
  in_transit: { tone: "warn", label: "In transit" },
  delivered_pending: { tone: "warn", label: "Awaiting confirmation" },
  delivered: { tone: "brand", label: "Delivered" },
  failed: { tone: "danger", label: "Failed" },
  cancelled: { tone: "danger", label: "Cancelled" },
};

const STATUS_SUCCESS: Record<string, string> = {
  assigned: "Driver assigned.",
  in_transit: "Marked picked up. It stays on your list until delivery is confirmed.",
  delivered_pending:
    "Proof sent. The delivery now waits for the office to confirm it.",
  delivered: "Delivery confirmed and closed.",
  failed: "Marked failed.",
  cancelled: "Dispatch cancelled.",
};

type StatusFilter = "all" | "open" | "to_confirm" | "delivered";

/** Still moving — not yet waiting on anyone. */
const OPEN_STATUSES = ["created", "assigned", "in_transit"];

/** States in which more evidence can still be attached. Mirrors pod-actions.ts. */
const POD_STATUSES = {
  office: ["assigned", "in_transit", "delivered_pending", "delivered"],
  driver: ["in_transit", "delivered_pending"],
};

export default function DispatchClient({
  dispatches: initialDispatches,
  products,
  warehouses,
  staff,
  vehicles: initialVehicles,
  stockMap: initialStockMap,
  role,
  currentUserId,
  podRetentionDays,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Local state for optimistic updates
  const [dispatches, setDispatches] = useState(initialDispatches);
  const [vehicles, setVehicles] = useState(initialVehicles);
  const [stockMap, setStockMap] = useState(initialStockMap);

  // Re-sync from the server after a refresh. Without this, a driver who has
  // just been assigned a run keeps seeing the list they loaded the page with.
  useEffect(() => {
    setDispatches(initialDispatches);
  }, [initialDispatches]);

  // Per-action loading
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [showCreate, setShowCreate] = useState(false);
  const [showVehicle, setShowVehicle] = useState(false);
  const [podFor, setPodFor] = useState<Dispatch | null>(null);
  const [confirmFor, setConfirmFor] = useState<Dispatch | null>(null);
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
  const canConfirm = can(role, "dispatch.confirm");
  const canPod = can(role, "dispatch.pod");
  const canDelete = can(role, "dispatch.delete");
  const canManageVehicles = can(role, "vehicle.manage");

  const drivers = useMemo(
    () => staff.filter((s) => s.role === "driver" || s.role === "dispatcher"),
    [staff],
  );

  const visible = useMemo(() => {
    let rows = dispatches;
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
      rows = rows.filter((d) => OPEN_STATUSES.includes(d.status));
    } else if (statusFilter === "to_confirm") {
      rows = rows.filter((d) => d.status === "delivered_pending");
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
      open: base.filter((d) => OPEN_STATUSES.includes(d.status)).length,
      to_confirm: base.filter((d) => d.status === "delivered_pending").length,
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

  // ---- Optimistic handlers ----

  const handleCreate = useCallback(() => {
    setError(null);
    setSuccess(null);
    const items = draftItems.filter((i) => i.product_id && i.quantity > 0);

    // Snapshot for optimistic update
    const snapshot = {
      customer_name: draft.customer_name,
      customer_address: draft.customer_address,
      warehouse_id: draft.warehouse_id,
      notes: draft.notes,
      items,
    };

    // Close modal + reset INSTANTLY
    setShowCreate(false);
    resetDraft();
    setPendingAction("create-dispatch");

    // Optimistic local update — add temp dispatch + deduct stock
    const tempId = `temp-${Date.now()}`;
    const tempDispatch: Dispatch = {
      id: tempId,
      status: "created",
      customer_name: snapshot.customer_name || null,
      customer_address: snapshot.customer_address || null,
      warehouse_id: snapshot.warehouse_id || null,
      warehouse_name: warehouses.find((w) => w.id === snapshot.warehouse_id)?.name ?? null,
      assigned_to: null,
      driver_name: null,
      vehicle: null,
      notes: snapshot.notes || null,
      proof_of_delivery_url: null,
      created_at: new Date().toISOString(),
      confirmed_at: null,
      confirmed_by: null,
      confirmed_by_name: null,
      items: items.map((i) => ({
        product_id: i.product_id,
        product_name: products.find((p) => p.id === i.product_id)?.name ?? "Unknown",
        quantity: i.quantity,
      })),
      pods: [],
    };
    setDispatches((prev) => [tempDispatch, ...prev]);

    // Optimistic stock deduction
    const stockDeltas: Record<string, number> = {};
    for (const item of items) {
      stockDeltas[item.product_id] = (stockDeltas[item.product_id] ?? 0) - item.quantity;
    }
    setStockMap((prev) => {
      const next = { ...prev };
      for (const [pid, delta] of Object.entries(stockDeltas)) {
        next[pid] = (next[pid] ?? 0) + delta;
      }
      return next;
    });

    startTransition(async () => {
      const result = await createDispatch({
        customer_name: snapshot.customer_name,
        customer_address: snapshot.customer_address,
        warehouse_id: snapshot.warehouse_id || null,
        notes: snapshot.notes,
        items,
      });
      setPendingAction(null);
      if (result?.error) {
        setError(result.error);
        // Rollback
        setDispatches((prev) => prev.filter((d) => d.id !== tempId));
        setStockMap((prev) => {
          const next = { ...prev };
          for (const [pid, delta] of Object.entries(stockDeltas)) {
            next[pid] = (next[pid] ?? 0) - delta; // reverse the deduction
          }
          return next;
        });
      } else {
        setSuccess("Dispatch created. Stock has been deducted.");
        router.refresh();
      }
    });
  }, [draft, draftItems, products, warehouses, router]);

  const handleStatus = useCallback((dispatch: Dispatch, next: string) => {
    setError(null);
    setSuccess(null);
    const dispatchId = dispatch.id;
    const prevStatus = dispatch.status;

    // Optimistic local update — change status instantly
    setDispatches((prev) =>
      prev.map((d) => (d.id === dispatchId ? { ...d, status: next } : d)),
    );
    setPendingAction(`status-${dispatchId}`);

    startTransition(async () => {
      const result = await updateDispatchStatus(
        dispatchId,
        next as
          | "assigned"
          | "in_transit"
          | "delivered_pending"
          | "delivered"
          | "failed"
          | "cancelled",
      );
      setPendingAction(null);
      if (result?.error) {
        setError(result.error);
        // Rollback
        setDispatches((prev) =>
          prev.map((d) => (d.id === dispatchId ? { ...d, status: prevStatus } : d)),
        );
      } else {
        setSuccess(STATUS_SUCCESS[next] ?? `Dispatch marked ${next}.`);
        router.refresh();
      }
    });
  }, [router]);

  const handleAssign = useCallback(() => {
    if (!assignFor) return;
    setError(null);
    setSuccess(null);

    const dispatchId = assignFor.id;
    const driverId = assignDriver || null;
    const vehiclePlate = assignVehicle || null;

    // Close modal + reset INSTANTLY
    setAssignFor(null);
    setAssignDriver("");
    setAssignVehicle("");
    setPendingAction(`assign-${dispatchId}`);

    // Optimistic local update
    const driverName = staff.find((s) => s.id === driverId)?.full_name ?? null;
    const vehicleObj = vehicles.find((v) => v.id === vehiclePlate);
    setDispatches((prev) =>
      prev.map((d) =>
        d.id === dispatchId
          ? {
              ...d,
              assigned_to: driverId,
              driver_name: driverName,
              vehicle: vehicleObj?.plate_number ?? d.vehicle,
              status: "assigned",
            }
          : d,
      ),
    );

    startTransition(async () => {
      const result = await assignDispatch(
        dispatchId,
        driverId,
        vehicleObj?.plate_number ?? null,
      );
      setPendingAction(null);
      if (result?.error) {
        setError(result.error);
        router.refresh(); // Rollback via server re-read
      } else {
        setSuccess("Driver assigned.");
        router.refresh();
      }
    });
  }, [assignFor, assignDriver, assignVehicle, staff, vehicles, router]);

  const handlePodSaved = useCallback(() => {
    setError(null);
    const dispatchId = podFor?.id;

    // A photo taken mid-run moves the dispatch to "awaiting confirmation" — it
    // never closes the delivery. That is the office's call, made against this
    // photo. In any other state the photo is just an attachment.
    if (dispatchId) {
      setDispatches((prev) =>
        prev.map((d) =>
          d.id === dispatchId && d.status === "in_transit"
            ? { ...d, status: "delivered_pending" }
            : d,
        ),
      );
    }

    setSuccess(
      canUpdateAny
        ? "Proof saved. Confirm the delivery once you have reviewed the photo."
        : "Proof sent. The office will confirm your delivery.",
    );
    router.refresh();
  }, [podFor, router, canUpdateAny]);

  const handleCreateVehicle = useCallback(() => {
    setError(null);
    setSuccess(null);

    // Close modal + reset INSTANTLY
    setShowVehicle(false);
    const formData = { ...vehicleForm };
    setVehicleForm({ plate_number: "", description: "" });
    setPendingAction("create-vehicle");

    // Optimistic local update
    const tempId = `temp-${Date.now()}`;
    const newVehicle: Vehicle = {
      id: tempId,
      plate_number: formData.plate_number.trim(),
      description: formData.description?.trim() || null,
    };
    setVehicles((prev) => [...prev, newVehicle]);

    startTransition(async () => {
      const result = await createVehicle(
        formData.plate_number,
        formData.description || undefined,
      );
      setPendingAction(null);
      if (result?.error) {
        setError(result.error);
        setVehicles((prev) => prev.filter((v) => v.id !== tempId));
      } else {
        setSuccess("Vehicle added.");
        router.refresh();
      }
    });
  }, [vehicleForm, router]);

  const handleDelete = useCallback(() => {
    if (!deleteFor) return;
    setError(null);
    setSuccess(null);

    const dispatchId = deleteFor.id;
    const removed = deleteFor;

    // Close modal INSTANTLY
    setDeleteFor(null);
    setPendingAction(`delete-${dispatchId}`);

    // Optimistic local update — remove dispatch + restore stock
    setDispatches((prev) => prev.filter((d) => d.id !== dispatchId));

    // Restore stock for deleted dispatch items
    if (removed.items.length > 0) {
      setStockMap((prev) => {
        const next = { ...prev };
        for (const item of removed.items) {
          next[item.product_id] = (next[item.product_id] ?? 0) + item.quantity;
        }
        return next;
      });
    }

    startTransition(async () => {
      const result = await deleteDispatch(dispatchId);
      setPendingAction(null);
      if (result?.error) {
        setError(result.error);
        // Rollback — re-add dispatch + re-deduct stock
        setDispatches((prev) => [removed, ...prev]);
        if (removed.items.length > 0) {
          setStockMap((prev) => {
            const next = { ...prev };
            for (const item of removed.items) {
              next[item.product_id] = (next[item.product_id] ?? 0) - item.quantity;
            }
            return next;
          });
        }
      } else {
        setSuccess("Dispatch deleted.");
        router.refresh();
      }
    });
  }, [deleteFor, router]);

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
          You only see the runs assigned to you. Mark a run{" "}
          <span className="font-medium text-ink">picked up</span> when you collect
          it, then{" "}
          <span className="font-medium text-ink">send a delivery photo</span> at
          the door. The office confirms it from there.
        </div>
      )}

      {canConfirm && counts.to_confirm > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-ink">
          <span>
            <span className="font-medium">
              {counts.to_confirm} {counts.to_confirm === 1 ? "delivery is" : "deliveries are"}
            </span>{" "}
            waiting for your confirmation. Review the driver&rsquo;s photo before
            you close {counts.to_confirm === 1 ? "it" : "them"}.
          </span>
          <Button size="sm" variant="outline" onClick={() => setStatusFilter("to_confirm")}>
            Review now
          </Button>
        </div>
      )}

      <section className="rounded-card border border-line bg-surface ring-1 ring-black/[0.02]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-base font-medium tracking-[-0.01em] text-ink">
            {role === "driver" ? "My deliveries" : "Dispatches"}
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
              ...(canConfirm
                ? [{ id: "to_confirm", label: "To confirm", count: counts.to_confirm }]
                : []),
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
              const isMine = d.assigned_to === currentUserId;
              const isPending = d.status === "delivered_pending";
              const mayUpdate = canUpdateAny || (canUpdateOwn && isMine);
              const transitions = transitionsFor({
                status: d.status,
                isMine,
                canUpdateAny,
                canUpdateOwn,
                canConfirm,
              });
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

                  {d.pods.length > 0 && (
                    <div
                      className={`mt-3 flex flex-wrap items-center gap-3 rounded-control border p-2 ${
                        isPending
                          ? "border-warn/40 bg-warn-soft/40"
                          : "border-line bg-sunken/40"
                      }`}
                    >
                      {d.pods.slice(0, 3).map((pod) =>
                        pod.url ? (
                          <a
                            key={pod.id}
                            href={pod.url}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0"
                            aria-label="Open delivery photo"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={pod.url}
                              alt="Delivery photo"
                              className="size-14 rounded-[6px] border border-line object-cover"
                            />
                          </a>
                        ) : (
                          <span
                            key={pod.id}
                            className="flex size-14 shrink-0 items-center justify-center rounded-[6px] border border-line bg-surface text-[10px] text-ink-faint"
                          >
                            No preview
                          </span>
                        ),
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-xs font-medium text-ink">
                          <CheckCircle2 size={12} aria-hidden="true" />
                          {isPending ? "Awaiting confirmation" : "Proof of delivery"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-ink-faint">
                          {new Date(d.pods[0].captured_at).toLocaleString()}
                          {d.pods[0].lat !== null && d.pods[0].lng !== null
                            ? ` · ${d.pods[0].lat.toFixed(4)}, ${d.pods[0].lng.toFixed(4)}`
                            : ""}
                        </p>
                        {d.status === "delivered" && d.confirmed_at && (
                          <p className="mt-0.5 text-[11px] text-ink-faint">
                            Confirmed
                            {d.confirmed_by_name ? ` by ${d.confirmed_by_name}` : ""} ·{" "}
                            {new Date(d.confirmed_at).toLocaleString()}
                          </p>
                        )}
                      </div>
                      {isPending && canConfirm && (
                        <Button
                          size="sm"
                          onClick={() => setConfirmFor(d)}
                          loading={pendingAction === `status-${d.id}`}
                        >
                          Review &amp; confirm
                        </Button>
                      )}
                    </div>
                  )}

                  {d.pods.length === 0 && d.proof_of_delivery_url && (
                    <a
                      href={d.proof_of_delivery_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand transition-colors hover:text-brand-hover"
                    >
                      <CheckCircle2 size={12} aria-hidden="true" />
                      View legacy proof link
                    </a>
                  )}

                  {/* Row actions */}
                  {(mayUpdate || canAssign || canPod || canDelete) && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                      {transitions.map((t) => (
                        <Button
                          key={t.to}
                          size="sm"
                          variant={
                            t.danger ? "danger" : t.to === "delivered" ? "primary" : "outline"
                          }
                          onClick={() => {
                            // Delivering is a photo, not a tap — open the camera.
                            if (t.requiresPod) {
                              setPodFor(d);
                              return;
                            }
                            // Confirming is a review, not a tap — show the
                            // evidence and let the office sign off from there.
                            if (t.requiresExistingPod) {
                              setConfirmFor(d);
                              return;
                            }
                            handleStatus(d, t.to);
                          }}
                          loading={
                            !t.requiresPod &&
                            !t.requiresExistingPod &&
                            pendingAction === `status-${d.id}`
                          }
                        >
                          {(t.requiresPod || t.requiresExistingPod) && (
                            <CheckCircle2 size={13} aria-hidden="true" />
                          )}
                          {t.label}
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
                      {canPod &&
                        (canUpdateAny ? POD_STATUSES.office : POD_STATUSES.driver).includes(
                          d.status,
                        ) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPodFor(d)}
                        >
                          <CheckCircle2 size={13} aria-hidden="true" />
                          {["delivered", "delivered_pending"].includes(d.status)
                            ? "Add photo"
                            : "Proof of delivery"}
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
              loading={pendingAction === "create-dispatch"}
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
            <Button onClick={handleAssign} loading={pendingAction?.startsWith("assign-") ?? false}>
              Assign
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirming a delivery is a review of the driver's evidence, so the
          photo is the dialog — not a thumbnail next to a button. */}
      <Modal
        open={confirmFor !== null}
        onClose={() => setConfirmFor(null)}
        title="Confirm delivery"
      >
        {confirmFor && (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">
              Check the driver&rsquo;s photo before closing this delivery. Once
              confirmed, the run is finished and cannot be reopened.
            </p>

            {confirmFor.pods.length === 0 ? (
              <div className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
                There is no proof of delivery for this run, so it cannot be
                confirmed. Ask the driver to send a photo first.
              </div>
            ) : (
              <div className="max-h-[26rem] space-y-3 overflow-y-auto pr-1">
                {confirmFor.pods.map((pod) => (
                  <figure
                    key={pod.id}
                    className="overflow-hidden rounded-card border border-line bg-sunken"
                  >
                    {pod.url ? (
                      <a href={pod.url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={pod.url}
                          alt="Proof of delivery"
                          className="max-h-[20rem] w-full bg-sunken object-contain"
                        />
                      </a>
                    ) : (
                      <div className="flex h-40 items-center justify-center px-4 text-center text-xs text-ink-faint">
                        This photo could not be loaded. Refresh the page to try
                        again.
                      </div>
                    )}
                    <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-3 py-2 text-[11px] text-ink-muted">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 size={11} aria-hidden="true" />
                        {new Date(pod.captured_at).toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MapPin size={11} aria-hidden="true" />
                        {pod.lat !== null && pod.lng !== null
                          ? `${pod.lat.toFixed(5)}, ${pod.lng.toFixed(5)}`
                          : "No location"}
                      </span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-control border border-line bg-sunken/60 px-3 py-2 text-xs">
              <dt className="text-ink-faint">Customer</dt>
              <dd className="text-right text-ink">
                {confirmFor.customer_name || "Unnamed customer"}
              </dd>
              <dt className="text-ink-faint">Driver</dt>
              <dd className="text-right text-ink">
                {confirmFor.driver_name || "Unassigned"}
              </dd>
              <dt className="text-ink-faint">Items</dt>
              <dd className="text-right text-ink">
                {confirmFor.items.reduce((s, i) => s + i.quantity, 0)} units ·{" "}
                {confirmFor.items.length}{" "}
                {confirmFor.items.length === 1 ? "line" : "lines"}
              </dd>
            </dl>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setConfirmFor(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const target = confirmFor;
                  setConfirmFor(null);
                  handleStatus(target, "delivered");
                }}
                disabled={confirmFor.pods.length === 0}
              >
                <CheckCircle2 size={15} aria-hidden="true" />
                Confirm delivered
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <PodCapture
        open={podFor !== null}
        dispatchId={podFor?.id ?? null}
        retentionDays={podRetentionDays}
        onClose={() => setPodFor(null)}
        onSaved={handlePodSaved}
      />

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
              loading={pendingAction === "create-vehicle"}
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
          <Button variant="danger" onClick={handleDelete} loading={pendingAction?.startsWith("delete-") ?? false}>
            Delete dispatch
          </Button>
        </div>
      </Modal>
    </div>
  );
}
