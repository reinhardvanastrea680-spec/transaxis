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
  | "dispatch.confirm"
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
  // Assignment is the owner's call and nobody else's. A driver can never set
  // this — "assigned" is not a status any user picks, it is the side-effect of
  // the owner attaching a driver.
  "dispatch.assign": ["owner"],
  "dispatch.status.all": ["owner", "admin", "dispatcher"],
  "dispatch.status.own": ["owner", "admin", "dispatcher", "driver"],
  // Closing a delivery is a sign-off on someone else's evidence, so it is kept
  // as its own capability rather than riding on `dispatch.status.all`. Narrow
  // this list to ["owner"] to make confirmation owner-only; nothing else in the
  // flow needs to change.
  "dispatch.confirm": ["owner", "admin", "dispatcher"],
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
  admin: "Full access to every module and staff, except org deletion and driver assignment.",
  warehouse: "Manages products, stock movements, and warehouses. Read-only elsewhere.",
  dispatcher: "Creates dispatches, manages delivery status and vehicles, and confirms deliveries against the driver's photo. Cannot assign drivers.",
  driver: "Views only their own assigned dispatches, marks them picked up, and sends a photo as proof of delivery.",
  staff: "Read-only access to dashboards, inventory, and dispatches.",
};
