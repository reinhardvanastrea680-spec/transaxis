/**
 * Dispatch state machine.
 *
 * One definition, used by both the UI (which buttons to render) and the server
 * action (whether to accept the change). Keeping them in the same place is what
 * stops a driver from being shown an owner-only action — or from calling it
 * directly with a crafted request.
 *
 *   created ──assign──> assigned ──pick up──> in_transit
 *      │                   │                      │
 *      └──cancel───────────┴──cancel──────────────┤
 *                                                 ├──proof──> delivered_pending ──confirm──> delivered
 *                                                 └──fail───────────────────────────────────> failed
 *
 * Delivery is deliberately two-stage. The driver does not close a run; they
 * submit evidence for it. `delivered_pending` means "the driver says it landed
 * and here is the photo" — the office then confirms against that photo. A run
 * only becomes `delivered` when a human in the office has seen the proof.
 *
 * Drivers get exactly two moves, and only on their own runs:
 *   assigned   -> in_transit         ("Mark picked up")
 *   in_transit -> delivered_pending  ("Send delivery proof", requires a photo)
 *
 * Drivers never reach `delivered`. That transition is office-only, and the
 * server refuses it unless a proof-of-delivery row already exists.
 */

export type DispatchStatus =
  | "created"
  | "assigned"
  | "in_transit"
  | "delivered_pending"
  | "delivered"
  | "failed"
  | "cancelled";

/** Statuses that mean "still in the building" — stock has not left for good. */
export const UNRESOLVED_STATUSES: DispatchStatus[] = [
  "created",
  "assigned",
  "in_transit",
  "delivered_pending",
];

/** Statuses where the run is finished, one way or another. */
export const CLOSED_STATUSES: DispatchStatus[] = ["delivered", "failed", "cancelled"];

export type DispatchTransition = {
  to: DispatchStatus;
  label: string;
  /** Driver-facing label is short and imperative; owner-facing is formal. */
  shortLabel: string;
  /** This move is performed by taking a photo. */
  requiresPod?: boolean;
  /**
   * This move is only valid if evidence already exists. It is what makes the
   * office confirmation meaningful: you cannot close a delivery you have no
   * proof for.
   */
  requiresExistingPod?: boolean;
  danger?: boolean;
};

export type TransitionContext = {
  status: string;
  isMine: boolean;
  /** `dispatch.status.all` — owners, admins, dispatchers. */
  canUpdateAny: boolean;
  /** `dispatch.status.own` — drivers (and the roles above). */
  canUpdateOwn: boolean;
  /**
   * `dispatch.confirm` — office sign-off on the driver's evidence. Defaults to
   * `canUpdateAny` so existing callers keep working, but it is a separate
   * capability so it can be narrowed to the owner alone without touching the
   * rest of the flow.
   */
  canConfirm?: boolean;
};

export function transitionsFor({
  status,
  isMine,
  canUpdateAny,
  canUpdateOwn,
  canConfirm,
}: TransitionContext): DispatchTransition[] {
  const mayConfirm = canConfirm ?? canUpdateAny;

  // Driver path: own runs only, two moves, no cancelling, no failing, and
  // crucially no way to confirm their own delivery.
  if (!canUpdateAny) {
    if (!canUpdateOwn || !isMine) return [];

    if (status === "assigned") {
      return [
        {
          to: "in_transit",
          label: "Mark picked up",
          shortLabel: "Mark picked up",
        },
      ];
    }

    if (status === "in_transit") {
      return [
        {
          to: "delivered_pending",
          label: "Send delivery proof",
          shortLabel: "Send proof",
          requiresPod: true,
        },
      ];
    }

    // delivered_pending and beyond: the driver's part is done. The run stays on
    // their list, read-only, until the office confirms it.
    return [];
  }

  // Office path.
  switch (status) {
    case "created":
      return [
        { to: "cancelled", label: "Mark cancelled", shortLabel: "Cancel", danger: true },
      ];
    case "assigned":
      return [
        { to: "in_transit", label: "Mark picked up", shortLabel: "Picked up" },
        { to: "cancelled", label: "Mark cancelled", shortLabel: "Cancel", danger: true },
      ];
    case "in_transit":
      return [
        {
          to: "delivered_pending",
          label: "Record delivery proof",
          shortLabel: "Proof",
          requiresPod: true,
        },
        { to: "failed", label: "Mark failed", shortLabel: "Failed", danger: true },
      ];
    case "delivered_pending":
      return [
        ...(mayConfirm
          ? [
              {
                to: "delivered" as DispatchStatus,
                label: "Confirm delivery",
                shortLabel: "Confirm",
                requiresExistingPod: true,
              },
            ]
          : []),
        { to: "failed", label: "Mark failed", shortLabel: "Failed", danger: true },
      ];
    default:
      return [];
  }
}

/** Server-side gate. Returns null when the move is allowed. */
export function checkTransition(
  context: TransitionContext,
  next: string,
): string | null {
  const allowed = transitionsFor(context);
  const match = allowed.find((t) => t.to === next);
  if (match) return null;

  if (!context.canUpdateAny && !context.canUpdateOwn) {
    return "Your role cannot update dispatch status.";
  }
  if (!context.canUpdateAny && !context.isMine) {
    return "This dispatch is not assigned to you.";
  }
  if (next === "delivered" && context.status === "delivered_pending") {
    return "Only the office can confirm a delivery, and only after reviewing the proof.";
  }
  return `A dispatch that is "${context.status.replace(/_/g, " ")}" cannot be marked "${next.replace(/_/g, " ")}".`;
}

/** Whether this transition needs a photo to be taken as part of the move. */
export function transitionRequiresPod(
  context: TransitionContext,
  next: string,
): boolean {
  const match = transitionsFor(context).find((t) => t.to === next);
  return Boolean(match?.requiresPod);
}

/** Whether this transition is only valid when a photo already exists. */
export function transitionRequiresExistingPod(
  context: TransitionContext,
  next: string,
): boolean {
  const match = transitionsFor(context).find((t) => t.to === next);
  return Boolean(match?.requiresExistingPod);
}
