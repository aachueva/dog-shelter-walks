// Approved photo URLs can be added here by dog name.
// Only add photos NorSled has authorized for reuse in this public app.
// Names are matched without regard to capitalization or extra spaces.
export const DOG_PHOTOS = {
  "Aspen": "./dog-photos/aspen.png",
  "Delilah": "./dog-photos/delilah.png",
  "Duke": "./dog-photos/duke.png",
  "Klaus": "./dog-photos/klaus.png",
  "Max": "./dog-photos/max.png",
  "Pixie": "./dog-photos/pixie.png",
  "Prissy": "./dog-photos/prissy.png",
  "Ricky": "./dog-photos/ricky.png",
  "Snow Cone": "./dog-photos/snowcone.png",
  "Tonto": "./dog-photos/tonto.png",
};

export function dogPhotoUrl(name) {
  const key = String(name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const match = Object.entries(DOG_PHOTOS).find(([dog]) => dog.trim().replace(/\\s+/g, " ").toLowerCase() === key);
  const url = match?.[1];
  if (!url) return null;
  try { const parsed = new URL(url, import.meta.url); return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : null; }
  catch { return null; }
}
