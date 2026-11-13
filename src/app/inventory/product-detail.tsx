"use client";

import { useState } from "react";
import {
  Check,
  MapPin,
  Package,
  Pencil,
  Warehouse as WarehouseIcon,
  X,
} from "lucide-react";
import { updateProductLocation } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import type { EnrichedProduct, Movement } from "./types";

/**
 * Product detail.
 *
 * This is where a "scan to find" lands, so the storage location is the loudest
 * thing on the panel — the whole point of scanning a label is to answer "where
 * is it?" without walking the aisles.
 */
export function ProductDetail({
  product,
  movements,
  warehouseName,
  canManage,
  onClose,
  onLocationSaved,
}: {
  product: EnrichedProduct;
  movements: Movement[];
  warehouseName: (id: string | null) => string;
  canManage: boolean;
  onClose: () => void;
  onLocationSaved: (productId: string, location: string | null) => void;
}) {
  const [editingLocation, setEditingLocation] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recent = movements.slice(0, 5);

  function startEditing() {
    setDraft(product.location ?? "");
    setError(null);
    setEditingLocation(true);
  }

  /**
   * `next` lets a caller save a value that is not in state yet. The Clear button
   * needs this: `setDraft("")` does not flush before the next line runs, so
   * reading `draft` there would save the old location back.
   */
  async function saveLocation(next?: string) {
    setSaving(true);
    setError(null);

    const cleaned = (next ?? draft).trim() || null;
    const result = await updateProductLocation(product.id, cleaned);
    setSaving(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    onLocationSaved(product.id, cleaned);
    setEditingLocation(false);
  }

  return (
    <Modal open onClose={onClose} title="Product details">
      <div className="space-y-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-medium text-ink">{product.name}</h3>
            <Badge tone={product.stockInfo.tone} dot>
              {product.stockInfo.label}
            </Badge>
          </div>
          <p className="mt-1 font-mono text-xs text-ink-muted">{product.sku}</p>
          {product.description && (
            <p className="mt-2 text-sm text-ink-muted">{product.description}</p>
          )}
        </div>

        {/* Storage location — the reason someone scans a label. */}
        <div className="rounded-card border border-brand/25 bg-brand-soft/50 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-brand-ink">
                <MapPin size={12} aria-hidden="true" />
                Storage location
              </p>
              {!editingLocation ? (
                <p className="mt-1 text-sm text-ink">
                  {product.location || (
                    <span className="text-ink-faint">Not set yet</span>
                  )}
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  <Input
                    type="text"
                    value={draft}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveLocation();
                      if (e.key === "Escape") setEditingLocation(false);
                    }}
                    placeholder="e.g. Aisle B, Rack 3, Shelf 2"
                    aria-label="Storage location"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void saveLocation()} loading={saving}>
                      <Check size={13} aria-hidden="true" />
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingLocation(false)}
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                    {product.location && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDraft("");
                          void saveLocation("");
                        }}
                        disabled={saving}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  {error && <p className="text-xs text-danger">{error}</p>}
                </div>
              )}
            </div>
            {!editingLocation && canManage && (
              <button
                type="button"
                onClick={startEditing}
                className="flex shrink-0 items-center gap-1 text-xs font-medium text-brand transition-colors hover:text-brand-hover"
              >
                <Pencil size={12} aria-hidden="true" />
                {product.location ? "Edit" : "Set"}
              </button>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-control border border-line bg-sunken/60 px-4 py-3 text-sm">
          <dt className="text-ink-muted">On hand</dt>
          <dd className="text-right font-mono tabular text-ink">
            {product.onHand} {product.unit}
          </dd>

          <dt className="text-ink-muted">Reorder level</dt>
          <dd className="text-right font-mono tabular text-ink">{product.reorder_level}</dd>

          <dt className="flex items-center gap-1.5 text-ink-muted">
            <WarehouseIcon size={12} aria-hidden="true" />
            Warehouse
          </dt>
          <dd className="text-right text-ink">{warehouseName(product.warehouse_id)}</dd>
        </dl>

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-muted">
            <Package size={12} aria-hidden="true" />
            Recent movements
          </p>
          {recent.length === 0 ? (
            <p className="text-xs text-ink-faint">No movements recorded yet.</p>
          ) : (
            <ul className="divide-y divide-line rounded-control border border-line">
              {recent.map((m) => {
                const isOut = m.movement_type === "out";
                const isAdjustment = m.movement_type === "adjustment";
                return (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                  >
                    <span className="min-w-0 truncate text-ink-muted">
                      {new Date(m.created_at).toLocaleDateString()} ·{" "}
                      <span className="text-ink">{m.movement_type}</span>
                      {m.reason ? ` · ${m.reason}` : ""}
                    </span>
                    <span
                      className={`shrink-0 font-mono tabular ${
                        isAdjustment ? "text-warn" : isOut ? "text-danger" : "text-brand"
                      }`}
                    >
                      {isOut ? "−" : isAdjustment ? "" : "+"}
                      {Math.abs(m.quantity)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <Button variant="outline" onClick={onClose}>
            <X size={14} aria-hidden="true" />
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
