// Differential loop: the OLD inline rule (replicated verbatim from
// inventory-client.tsx:128 and dashboard/page.tsx:76) vs the NEW shared rule.
import { getStockStatus } from "../src/lib/stock-status.ts";

function oldLabel(onHand: number, reorder: number) {
  const oldIsLow = reorder > 0 && onHand < reorder;
  return oldIsLow ? "Low stock" : "OK";
}

const cases: Array<[number, number]> = [
  [0, 10],
  [0, 0],
  [4, 10],
  [9, 10],
  [10, 10],
  [120, 10],
  [5, 0],
];

console.log("qty reorder | OLD (buggy)  -> NEW (correct)");
let mismatches = 0;
for (const [q, r] of cases) {
  const oldL = oldLabel(q, r);
  const newL = getStockStatus(q, r).label;
  const flag = oldL === newL ? "   " : " * ";
  if (oldL !== newL) mismatches += 1;
  console.log(`${flag}${String(q).padStart(3)} ${String(r).padStart(7)} | ${oldL.padEnd(13)} -> ${newL}`);
}
console.log(`\n${mismatches} of ${cases.length} cases changed behaviour.`);
