import type { StockStatusInfo } from "@/lib/stock-status";

export type Product = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  reorder_level: number;
  warehouse_id: string | null;
  /** Free-text physical position, e.g. "Aisle B, Rack 3, Shelf 2". Optional. */
  location: string | null;
  created_at: string;
};

/** A product joined with its live stock position. */
export type EnrichedProduct = Product & {
  onHand: number;
  stockInfo: StockStatusInfo;
};

export type Warehouse = {
  id: string;
  name: string;
  location: string | null;
};

export type Movement = {
  id: string;
  product_id: string;
  product_name: string;
  movement_type: string;
  quantity: number;
  reason: string | null;
  reference: string | null;
  created_at: string;
};
