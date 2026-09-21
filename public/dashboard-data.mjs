const SHEET_ID = "1jNjmPRSR7_QBQnX3O24o7ckEBKpl_jdLepSK4X5Z0Hk";
const SHELTER_TIMEZONE = "America/Los_Angeles";
const HISTORY_DAYS = 14;
const PRIORITY_COUNT = 3;

function normalizeDogName(value) {
  return String(value || "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function displayDogName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function isoDate(date) {
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("-");
}

function addDays(iso, amount) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return isoDate(date);
}

function daysBetween(earlier, later) {
  return Math.round((Date.parse(`${later}T12:00:00Z`) - Date.parse(`${earlier}T12:00:00Z`)) / 86400000);
}

export function shelterToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHELTER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function parseGoogleDate(value) {
  const match = String(value || "").match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})\)$/);
  if (!match) return null;
  return `${match[1]}-${String(Number(match[2]) + 1).padStart(2, "0")}-${String(Number(match[3])).padStart(2, "0")}`;
}

export function tableRows(table) {
  return (table?.rows || []).map((row) => (row.c || []).map((cell) => cell?.v ?? ""));
}

export function parseCurrentDogs(table) {
  const seen = new Set();
  return tableRows(table).flatMap((row) => {
    const dog = displayDogName(row[0]);
    const key = normalizeDogName(dog);
    if (!key || ["dog", "dog name", "name", "canine"].includes(key) || seen.has(key)) return [];
    seen.add(key);
    return [dog];
  });
}

export function parseWalks(table) {
  const walks = [];
  for (const row of tableRows(table)) {
    const dog = displayDogName(row[0]);
    if (!dog) continue;
    for (const value of row.slice(1)) {
      const date = parseGoogleDate(value);
      if (date) walks.push({ dog, date });
    }
  }
  return walks;
}

function prioritySort(a, b) {
  return Number(a.walkedToday) - Number(b.walkedToday)
    || a.walksLast14Days - b.walksLast14Days
    || String(a.lastWalkDate || "0000-00-00").localeCompare(String(b.lastWalkDate || "0000-00-00"))
    || a.dog.localeCompare(b.dog, undefined, { sensitivity: "base" });
}

export function buildDashboard(walks, currentDogs, today = shelterToday()) {
  const start = addDays(today, -(HISTORY_DAYS - 1));
  const dates = Array.from({ length: HISTORY_DAYS }, (_, index) => addDays(start, index));
  const displayByKey = new Map(currentDogs.map((dog) => [normalizeDogName(dog), displayDogName(dog)]));
  const walksByKey = new Map();

  for (const walk of walks) {
    const key = normalizeDogName(walk.dog);
    if (!displayByKey.has(key) || walk.date > today) continue;
    if (!walksByKey.has(key)) walksByKey.set(key, []);
    walksByKey.get(key).push(walk.date);
  }

  const dogs = [...displayByKey].map(([key, dog]) => {
    const dogWalks = (walksByKey.get(key) || []).sort();
    const dailyCounts = Object.fromEntries(dates.map((date) => [date, 0]));
    for (const date of dogWalks) {
      if (date >= start && date <= today) dailyCounts[date] += 1;
    }
    const lastWalkDate = dogWalks.at(-1) || null;
    return {
      dog,
      walkedToday: dailyCounts[today] > 0,
      walksToday: dailyCounts[today],
      walksLast14Days: Object.values(dailyCounts).reduce((sum, count) => sum + count, 0),
      lastWalkDate,
      daysSinceWalk: lastWalkDate ? daysBetween(lastWalkDate, today) : null,
      dailyCounts,
    };
  });

  const ranked = dogs.sort(prioritySort);
  const eligible = ranked.filter((dog) => !dog.walkedToday);
  const initialPriority = eligible.slice(0, PRIORITY_COUNT);
  const cutoff = initialPriority.at(-1)?.walksLast14Days;
  const priorityKeys = new Set(cutoff == null ? [] : eligible.filter((dog) => dog.walksLast14Days <= cutoff).map((dog) => normalizeDogName(dog.dog)));
  for (const dog of ranked) dog.priority = priorityKeys.has(normalizeDogName(dog.dog));

  const priorityDogs = ranked.filter((dog) => dog.priority);
  const otherDogs = ranked.filter((dog) => !dog.priority);
  return {
    today,
    historyStart: start,
    historyEnd: today,
    dates,
    summary: {
      totalDogs: ranked.length,
      walkedToday: ranked.filter((dog) => dog.walkedToday).length,
      walksToday: ranked.reduce((sum, dog) => sum + dog.walksToday, 0),
      needWalkToday: ranked.filter((dog) => !dog.walkedToday).length,
    },
    priorityDogs,
    otherDogs,
    dogs: [...priorityDogs, ...otherDogs],
    updatedAt: new Date().toISOString(),
    source: "google_sheet",
    currentDogsConfigured: true,
  };
}

function loadGvizTable(sheetName) {
  return new Promise((resolve, reject) => {
    const callbackName = `dogWalkSheet_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => finish(new Error(`Timed out loading ${sheetName}.`)), 15000);

    function finish(error, table) {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
      if (error) reject(error);
      else resolve(table);
    }

    window[callbackName] = (response) => {
      if (response?.status !== "ok" || !response.table) {
        finish(new Error(`Google Sheets could not load ${sheetName}.`));
        return;
      }
      finish(null, response.table);
    };
    script.onerror = () => finish(new Error(`Could not connect to Google Sheets for ${sheetName}.`));
    const params = new URLSearchParams({
      tqx: `responseHandler:${callbackName};out:json`,
      sheet: sheetName,
      _: Date.now().toString(),
    });
    script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?${params}`;
    document.head.appendChild(script);
  });
}

export async function loadLiveDashboard() {
  const [dogsTable, walksTable] = await Promise.all([
    loadGvizTable("Current Dogs"),
    loadGvizTable("Walks"),
  ]);
  return buildDashboard(parseWalks(walksTable), parseCurrentDogs(dogsTable));
}
