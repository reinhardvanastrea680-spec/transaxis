export type Role = "owner" | "admin" | "warehouse" | "dispatcher" | "driver" | "staff";

export type Capability =
  | "inventory.view"
  | "inventory.manage"
  | "warehouse.manage"
  | "dispatch.view"
  | "dispatch.create"
  | "dispatch.assign"
  | "dispatch.status.all"
  | "dispatch.status.own"
  | "dispatch.pod"
  | "dispatch.delete"
  | "vehicle.manage"
  | "staff.view"
  | "staff.manage"
  | "audit.view";

const MATRIX: Record<Capability, Role[]> = {
  "inventory.view": ["owner", "admin", "warehouse", "dispatcher", "staff"],
  "inventory.manage": ["owner", "admin", "warehouse"],
  "warehouse.manage": ["owner", "admin", "warehouse"],
  "dispatch.view": ["owner", "admin", "warehouse", "dispatcher", "driver", "staff"],
  "dispatch.create": ["owner", "admin", "dispatcher"],
  "dispatch.assign": ["owner", "admin", "dispatcher"],
  "dispatch.status.all": ["owner", "admin", "dispatcher"],
  "dispatch.status.own": ["owner", "admin", "dispatcher", "driver"],
  "dispatch.pod": ["owner", "admin", "dispatcher", "driver"],
  "dispatch.delete": ["owner", "admin"],
  "vehicle.manage": ["owner", "admin", "dispatcher"],
  "staff.view": ["owner", "admin", "warehouse"],
  "staff.manage": ["owner", "admin"],
  "audit.view": ["owner", "admin", "warehouse"],
};

export function can(role: string | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return (MATRIX[capability] as Role[]).includes(role as Role);
}

export const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  warehouse: "Warehouse",
  dispatcher: "Dispatcher",
  driver: "Driver",
  staff: "Staff (read-only)",
};

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner: "Full access. Manages billing, org settings, staff, and all modules.",
  admin: "Full access to every module and staff, except org deletion.",
  warehouse: "Manages products, stock movements, and warehouses. Read-only elsewhere.",
  dispatcher: "Creates and assigns dispatches, manages vehicles. Read-only inventory.",
  driver: "Views only their assigned dispatches and updates status or proof of delivery.",
  staff: "Read-only access to dashboards, inventory, and dispatches.",
};
