import { isFloorWalkable } from "./mapData.js";

// Simple BFS grid pathfinding within a single floor.
export function findPath(floorKey, start, goal, maxW = 24, maxH = 14) {
  if (start.x === goal.x && start.y === goal.y) return [];
  const key = (x, y) => `${x},${y}`;
  const visited = new Set([key(start.x, start.y)]);
  const queue = [{ x: start.x, y: start.y, path: [] }];
  const dirs = [
    { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
  ];

  while (queue.length) {
    const cur = queue.shift();
    for (const { dx, dy } of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= maxW || ny >= maxH) continue;
      const k = key(nx, ny);
      if (visited.has(k)) continue;
      if (!isFloorWalkable(floorKey, nx, ny)) continue;
      const nextPath = [...cur.path, { x: nx, y: ny }];
      if (nx === goal.x && ny === goal.y) return nextPath;
      visited.add(k);
      queue.push({ x: nx, y: ny, path: nextPath });
    }
  }
  return null; // unreachable
}
