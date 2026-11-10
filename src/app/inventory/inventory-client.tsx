"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Boxes,
  Camera,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  recordStockMovement,
  createWarehouse,
} from "./actions";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs } from "@/components/ui/tabs";
import { BarcodeScanner } from "@/components/barcode-scanner";

type Product = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  reorder_level: number;
  warehouse_id: string | null;
  created_at: string;
};

type Warehouse = {
  id: string;
  name: string;
  location: string | null;
};

type Movement = {
  id: string;
  product_id: string;
  product_name: string;
  movement_type: string;
  quantity: number;
  reason: string | null;
  reference: string | null;
  created_at: string;
};

type Props = {
  products: Product[];
  stockMap: Record<string, number>;
  warehouses: Warehouse[];
  movements: Movement[];
  role: string;
};

type StatusFilter = "all" | "low" | "ok";

const MOVEMENT_TONES: Record<string, { tone: "brand" | "danger" | "warn" | "info"; label: string }> = {
  in: { tone: "brand", label: "In" },
  out: { tone: "danger", label: "Out" },
  adjustment: { tone: "warn", label: "Adjustment" },
  transfer: { tone: "info", label: "Transfer" },
};

export default function InventoryClient({
  products,
  stockMap,
  warehouses,
  movements,
  role,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showRecordMovement, setShowRecordMovement] = useState(false);
  const [showAddWarehouse, setShowAddWarehouse] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [productForm, setProductForm] = useState({
    sku: "",
    name: "",
    description: "",
    unit: "unit",
    reorder_level: 0,
    warehouse_id: "",
  });

  const [movementForm, setMovementForm] = useState({
    product_id: "",
    movement_type: "in" as "in" | "out" | "adjustment" | "transfer",
    quantity: 1,
    reason: "",
    reference: "",
    warehouse_id: "",
  });

  const [warehouseForm, setWarehouseForm] = useState({ name: "", location: "" });

  const canManageInventory = can(role, "inventory.manage");
  const canManageWarehouses = can(role, "warehouse.manage");

  // ---- Derived data ----
  const enriched = useMemo(
    () =>
      products.map((p) => {
        const onHand = stockMap[p.id] ?? 0;
        const isLow = p.reorder_level > 0 && onHand < p.reorder_level;
        return { ...p, onHand, isLow };
      }),
    [products, stockMap],
  );

  const lowStockCount = enriched.filter((p) => p.isLow).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q))
        return false;
      if (warehouseFilter && p.warehouse_id !== warehouseFilter) return false;
      if (statusFilter === "low" && !p.isLow) return false;
      if (statusFilter === "ok" && p.isLow) return false;
      return true;
    });
  }, [enriched, query, warehouseFilter, statusFilter]);

  const totalUnits = enriched.reduce((sum, p) => sum + p.onHand, 0);

  function resetProductForm() {
    setProductForm({
      sku: "",
      name: "",
      description: "",
      unit: "unit",
      reorder_level: 0,
      warehouse_id: "",
    });
  }

  function openEdit(product: Product) {
    setEditingProduct(product);
    setProductForm({
      sku: product.sku,
      name: product.name,
      description: product.description || "",
      unit: product.unit,
      reorder_level: product.reorder_level,
      warehouse_id: product.warehouse_id || "",
    });
  }

  function handleCreateProduct() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await createProduct(productForm);
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess("Product created.");
        setShowAddProduct(false);
        resetProductForm();
        router.refresh();
      }
    });
  }

  function handleUpdateProduct() {
    if (!editingProduct) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await updateProduct(editingProduct.id, productForm);
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess("Product updated.");
        setEditingProduct(null);
        resetProductForm();
        router.refresh();
      }
    });
  }

  function handleDeleteProduct(id: string) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await deleteProduct(id);
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess("Product deleted.");
        setDeletingId(null);
        router.refresh();
      }
    });
  }

  function handleRecordMovement() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await recordStockMovement(movementForm);
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess("Stock movement recorded.");
        setShowRecordMovement(false);
        setMovementForm({
          product_id: "",
          movement_type: "in",
          quantity: 1,
          reason: "",
          reference: "",
          warehouse_id: "",
        });
        router.refresh();
      }
    });
  }

  function handleCreateWarehouse() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await createWarehouse(warehouseForm.name, warehouseForm.location);
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess("Warehouse created.");
        setShowAddWarehouse(false);
        setWarehouseForm({ name: "", location: "" });
        router.refresh();
      }
    });
  }

  function handleScan(value: string) {
    const found = enriched.find(
      (p) => p.sku.toLowerCase() === value.trim().toLowerCase(),
    );
    if (found) {
      setMovementForm({
        product_id: found.id,
        movement_type: "in",
        quantity: 1,
        reason: `Barcode scan: ${value}`,
        reference: value,
        warehouse_id: found.warehouse_id || "",
      });
      setShowRecordMovement(true);
      setSuccess(`Scanned: ${found.name} (${found.sku})`);
    } else {
      setError(`No product found for barcode/SKU "${value}".`);
    }
    setShowScanner(false);
  }
  const warehouseName = (id: string | null) =>
    warehouses.find((w) => w.id === id)?.name ?? "—";

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

      {/* Stat row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Products" value={enriched.length} />
        <Tile label="Units on hand" value={totalUnits} />
        <Tile label="Warehouses" value={warehouses.length} />
        <Tile label="Low stock" value={lowStockCount} warn={lowStockCount > 0} />
      </div>

      {/* Actions */}
      {(canManageInventory || canManageWarehouses) && (
        <div className="flex flex-wrap gap-2">
          {canManageInventory && (
            <>
              <Button
                onClick={() => {
                  resetProductForm();
                  setShowAddProduct(true);
                }}
              >
                <Plus size={15} aria-hidden="true" />
                Add product
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowScanner(true)}
              >
                <Camera size={15} aria-hidden="true" />
                Scan
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowRecordMovement(true)}
              >
                Record movement
              </Button>
            </>
          )}
          {canManageWarehouses && (
            <Button variant="ghost" onClick={() => setShowAddWarehouse(true)}>
              <WarehouseIcon size={15} aria-hidden="true" />
              Warehouse
            </Button>
          )}
        </div>
      )}

      {!canManageInventory && (
        <div className="rounded-control border border-line bg-sunken px-4 py-3 text-sm text-ink-muted">
          You have read-only access to inventory. Ask an owner or admin to change
          products or record stock movements.
        </div>
      )}

      {/* Low stock banner */}
      {lowStockCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-control border border-warn/30 bg-warn-soft px-4 py-3">
          <AlertTriangle size={16} className="shrink-0 text-warn" aria-hidden="true" />
          <p className="text-sm text-warn">
            {lowStockCount} {lowStockCount === 1 ? "product is" : "products are"} below
            reorder level
          </p>
        </div>
      )}

      {/* Products */}
      <section className="rounded-card border border-line bg-surface ring-1 ring-black/[0.02]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-base font-medium tracking-[-0.01em] text-ink">
            Products
          </h2>
          <span className="text-xs text-ink-muted">
            {filtered.length} of {enriched.length}
          </span>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-3 sm:px-5">
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
              placeholder="Search name or SKU"
              aria-label="Search products"
              className="h-9 w-full rounded-control border border-line-strong bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint transition-colors hover:border-ink-faint focus:border-brand focus:outline-none"
            />
          </div>
          {warehouses.length > 0 && (
            <select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
              aria-label="Filter by warehouse"
              className="h-9 rounded-control border border-line-strong bg-surface px-3 text-sm text-ink transition-colors hover:border-ink-faint focus:border-brand focus:outline-none"
            >
              <option value="">All warehouses</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Status filter chips */}
        <div className="border-b border-line px-3 py-3 sm:px-5">
          <Tabs
            items={[
              { id: "all", label: "All", count: enriched.length },
              { id: "low", label: "Low stock", count: lowStockCount },
              {
                id: "ok",
                label: "OK",
                count: enriched.length - lowStockCount,
              },
            ]}
            active={statusFilter}
            onChange={(id) => setStatusFilter(id as StatusFilter)}
            className="border-b-0"
          />
        </div>

        {enriched.length === 0 ? (
          <EmptyState
            icon={<Package size={22} strokeWidth={1.75} />}
            title="No products yet"
            description="Add your first product to start tracking inventory."
            action={
              canManageInventory ? (
                <Button
                  onClick={() => {
                    resetProductForm();
                    setShowAddProduct(true);
                  }}
                >
                  <Plus size={15} aria-hidden="true" />
                  Add product
                </Button>
              ) : undefined
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Search size={22} strokeWidth={1.75} />}
            title="No matching products"
            description="Try a different search term or clear the filters."
          />
        ) : (
          <div className="max-w-full overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-sunken text-[11px] uppercase tracking-[0.08em] text-ink-muted">
                <tr>
                  <th className="px-3 py-2.5 sm:px-5 font-medium">SKU</th>
                  <th className="px-3 py-2.5 sm:px-5 font-medium">Name</th>
                  <th className="hidden px-3 py-2.5 font-medium sm:table-cell sm:px-5">Warehouse</th>
                  <th className="px-3 py-2.5 sm:px-5 text-right font-medium">On hand</th>
                  <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell sm:px-5">Reorder</th>
                  <th className="px-3 py-2.5 sm:px-5 font-medium">Status</th>
                  {canManageInventory && (
                    <th className="px-3 py-2.5 sm:px-5 text-right font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-sunken/60">
                    <td className="whitespace-nowrap px-3 py-3 sm:px-5 font-mono text-xs text-ink-muted">
                      {p.sku}
                    </td>
                    <td className="px-3 py-3 sm:px-5">
                      <p className="font-medium text-ink">{p.name}</p>
                      {p.description && (
                        <p className="mt-0.5 text-xs text-ink-faint">{p.description}</p>
                      )}
                    </td>
<td className="hidden whitespace-nowrap px-3 py-3 text-ink-muted sm:table-cell sm:px-5">
                      {warehouseName(p.warehouse_id)}
                    </td>
                    <td className="px-3 py-3 sm:px-5 text-right">
                      <span className="font-mono text-sm font-semibold tabular text-ink">
                        {p.onHand}
                      </span>
                      <span className="ml-1 text-xs text-ink-faint">{p.unit}</span>
                    </td>
<td className="hidden px-3 py-3 text-right font-mono text-xs tabular text-ink-muted sm:table-cell sm:px-5">
                      {p.reorder_level}
                    </td>
                    <td className="px-3 py-3 sm:px-5">
                      {p.isLow ? (
                        <Badge tone="danger">Low stock</Badge>
                      ) : (
                        <Badge tone="brand" dot>
                          OK
                        </Badge>
                      )}
                    </td>
                    {canManageInventory && (
                      <td className="px-3 py-3 sm:px-5 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => openEdit(p)}
                            className="text-xs font-medium text-brand transition-colors hover:text-brand-hover"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeletingId(p.id)}
                            aria-label={`Delete ${p.name}`}
                            className="text-ink-faint transition-colors hover:text-danger"
                          >
                            <MoreHorizontal size={16} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent movements */}
      <section className="rounded-card border border-line bg-surface ring-1 ring-black/[0.02]">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-base font-medium tracking-[-0.01em] text-ink">
            Recent stock movements
          </h2>
        </div>
        {movements.length === 0 ? (
          <EmptyState
            icon={<Boxes size={22} strokeWidth={1.75} />}
            title="No stock movements yet"
            description="Record stock in or out to build the audit trail."
          />
        ) : (
          <div className="max-w-full overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-sunken text-[11px] uppercase tracking-[0.08em] text-ink-muted">
                <tr>
                  <th className="px-3 py-2.5 sm:px-5 font-medium">Date</th>
                  <th className="px-3 py-2.5 sm:px-5 font-medium">Product</th>
                  <th className="px-3 py-2.5 sm:px-5 font-medium">Type</th>
                  <th className="px-3 py-2.5 sm:px-5 text-right font-medium">Qty</th>
                  <th className="px-3 py-2.5 sm:px-5 font-medium">Reason</th>
                  <th className="px-3 py-2.5 sm:px-5 font-medium">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {movements.map((m) => {
                  const meta = MOVEMENT_TONES[m.movement_type];
                  const negative = m.movement_type === "out";
                  return (
                    <tr key={m.id} className="transition-colors hover:bg-sunken/60">
                      <td className="whitespace-nowrap px-3 py-3 sm:px-5 text-xs text-ink-faint">
                        {new Date(m.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-3 sm:px-5 font-medium text-ink">
                        {m.product_name}
                      </td>
                      <td className="px-3 py-3 sm:px-5">
                        <Badge tone={meta?.tone ?? "neutral"}>
                          {meta?.label ?? m.movement_type}
                        </Badge>
                      </td>
                      <td
                        className={`px-3 py-3 sm:px-5 text-right font-mono text-sm font-semibold tabular ${
                          negative ? "text-danger" : "text-brand"
                        }`}
                      >
                        {negative ? `−${m.quantity}` : `+${m.quantity}`}
                      </td>
                      <td className="px-3 py-3 sm:px-5 text-ink-muted">{m.reason ?? "—"}</td>
                      <td className="px-3 py-3 sm:px-5 font-mono text-xs text-ink-faint">
                        {m.reference ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Warehouses */}
      <section className="rounded-card border border-line bg-surface ring-1 ring-black/[0.02]">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-base font-medium tracking-[-0.01em] text-ink">
            Warehouses
          </h2>
        </div>
        {warehouses.length === 0 ? (
          <EmptyState
            icon={<WarehouseIcon size={22} strokeWidth={1.75} />}
            title="No warehouses yet"
            description="Add a warehouse to start assigning products to locations."
          />
        ) : (
          <div className="max-w-full overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-sunken text-[11px] uppercase tracking-[0.08em] text-ink-muted">
                <tr>
                  <th className="px-3 py-2.5 sm:px-5 font-medium">Name</th>
                  <th className="px-3 py-2.5 sm:px-5 font-medium">Location</th>
                  <th className="px-3 py-2.5 sm:px-5 text-right font-medium">Products</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {warehouses.map((w) => {
                  const count = products.filter((p) => p.warehouse_id === w.id).length;
                  return (
                    <tr key={w.id} className="transition-colors hover:bg-sunken/60">
                      <td className="px-3 py-3 sm:px-5 font-medium text-ink">{w.name}</td>
                      <td className="px-3 py-3 sm:px-5 text-ink-muted">{w.location ?? "—"}</td>
                      <td className="px-3 py-3 sm:px-5 text-right font-mono text-sm tabular text-ink-muted">
                        {count}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---- Modals ---- */}

      <Modal
        open={showAddProduct}
        onClose={() => setShowAddProduct(false)}
        title="Add product"
      >
        <ProductForm
          form={productForm}
          setForm={setProductForm}
          warehouses={warehouses}
          onSubmit={handleCreateProduct}
          isPending={isPending}
          submitLabel="Create product"
        />
      </Modal>

      <Modal
        open={editingProduct !== null}
        onClose={() => {
          setEditingProduct(null);
          resetProductForm();
        }}
        title="Edit product"
      >
        <ProductForm
          form={productForm}
          setForm={setProductForm}
          warehouses={warehouses}
          onSubmit={handleUpdateProduct}
          isPending={isPending}
          submitLabel="Save changes"
        />
      </Modal>

      <Modal
        open={showRecordMovement}
        onClose={() => setShowRecordMovement(false)}
        title="Record stock movement"
      >
        <div className="space-y-4">
          <Select
            label="Product"
            value={movementForm.product_id}
            onChange={(e) =>
              setMovementForm({ ...movementForm, product_id: e.target.value })
            }
          >
            <option value="">Select a product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku}) — {stockMap[p.id] ?? 0} on hand
              </option>
            ))}
          </Select>
          <Select
            label="Movement type"
            value={movementForm.movement_type}
            onChange={(e) =>
              setMovementForm({
                ...movementForm,
                movement_type: e.target.value as typeof movementForm.movement_type,
              })
            }
          >
            <option value="in">Stock in (receiving)</option>
            <option value="out">Stock out (dispatch or sale)</option>
            <option value="adjustment">Adjustment (correction)</option>
            <option value="transfer">Transfer</option>
          </Select>
          <Input
            label="Quantity"
            type="number"
            min={1}
            value={movementForm.quantity}
            onChange={(e) =>
              setMovementForm({
                ...movementForm,
                quantity: parseInt(e.target.value) || 1,
              })
            }
          />
          <Input
            label="Reason"
            type="text"
            value={movementForm.reason}
            onChange={(e) =>
              setMovementForm({ ...movementForm, reason: e.target.value })
            }
            placeholder="e.g. Purchase order #123, damaged goods"
          />
          <Input
            label="Reference"
            type="text"
            value={movementForm.reference}
            onChange={(e) =>
              setMovementForm({ ...movementForm, reference: e.target.value })
            }
            placeholder="e.g. PO-001, Dispatch #45"
          />
          {warehouses.length > 0 && (
            <Select
              label="Warehouse (optional)"
              value={movementForm.warehouse_id}
              onChange={(e) =>
                setMovementForm({ ...movementForm, warehouse_id: e.target.value })
              }
            >
              <option value="">Default</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowRecordMovement(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRecordMovement}
              loading={isPending}
              disabled={!movementForm.product_id}
            >
              Record movement
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showAddWarehouse}
        onClose={() => setShowAddWarehouse(false)}
        title="Add warehouse"
      >
        <div className="space-y-4">
          <Input
            label="Warehouse name"
            type="text"
            value={warehouseForm.name}
            onChange={(e) =>
              setWarehouseForm({ ...warehouseForm, name: e.target.value })
            }
            placeholder="e.g. Lagos Central"
          />
          <Input
            label="Location (optional)"
            type="text"
            value={warehouseForm.location}
            onChange={(e) =>
              setWarehouseForm({ ...warehouseForm, location: e.target.value })
            }
            placeholder="e.g. Ikeja, Lagos"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowAddWarehouse(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateWarehouse}
              loading={isPending}
              disabled={!warehouseForm.name.trim()}
            >
              Create warehouse
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={deletingId !== null}
        onClose={() => setDeletingId(null)}
        title="Delete product"
      >
        <p className="text-sm text-ink-muted">
          Are you sure you want to delete this product? This cannot be undone.
          Products with stock movements cannot be deleted.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeletingId(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => handleDeleteProduct(deletingId!)} loading={isPending}>
            Delete product
          </Button>
        </div>
      </Modal>

      {showScanner && (
        <BarcodeScanner
          open
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-card border p-4 ring-1 ring-black/[0.02] ${
        warn ? "border-warn/30 bg-warn-soft" : "border-line bg-surface"
      }`}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-muted">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-semibold tracking-[-0.02em] ${
          warn ? "text-warn" : "text-ink"
        }`}
      >
        <span className="tabular">{value.toLocaleString()}</span>
      </p>
    </div>
  );
}

function ProductForm({
  form,
  setForm,
  warehouses,
  onSubmit,
  isPending,
  submitLabel,
}: {
  form: {
    sku: string;
    name: string;
    description: string;
    unit: string;
    reorder_level: number;
    warehouse_id: string;
  };
  setForm: (f: typeof form) => void;
  warehouses: Warehouse[];
  onSubmit: () => void;
  isPending: boolean;
  submitLabel: string;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="SKU"
          type="text"
          value={form.sku}
          onChange={(e) => setForm({ ...form, sku: e.target.value })}
          placeholder="PROD-001"
        />
        <Input
          label="Name"
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Product name"
        />
      </div>
      <Input
        label="Description (optional)"
        type="text"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
      />
      <div className="grid grid-cols-3 gap-4">
        <Input
          label="Unit"
          type="text"
          value={form.unit}
          onChange={(e) => setForm({ ...form, unit: e.target.value })}
          placeholder="unit, kg, pcs"
        />
        <Input
          label="Reorder level"
          type="number"
          min={0}
          value={form.reorder_level}
          onChange={(e) =>
            setForm({ ...form, reorder_level: parseInt(e.target.value) || 0 })
          }
        />
        <Select
          label="Warehouse"
          value={form.warehouse_id}
          onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}
        >
          <option value="">None</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button
          onClick={onSubmit}
          loading={isPending}
          disabled={!form.sku.trim() || !form.name.trim()}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
