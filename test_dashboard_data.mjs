import assert from "node:assert/strict";
import test from "node:test";

import { buildDashboard, parseCurrentDogs, parseGoogleDate, parseWalks } from "./public/dashboard-data.mjs";

test("parses Google Visualization dates", () => {
  assert.equal(parseGoogleDate("Date(2026,8,20)"), "2026-09-20");
});

test("builds the dashboard from current dogs and wide walk history", () => {
  const dogsTable = { rows: [
    { c: [{ v: " Blue " }] },
    { c: [{ v: "Pixie" }] },
    { c: [{ v: "PIXIE" }] },
    { c: [{ v: "Puck" }] },
    { c: [{ v: "Duke" }] },
  ] };
  const walksTable = { rows: [
    { c: [{ v: "Blue" }, { v: "Date(2026,8,20)" }] },
    { c: [{ v: "Duke" }, { v: "Date(2026,8,19)" }] },
    { c: [{ v: "Former Dog" }, { v: "Date(2026,8,20)" }] },
  ] };
  const dashboard = buildDashboard(parseWalks(walksTable), parseCurrentDogs(dogsTable), "2026-09-20");
  assert.equal(dashboard.summary.totalDogs, 4);
  assert.equal(dashboard.summary.walkedToday, 1);
  assert.deepEqual(dashboard.priorityDogs.map((dog) => dog.dog), ["Pixie", "Puck", "Duke"]);
  assert.equal(dashboard.dogs.some((dog) => dog.dog === "Former Dog"), false);
});
