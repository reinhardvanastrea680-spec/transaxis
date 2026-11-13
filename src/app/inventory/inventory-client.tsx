"use client";

import {
  useMemo,
  useState,
  useTransition,
  useCallback,
  useEffect,
  useRef,
  type Ref,
} from "react";

import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Boxes,
  Camera,
  MapPin,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  Upload,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  recordStockMovement,
  createWarehouse,
  importProducts,
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
import { getStockStatus } from "@/lib/stock-status";
import { resolveScan, scanButtonLabel, type ScanMode } from "@/lib/scan";
import { isLookupableCode, lookupProductName } from "@/lib/barcode-lookup";
import { ProductDetail } from "./product-detail";
import type { Product, Warehouse, Movement } from "./types";

export type { Product } from "./types";

type Props = {
  products: Product[];
  stockMap: Record<string, number>;
  warehouses: Warehouse[];
  movements: Movement[];
  role: string;
};

type StatusFilter = "all" | "out" | "low" | "ok";

/**
 * Progress of the barcode → name lookup that runs after scanning an unknown
 * code. Every terminal state still lets the user create the product; the state
 * only decides what the Name field says and whether it takes focus.
 */
type NameLookupState =
  | "idle"
  | "searching"
  | "found"
  | "not-found"
  | "unsupported"
  | "error";

const NAME_LOOKUP_HINTS: Record<NameLookupState, string | undefined> = {
  idle: undefined,
  searching: "Looking up the product name from the barcode…",
  found: "Name found in the barcode database — edit it if it isn't right.",
  "not-found":
    "This barcode isn't in the public product database. Type the name.",
  unsupported:
    "Not a retail barcode, so there's no name to look up. Type it.",
  error: "Couldn't reach the product database. Type the name.",
};

const MOVEMENT_TONES: Record<string, { tone: "brand" | "danger" | "warn" | "info"; label: string }> = {
  in: { tone: "brand", label: "In" },
  out: { tone: "danger", label: "Out" },
  adjustment: { tone: "warn", label: "Adjustment" },
  transfer: { tone: "info", label: "Transfer" },
};

