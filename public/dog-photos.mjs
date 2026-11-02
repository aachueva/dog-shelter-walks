// Approved photo URLs can be added here by dog name.
// Only add photos NorSled has authorized for reuse in this public app.
// Names are matched without regard to capitalization or extra spaces.
export const DOG_PHOTOS = {
  // "Frankie Avalon": "https://example.org/approved-frankie-photo.jpg",
};

export function dogPhotoUrl(name) {
  const key = String(name ?? "").trim().replace(/\\s+/g, " ").toLowerCase();
  const match = Object.entries(DOG_PHOTOS).find(([dog]) => dog.trim().replace(/\\s+/g, " ").toLowerCase() === key);
  const url = match?.[1];
  if (!url) return null;
  try { const parsed = new URL(url); return parsed.protocol === "https:" ? parsed.href : null; }
  catch { return null; }
}
