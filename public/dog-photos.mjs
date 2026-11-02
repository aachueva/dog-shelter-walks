// Approved photo URLs can be added here by dog name.
// Only add photos NorSled has authorized for reuse in this public app.
// Names are matched without regard to capitalization or extra spaces.
export const DOG_PHOTOS = {
  "Aspen": "https://raw.githubusercontent.com/aachueva/dog-shelter-walks/main/aspen.png",
  "Delilah": "https://raw.githubusercontent.com/aachueva/dog-shelter-walks/main/delilah.png",
  "Duke": "https://raw.githubusercontent.com/aachueva/dog-shelter-walks/main/duke.png",
  "Klaus": "https://raw.githubusercontent.com/aachueva/dog-shelter-walks/main/klaus.png",
  "Max": "https://raw.githubusercontent.com/aachueva/dog-shelter-walks/main/max.png",
  "Pixie": "https://raw.githubusercontent.com/aachueva/dog-shelter-walks/main/pixie.png",
  "Prissy": "https://raw.githubusercontent.com/aachueva/dog-shelter-walks/main/prissy.png",
  "Ricky": "https://raw.githubusercontent.com/aachueva/dog-shelter-walks/main/ricky.png",
  "Snow Cone": "https://raw.githubusercontent.com/aachueva/dog-shelter-walks/main/snowcone.png",
  "Tonto": "https://raw.githubusercontent.com/aachueva/dog-shelter-walks/main/tonto.png",
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
  return entry?.[1] || null;
}
