export const RESOURCE_TYPES = {
  food: { color: 0xe0a020, label: "食" },
  medicine: { color: 0xe05070, label: "薬" },
  tool: { color: 0x60a0e0, label: "工" },
  material: { color: 0x80c060, label: "材" },
};

let nextId = 1;

export function spawnResource(scene, x, y) {
  const types = Object.keys(RESOURCE_TYPES);
  const type = types[Math.floor(Math.random() * types.length)];
  const def = RESOURCE_TYPES[type];
  const sprite = scene.add.rectangle(0, 0, 10, 10, def.color).setStrokeStyle(1, 0x000000);
  const id = nextId++;
  return { id, type, x, y, claimedBy: null, sprite };
}
