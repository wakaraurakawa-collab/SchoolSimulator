import { isWalkable, canClimb } from "./mapData.js";

// BFS over (floor, x) nodes. Horizontal moves along a floor; vertical moves
// only at stairwell columns. Returns a list of nodes excluding the start,
// or null if unreachable.
export function findPath(from, to) {
  if (from.f === to.f && from.x === to.x) return [];
  const key = (f, x) => f * 1000 + x;
  const prev = new Map([[key(from.f, from.x), null]]);
  const queue = [{ f: from.f, x: from.x }];

  while (queue.length) {
    const c = queue.shift();
    const nexts = [{ f: c.f, x: c.x - 1 }, { f: c.f, x: c.x + 1 }];
    if (canClimb(c.f, c.x, +1)) nexts.push({ f: c.f + 1, x: c.x });
    if (canClimb(c.f, c.x, -1)) nexts.push({ f: c.f - 1, x: c.x });
    for (const n of nexts) {
      const k = key(n.f, n.x);
      if (!isWalkable(n.f, n.x) || prev.has(k)) continue;
      prev.set(k, c);
      if (n.f === to.f && n.x === to.x) {
        const path = [n];
        let p = c;
        while (p && !(p.f === from.f && p.x === from.x)) {
          path.push(p);
          p = prev.get(key(p.f, p.x));
        }
        return path.reverse();
      }
      queue.push(n);
    }
  }
  return null;
}