export default function InventoryClient({
  products: initialProducts,
  stockMap: initialStockMap,
  warehouses: initialWarehouses,
  movements: initialMovements,
  role,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Local state — mutated optimistically, synced via router.refresh() in background
  const [products, setProducts] = useState(initialProducts);
  const [stockMap, setStockMap] = useState(initialStockMap);
  const [warehouses, setWarehouses] = useState(initialWarehouses);
  const [movements, setMovements] = useState(initialMovements);

  // Per-action loading keys — only the clicked button shows loading
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showRecordMovement, setShowRecordMovement] = useState(false);
  const [showAddWarehouse, setShowAddWarehouse] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [importPending, setImportPending] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState<ScanMode>("find");

  // Barcode → name lookup. `lookupSeq` invalidates results that arrive after
  // the user has moved on (closed the form, scanned again, typed a name).
  const [nameLookup, setNameLookup] = useState<NameLookupState>("idle");
  const lookupSeq = useRef(0);
  const nameInputRef = useRef<HTMLInputElement>(null);

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
    location: "",
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

  // When the lookup comes back empty, the Name field is the next thing the user
  // must fill, so put the cursor there rather than making them hunt for it.
  useEffect(() => {
    if (!showAddProduct) return;
    if (
      nameLookup === "not-found" ||
      nameLookup === "unsupported" ||
      nameLookup === "error"
    ) {
      nameInputRef.current?.focus();
    }
  }, [showAddProduct, nameLookup]);

  // ---- Derived data ----
  const enriched = useMemo(
    () =>
      products.map((p) => {
        const onHand = stockMap[p.id] ?? 0;
        const stockInfo = getStockStatus(onHand, p.reorder_level);
        return { ...p, onHand, stockInfo };
      }),
    [products, stockMap],
  );

  const outOfStockCount = enriched.filter((p) => p.stockInfo.status === "out_of_stock").length;
  const lowStockCount = enriched.filter((p) => p.stockInfo.status === "low_stock").length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q))
        return false;
      if (warehouseFilter && p.warehouse_id !== warehouseFilter) return false;
      if (statusFilter === "out" && p.stockInfo.status !== "out_of_stock") return false;
      if (statusFilter === "low" && p.stockInfo.status !== "low_stock") return false;
      if (statusFilter === "ok" && p.stockInfo.status !== "in_stock") return false;
      return true;
    });
  }, [enriched, query, warehouseFilter, statusFilter]);

  const totalUnits = enriched.reduce((sum, p) => sum + p.onHand, 0);

  // Derived by id rather than held as an object, so editing a product updates
  // the open panel instead of leaving a stale copy on screen.
  const detailProduct = useMemo(
    () => (detailId ? enriched.find((p) => p.id === detailId) ?? null : null),
    [detailId, enriched],
  );

  function resetProductForm() {
    setProductForm({
      sku: "",
      name: "",
      description: "",
      unit: "unit",
      reorder_level: 0,
      warehouse_id: "",
      location: "",
    });
  }

  /** Open a blank Add product form (no barcode involved). */
  function openAddProduct() {
    lookupSeq.current++; // discard any lookup still in flight
    setNameLookup("idle");
    resetProductForm();
    setShowAddProduct(true);
  }

  /**
   * Fill the Name field from the scanned barcode.
   *
   * A barcode carries no name, so this asks a public product database. It is a
   * convenience, not a requirement: the product is still only created when the
   * form is submitted, the field stays editable, and a miss just moves the
   * cursor into the field for the user to type.
   */
  async function fillNameFromBarcode(sku: string) {
    const seq = ++lookupSeq.current;

    if (!isLookupableCode(sku)) {
      setNameLookup("unsupported");
      return;
    }

    setNameLookup("searching");
    const result = await lookupProductName(sku);
    if (seq !== lookupSeq.current) return; // superseded, or the form was closed

    if (result.status === "found") {
      setNameLookup("found");
      setProductForm((prev) =>
        // Never overwrite a name the user has already typed, and never apply a
        // name to a different SKU than the one that was scanned.
        prev.sku.trim().toLowerCase() === sku.trim().toLowerCase() &&
        !prev.name.trim()
          ? { ...prev, name: result.name }
          : prev,
      );
      return;
    }

    setNameLookup(result.status === "error" ? "error" : "not-found");
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
      location: product.location || "",
    });
  }

  // ---- Optimistic handlers ----
  // Pattern: close modal + clear form instantly, mutate local state,
  // then fire the server action. router.refresh() runs in background
  // only after the action resolves, to sync any server-derived data.

  const handleCreateProduct = useCallback(() => {
    setError(null);
    setSuccess(null);

    // Close modal + reset form INSTANTLY (optimistic)
    setShowAddProduct(false);
    lookupSeq.current++; // a late lookup result must not touch the next form
    setNameLookup("idle");
    resetProductForm();
    setPendingAction("create-product");

    // Optimistic local update — add a temp product
    const tempId = `temp-${Date.now()}`;
    const newProduct: Product = {
      id: tempId,
      sku: productForm.sku.trim(),
      name: productForm.name.trim(),
      description: productForm.description?.trim() || null,
      unit: productForm.unit.trim() || "unit",
      reorder_level: productForm.reorder_level,
      warehouse_id: productForm.warehouse_id || null,
      location: productForm.location.trim() || null,
      created_at: new Date().toISOString(),
    };
    setProducts((prev) => [newProduct, ...prev]);

    startTransition(async () => {
      const result = await createProduct(productForm);
      setPendingAction(null);
      if (result?.error) {
        setError(result.error);
        // Rollback — remove the temp product
        setProducts((prev) => prev.filter((p) => p.id !== tempId));
      } else {
        setSuccess("Product created.");
        // Background sync — replaces temp ID with real server data
        router.refresh();
      }
    });
  }, [productForm, router]);

  const handleUpdateProduct = useCallback(() => {
    if (!editingProduct) return;
    setError(null);
    setSuccess(null);

    // Close modal + reset INSTANTLY
    const productId = editingProduct.id;
    const updatedFields = { ...productForm };
    setEditingProduct(null);
    resetProductForm();
    setPendingAction("update-product");

    // Optimistic local update
    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId
          ? {
              ...p,
              sku: updatedFields.sku.trim(),
              name: updatedFields.name.trim(),
              description: updatedFields.description?.trim() || null,
              unit: updatedFields.unit.trim() || "unit",
              reorder_level: updatedFields.reorder_level,
              warehouse_id: updatedFields.warehouse_id || null,
              location: updatedFields.location.trim() || null,
            }
          : p,
      ),
    );

    startTransition(async () => {
      const result = await updateProduct(productId, updatedFields);
      setPendingAction(null);
      if (result?.error) {
        setError(result.error);
        router.refresh(); // Rollback by re-reading from server
      } else {
        setSuccess("Product updated.");
        router.refresh();
      }
    });
  }, [editingProduct, productForm, router]);

  const handleDeleteProduct = useCallback((id: string) => {
    setError(null);
    setSuccess(null);

    // Close modal INSTANTLY
    setDeletingId(null);
    setPendingAction(`delete-${id}`);

    // Optimistic local update — remove immediately
    const removed = products.find((p) => p.id === id);
    setProducts((prev) => prev.filter((p) => p.id !== id));

    startTransition(async () => {
      const result = await deleteProduct(id);
      setPendingAction(null);
      if (result?.error) {
        setError(result.error);
        // Rollback — re-add the product
        if (removed) setProducts((prev) => [removed, ...prev]);
      } else {
        setSuccess("Product deleted.");
        router.refresh();
      }
    });
  }, [products, router]);

  const handleRecordMovement = useCallback(() => {
    setError(null);
    setSuccess(null);

    // Snapshot form before clearing
    const form = { ...movementForm };
    const product = products.find((p) => p.id === form.product_id);

    // Close modal + reset INSTANTLY
    setShowRecordMovement(false);
    setMovementForm({
      product_id: "",
      movement_type: "in",
      quantity: 1,
      reason: "",
      reference: "",
      warehouse_id: "",
    });
    setPendingAction("record-movement");

    // Optimistic local update — adjust stock + add movement to list
    if (product) {
      const delta =
        form.movement_type === "out" ? -form.quantity : form.quantity;
      setStockMap((prev) => ({
        ...prev,
        [form.product_id]: (prev[form.product_id] ?? 0) + delta,
      }));
      const newMovement: Movement = {
        id: `temp-${Date.now()}`,
        product_id: form.product_id,
        product_name: product.name,
        movement_type: form.movement_type,
        quantity: form.quantity,
        reason: form.reason?.trim() || null,
        reference: form.reference?.trim() || null,
        created_at: new Date().toISOString(),
      };
      setMovements((prev) => [newMovement, ...prev]);
    }

    startTransition(async () => {
      const result = await recordStockMovement(form);
      setPendingAction(null);
      if (result?.error) {
        setError(result.error);
        // Rollback
        if (product) {
          const delta =
            form.movement_type === "out" ? form.quantity : -form.quantity;
          setStockMap((prev) => ({
            ...prev,
            [form.product_id]: (prev[form.product_id] ?? 0) + delta,
          }));
          setMovements((prev) =>
            prev.filter((m) => m.id !== `temp-${Date.now()}`),
          );
        }
      } else {
        setSuccess("Stock movement recorded.");
        router.refresh();
      }
    });
  }, [movementForm, products, router]);

  const handleImport = useCallback(() => {
    setError(null);
    setSuccess(null);
    setImportPending(true);

    startTransition(async () => {
      const result = await importProducts(importText);
      setImportPending(false);

      if (result?.error) {
        setError(result.error);
        return;
      }
      if (!result) {
        setError("Import failed. Please try again.");
        return;
      }

      setShowImport(false);
      setImportText("");
      setImportFileName("");

      const parts = [`${result.imported ?? 0} product(s) imported`];
      if (result.duplicates) parts.push(`${result.duplicates} duplicate(s) skipped`);
      if (result.skippedForLimit) {
        parts.push(`${result.skippedForLimit} over your plan limit`);
      }
      if (result.malformed) parts.push(`${result.malformed} malformed row(s)`);
      setSuccess(parts.join(" · "));
      router.refresh();
    });
  }, [importText, router]);

  const handleCreateWarehouse = useCallback(() => {
    setError(null);
    setSuccess(null);

    // Close modal + reset INSTANTLY
    setShowAddWarehouse(false);
    const formData = { ...warehouseForm };
    setWarehouseForm({ name: "", location: "" });
    setPendingAction("create-warehouse");

    // Optimistic local update
    const tempId = `temp-${Date.now()}`;
    const newWarehouse: Warehouse = {
      id: tempId,
      name: formData.name.trim(),
      location: formData.location?.trim() || null,
    };
    setWarehouses((prev) => [...prev, newWarehouse]);

    startTransition(async () => {
      const result = await createWarehouse(formData.name, formData.location);
      setPendingAction(null);
      if (result?.error) {
        setError(result.error);
        setWarehouses((prev) => prev.filter((w) => w.id !== tempId));
      } else {
        setSuccess("Warehouse created.");
        router.refresh();
      }
    });
  }, [warehouseForm, router]);

  /**
   * A scan means whatever the selected mode says it means. The resolution is a
   * pure function (src/lib/scan.ts) so the three behaviours are testable; this
   * only translates the outcome into UI state.
   */
  function handleScan(value: string) {
    setShowScanner(false);
    setError(null);
    setSuccess(null);
    lookupSeq.current++; // any lookup from a previous scan is now stale

    const outcome = resolveScan(enriched, value, scanMode);

    switch (outcome.action) {
      case "ignore":
        return;

      case "open-detail": {
        const product = enriched.find((p) => p.id === outcome.productId);
        if (!product) {
          setError("That product is no longer in the list. Refresh and try again.");
          return;
        }
        // Narrow the table as well, so closing the panel leaves the item in
        // view rather than back at the full catalogue.
        setQuery(product.sku);
        setWarehouseFilter("");
        setStatusFilter("all");
        setDetailId(product.id);
        return;
      }

      case "prefill-movement": {
        const product = enriched.find((p) => p.id === outcome.productId);
        if (!product) {
          setError("That product is no longer in the list. Refresh and try again.");
          return;
        }
        setMovementForm({
          product_id: product.id,
          movement_type: "in",
          quantity: 1,
          // The audit trail records what was scanned *and* what it was: a code
          // alone means nothing to whoever reads the history in six months.
          reason: `Barcode scan: ${product.name} (${value.trim()})`,
          reference: value.trim(),
          warehouse_id: product.warehouse_id || "",
        });
        setShowRecordMovement(true);
        setSuccess(`Scanned: ${product.name} (${product.sku})`);
        return;
      }

      case "prefill-new-product": {
        setNameLookup("idle");
        setProductForm({
          sku: outcome.sku,
          name: "",
          description: "",
          unit: "unit",
          reorder_level: 0,
          warehouse_id: "",
          location: "",
        });
        setShowAddProduct(true);
        setSuccess(`New SKU "${outcome.sku}" — check the details and create it.`);
        // Fill the name too, so a scan lands on a form with both the code and
        // the product name already in it.
        void fillNameFromBarcode(outcome.sku);
        return;
      }

      case "duplicate-sku": {
        const product = enriched.find((p) => p.id === outcome.productId);
        setQuery(outcome.sku);
        if (product) setDetailId(product.id);
        setSuccess(
          product
            ? `"${outcome.sku}" (${product.name}) already exists — opened it instead of creating a duplicate.`
            : `"${outcome.sku}" already exists — opened it instead of creating a duplicate.`,
        );
        return;
      }
    }
  }

  const handleLocationSaved = useCallback(
    (productId: string, location: string | null) => {
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, location } : p)),
      );
      setSuccess(
        location
          ? `Storage location set to "${location}".`
          : "Storage location cleared.",
      );
      router.refresh();
    },
    [router],
  );

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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Products" value={enriched.length} />
        <Tile label="Units on hand" value={totalUnits} />
        <Tile label="Warehouses" value={warehouses.length} />
        <Tile label="Low stock" value={lowStockCount} warn={lowStockCount > 0} />
        <Tile label="Out of stock" value={outOfStockCount} danger={outOfStockCount > 0} />
      </div>

      {/* Actions */}
      {(canManageInventory || canManageWarehouses) && (
        <div className="flex flex-wrap gap-2">
          {canManageInventory && (
            <>
              <Button
                onClick={openAddProduct}
              >
                <Plus size={15} aria-hidden="true" />
                Add product
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowScanner(true)}
              >
                <Camera size={15} aria-hidden="true" />
                {scanButtonLabel(scanMode)}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowRecordMovement(true)}
              >
                Record movement
              </Button>
              <Button variant="outline" onClick={() => setShowImport(true)}>
                <Upload size={15} aria-hidden="true" />
                Import CSV
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

      {/* Out of stock banner */}
      {outOfStockCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-control border border-danger/30 bg-danger-soft px-4 py-3">
          <AlertTriangle size={16} className="shrink-0 text-danger" aria-hidden="true" />
          <p className="text-sm text-danger">
            {outOfStockCount} {outOfStockCount === 1 ? "product is" : "products are"} out of stock
          </p>
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
              { id: "out", label: "Out of stock", count: outOfStockCount },
              { id: "low", label: "Low stock", count: lowStockCount },
              {
                id: "ok",
                label: "In stock",
                count: enriched.length - outOfStockCount - lowStockCount,
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
                  onClick={openAddProduct}
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
                  <th className="hidden px-3 py-2.5 font-medium md:table-cell sm:px-5">Location</th>
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
                  <tr
                    key={p.id}
                    onClick={() => setDetailId(p.id)}
                    className="cursor-pointer transition-colors hover:bg-sunken/60"
                  >
                    <td className="whitespace-nowrap px-3 py-3 sm:px-5 font-mono text-xs text-ink-muted">
                      {p.sku}
                    </td>
                    <td className="px-3 py-3 sm:px-5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailId(p.id);
                        }}
                        className="text-left font-medium text-ink transition-colors hover:text-brand"
                      >
                        {p.name}
                      </button>
                      {p.description && (
                        <p className="mt-0.5 text-xs text-ink-faint">{p.description}</p>
                      )}
                    </td>
                    <td className="hidden px-3 py-3 sm:px-5 md:table-cell">
                      {p.location ? (
                        <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                          <MapPin size={11} aria-hidden="true" />
                          {p.location}
                        </span>
                      ) : (
                        <span className="text-xs text-ink-faint">
                          {canManageInventory ? "Set location" : "—"}
                        </span>
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
                      <Badge tone={p.stockInfo.tone} dot={p.stockInfo.status === "in_stock"}>
                        {p.stockInfo.label}
                      </Badge>
                    </td>
                    {canManageInventory && (
                      <td className="px-3 py-3 sm:px-5 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(p);
                            }}
                            className="text-xs font-medium text-brand transition-colors hover:text-brand-hover"
                          >
                            Edit
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingId(p.id);
                            }}
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
        onClose={() => {
          lookupSeq.current++; // stop a late lookup from filling a closed form
          setNameLookup("idle");
          setShowAddProduct(false);
        }}
        title="Add product"
      >
        <ProductForm
          form={productForm}
          setForm={setProductForm}
          warehouses={warehouses}
          onSubmit={handleCreateProduct}
          isPending={pendingAction === "create-product"}
          submitLabel="Create product"
          nameHint={NAME_LOOKUP_HINTS[nameLookup]}
          nameInputRef={nameInputRef}
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
          isPending={pendingAction === "update-product"}
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
            label={
              movementForm.movement_type === "adjustment"
                ? "Adjustment (use − to reduce)"
                : "Quantity"
            }
            type="number"
            min={movementForm.movement_type === "adjustment" ? undefined : 1}
            value={movementForm.quantity}
            onChange={(e) => {
              const parsed = parseInt(e.target.value, 10);
              setMovementForm({
                ...movementForm,
                quantity: Number.isFinite(parsed) ? parsed : 0,
              });
            }}
          />
          {movementForm.movement_type === "adjustment" && (
            <p className="-mt-2 text-xs text-ink-muted">
              A negative number reduces stock — use it for shrinkage, damage, or
              a miscount found during stocktaking.
            </p>
          )}
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
              loading={pendingAction === "record-movement"}
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
              loading={pendingAction === "create-warehouse"}
              disabled={!warehouseForm.name.trim()}
            >
              Create warehouse
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showImport}
        onClose={() => {
          setShowImport(false);
          setImportText("");
          setImportFileName("");
        }}
        title="Import products from CSV"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            Upload a CSV with a header row. Only <code className="font-mono text-xs">sku</code>{" "}
            and <code className="font-mono text-xs">name</code> are required;
            optional columns are{" "}
            <code className="font-mono text-xs">unit</code>,{" "}
            <code className="font-mono text-xs">reorder_level</code>,{" "}
            <code className="font-mono text-xs">description</code> and{" "}
            <code className="font-mono text-xs">warehouse</code>.
          </p>

          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-strong bg-sunken/50 px-6 py-8 text-center transition-colors hover:border-brand hover:bg-brand-soft/40">
            <Upload size={20} className="text-ink-muted" aria-hidden="true" />
            <span className="text-sm font-medium text-ink">
              {importFileName || "Choose a CSV file"}
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setImportFileName(file.name);
                file.text().then(setImportText).catch(() => {
                  setError("Could not read that file.");
                  setImportFileName("");
                });
              }}
            />
          </label>

          {importText && (
            <p className="text-xs text-ink-muted">
              {Math.max(0, importText.split(/\r?\n/).filter((l) => l.trim()).length - 1)}{" "}
              data row(s) detected.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowImport(false);
                setImportText("");
                setImportFileName("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              loading={importPending}
              disabled={!importText.trim()}
            >
              Import products
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
          <Button
            variant="danger"
            onClick={() => deletingId && handleDeleteProduct(deletingId)}
            loading={!!deletingId && pendingAction === `delete-${deletingId}`}
          >
            Delete product
          </Button>
        </div>
      </Modal>

      {showScanner && (
        <BarcodeScanner
          open
          mode={scanMode}
          onModeChange={setScanMode}
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}

      {detailProduct && (
        <ProductDetail
          key={detailProduct.id}
          product={detailProduct}
          movements={movements.filter((m) => m.product_id === detailProduct.id)}
          warehouseName={warehouseName}
          canManage={canManageInventory}
          onClose={() => setDetailId(null)}
          onLocationSaved={handleLocationSaved}
        />
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  warn,
  danger,
}: {
  label: string;
  value: number;
  warn?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-card border p-4 ring-1 ring-black/[0.02] ${
        danger ? "border-danger/30 bg-danger-soft" : warn ? "border-warn/30 bg-warn-soft" : "border-line bg-surface"
      }`}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-muted">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-semibold tracking-[-0.02em] ${
          danger ? "text-danger" : warn ? "text-warn" : "text-ink"
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
  nameHint,
  nameInputRef,
}: {
  form: {
    sku: string;
    name: string;
    description: string;
    unit: string;
    reorder_level: number;
    warehouse_id: string;
    location: string;
  };
  setForm: (f: typeof form) => void;
  warehouses: Warehouse[];
  onSubmit: () => void;
  isPending: boolean;
  submitLabel: string;
  /** Progress of the barcode → name lookup, shown under the Name field. */
  nameHint?: string;
  nameInputRef?: Ref<HTMLInputElement>;
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
          ref={nameInputRef}
          label="Name"
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Product name"
          hint={nameHint}
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
      <Input
        label="Storage location (optional)"
        type="text"
        value={form.location}
        onChange={(e) => setForm({ ...form, location: e.target.value })}
        placeholder="e.g. Aisle B, Rack 3, Shelf 2"
        hint="Where it physically sits. Shown when you scan to find this item."
      />
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
