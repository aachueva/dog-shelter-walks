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

function normalizeDogName(name) {
  return String(name ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function dogPhotoUrl(name) {
  const key = normalizeDogName(name);
  const entry = Object.entries(DOG_PHOTOS).find(([dog]) => normalizeDogName(dog) === key);
  return entry?.[1] ? new URL(entry[1], import.meta.url).href : null;
}
