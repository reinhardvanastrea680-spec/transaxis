"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

type Product = { id: string; sku: string; name: string; unit: string; reorder_level: number; warehouse_id: string | null; on_hand: number };
type Movement = { id: string; product_name: string; movement_type: string; quantity: number; reason: string | null; reference: string | null; created_at: string };
type Dispatch = { id: string; status: string; customer_name: string | null; customer_address: string | null; created_at: string };

type Props = {
  products: Product[];
  movements: Movement[];
  dispatches: Dispatch[];
  /** Null means history is unlimited on this plan. */
  historyDays: number | null;
};

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsClient({ products, movements, dispatches, historyDays }: Props) {
  return (
    <div className="min-w-0 space-y-6">
      {historyDays !== null && (
        <p className="rounded-control border border-line bg-sunken px-4 py-3 text-sm text-ink-muted">
          Showing activity from the last {historyDays} days. Older movements and
          dispatches are kept, but need a paid plan to appear here.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <ReportCard
          title="Inventory snapshot"
          description={`${products.length} products with current stock levels.`}
          onDownload={() =>
            downloadCsv("inventory.csv", [
              ["SKU", "Name", "Unit", "On hand", "Reorder level", "Warehouse"],
              ...products.map((p) => [p.sku, p.name, p.unit, String(p.on_hand), String(p.reorder_level), p.warehouse_id ?? ""]),
            ])
          }
        />
        <ReportCard
          title="Stock movements"
          description={`${movements.length} recent stock movements.`}
          onDownload={() =>
            downloadCsv("stock_movements.csv", [
              ["Date", "Product", "Type", "Quantity", "Reason", "Reference"],
              ...movements.map((m) => [m.created_at, m.product_name, m.movement_type, String(m.quantity), m.reason ?? "", m.reference ?? ""]),
            ])
          }
        />
        <ReportCard
          title="Dispatches"
          description={`${dispatches.length} dispatch records.`}
          onDownload={() =>
            downloadCsv("dispatches.csv", [
              ["Date", "ID", "Customer", "Address", "Status"],
              ...dispatches.map((d) => [d.created_at, d.id, d.customer_name ?? "", d.customer_address ?? "", d.status]),
            ])
          }
        />
      </div>

      {products.length === 0 && movements.length === 0 && dispatches.length === 0 && (
        <EmptyState
          title="No data to export yet"
          description="Add products and record activity to generate reports."
        />
      )}
    </div>
  );
}

function ReportCard({ title, description, onDownload }: { title: string; description: string; onDownload: () => void }) {
  return (
    <div className="rounded-card border border-line bg-surface p-6 ring-1 ring-black/[0.02]">
      <h3 className="text-base font-medium text-ink">{title}</h3>
      <p className="mt-1 text-sm text-ink-muted">{description}</p>
      <Button className="mt-4" variant="outline" size="sm" onClick={onDownload}>
        <Download size={14} aria-hidden="true" />
        Download CSV
      </Button>
    </div>
  );
}
