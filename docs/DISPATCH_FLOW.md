# Dispatch flow and role access

The state machine lives in `src/lib/dispatch-flow.ts` and is used by **both** the
UI (which buttons to render) and the server action (whether to accept the move).
There is no second copy of these rules anywhere.

## The states

```
created ──assign──> assigned ──pick up──> in_transit
   │                   │                      │
   └──cancel───────────┴──cancel──────────────┤
                                              ├──proof──> delivered_pending ──confirm──> delivered
                                              └──fail──────────────────────────────────────> failed
```

| State | Meaning | Badge |
|---|---|---|
| `created` | Order exists, no driver yet | Created |
| `assigned` | Driver attached, goods still in the warehouse | Assigned |
| `in_transit` | Driver has picked the goods up | In transit |
| `delivered_pending` | Driver has sent photo proof; waiting for office sign-off | Awaiting confirmation |
| `delivered` | Office reviewed the proof and closed the run | Delivered |
| `failed` | Attempted, not delivered | Failed |
| `cancelled` | Called off before pickup | Cancelled |

## Who can do what

| | Driver | Dispatcher | Admin | Owner |
|---|---|---|---|---|
| Create a dispatch | ✗ | ✓ | ✓ | ✓ |
| **Assign a driver** | ✗ | ✗ | ✗ | **✓ owner only** |
| `assigned` → `in_transit` | ✓ own runs only — **"Mark picked up"** | ✓ | ✓ | ✓ |
| `in_transit` → `delivered_pending` | ✓ own runs only — **"Send delivery proof"** (photo required) | ✓ (photo required) | ✓ | ✓ |
| `delivered_pending` → `delivered` | ✗ **never** | ✓ **"Confirm delivery"** | ✓ | ✓ |
| Cancel | ✗ | ✓ | ✓ | ✓ |
| Mark failed | ✗ | ✓ | ✓ | ✓ |
| Delete a `created` dispatch | ✗ | ✗ | ✓ | ✓ |

A driver sees **two buttons, ever**: "Mark picked up" on an assigned run, and
"Send delivery proof" on a run already picked up. Nothing else renders — and
nothing they can do closes a delivery.

### Delivery is two-stage, and both halves are enforced

The driver supplies evidence. The office signs off on it. Neither half can be
skipped:

- `updateDispatchStatus` rejects `newStatus === "delivered_pending"` outright.
  The only way into that state is `confirmPodUpload`, which runs *after* a photo
  has been verified to exist in storage. A driver cannot reach it by tapping a
  status.
- `updateDispatchStatus` refuses `delivered_pending → delivered` unless a
  `dispatch_pods` row exists for the dispatch. No evidence, no confirmation.
- The confirmation dialog shows the photo full-size, with capture time and GPS,
  so the office confirms *from* the evidence rather than from a status control.
- A driver is never offered `delivered` by the state machine, and
  `checkTransition` returns an explicit "only the office can confirm" error if
  one is attempted directly.

If the last photo on a pending run is deleted, the run drops back to
`in_transit`. `delivered_pending` means "evidence is waiting for review", so it
cannot survive the evidence disappearing.

### Assignment is owner-only

`assigned` is not a status anyone selects — it is the side effect of the owner
attaching a driver. Two things enforce that:

- `can(role, "dispatch.assign")` resolves to `["owner"]`, and the same helper
  drives both the server action and the rendered UI, so they cannot diverge.
- `updateDispatchStatus` rejects `newStatus === "assigned"` outright, before the
  state machine runs. Even a crafted request cannot move a run into `assigned`
  without going through `assignDispatch`.

The practical consequence: an `admin` account can run operations, but cannot put
a driver on a run. If a second person needs to assign, promote them to `owner`.

## The driver's day

1. **The owner** assigns the run → status becomes `assigned`.
2. Driver signs in. `/dashboard` redirects them straight to `/dispatch`, and the
   nav shows a single item.
3. Driver sees only runs where `assigned_to` is them — filtered server-side, not
   just in the browser.
4. Driver taps **Mark picked up** → `in_transit`. The run stays on their list.
5. At the door, driver taps **Send delivery proof** → camera opens → photo
   uploads → status becomes `delivered_pending`. The run stays on their list,
   read-only, badged **Awaiting confirmation**.
6. The office opens the run, sees the photo, and taps **Confirm delivery** →
   `delivered`. The driver's row flips to Delivered on their next load.

Step 5 cannot be collapsed into one tap:

- `beginPodCapture` refuses to start a photo for a driver while the run is still
  `assigned`, so pickup and delivery cannot be merged.
- The photo goes to a private bucket, and the run only advances once the object
  is confirmed to exist.
- The run advances to `delivered_pending`, never to `delivered`.

## What a driver cannot reach

| Surface | How it is blocked |
|---|---|
| `/dashboard` | redirect to `/dispatch` |
| `/inventory` | `inventory.view` check → redirect |
| `/stocktaking` | role allow-list → redirect |
| `/reports` | role allow-list → redirect |
| `/staff` | role allow-list → redirect |
| `/billing` | owner/admin only → redirect |
| Nav links | `roles` on each item |
| Roster, product catalog, vehicles, stock levels | not serialised to the driver's page at all |
| Audit log | RLS: office roles only (migration 010) |
| Other drivers' delivery photos | RLS: own dispatch only (migration 010) |
| Other people's profiles | RLS: own row only for drivers (migration 010) |

## Known gap

`dispatches` and `dispatch_items` are still readable by any member of the
organization at the database level. The app filters them server-side, so a driver
never receives another driver's runs, but a driver using dev tools with their own
session could query those two tables directly.

Closing that needs the existing `for all` policies split into per-command
policies plus a driver-specific `UPDATE` policy — and because RLS is row-level,
that update policy would also let a driver modify other columns on their own
dispatch row. Worth doing, but it should be tested against the real assignment
flow rather than shipped blind.
