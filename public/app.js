import { renderCharts } from "./charts.js";

const weekSelect = document.getElementById("week-select");
const refreshBtn = document.getElementById("refresh-btn");
const statusBanner = document.getElementById("status-banner");
const totalDogsEl = document.getElementById("total-dogs");
const totalWalksEl = document.getElementById("total-walks");
const dogsWalkedEl = document.getElementById("dogs-walked");
const underwalkedCountEl = document.getElementById("underwalked-count");
const weekRangeEl = document.getElementById("week-range");
const dogGridEl = document.getElementById("dog-grid");
const walkTableBodyEl = document.getElementById("walk-table-body");
const monthlyChartEl = document.getElementById("monthly-chart");
const chartLegendEl = document.getElementById("chart-legend");
const walkHeatmapEl = document.getElementById("walk-heatmap");
const chartDogSelect = document.getElementById("chart-dog-select");

let latestMonthlyStats = null;

function formatWeekLabel(isoDate) {
  const start = new Date(`${isoDate}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  });

  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function formatDisplayDate(isoDate) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${isoDate}T00:00:00`));
}

function showStatus(message, type = "error") {
  statusBanner.textContent = message;
  statusBanner.classList.remove("hidden", "info");
  if (type === "info") {
    statusBanner.classList.add("info");
  }
}

function hideStatus() {
  statusBanner.classList.add("hidden");
}

function renderWeekOptions(weeks, selectedWeek) {
  weekSelect.innerHTML = "";

  for (const week of weeks) {
    const option = document.createElement("option");
    option.value = week;
    option.textContent = formatWeekLabel(week);
    option.selected = week === selectedWeek;
    weekSelect.appendChild(option);
  }
}

function renderSummary(data) {
  totalDogsEl.textContent = data.summary.totalDogs;
  totalWalksEl.textContent = data.summary.totalWalks;
  dogsWalkedEl.textContent = data.summary.dogsWalked;
  underwalkedCountEl.textContent = data.summary.underwalkedCount;
  weekRangeEl.textContent = `${formatDisplayDate(data.weekStart)} to ${formatDisplayDate(data.weekEnd)}`;
}

function renderDogGrid(dogs) {
  dogGridEl.innerHTML = "";

  if (dogs.length === 0) {
    dogGridEl.innerHTML = `<p class="dog-status">No dogs found for this week.</p>`;
    return;
  }

  for (const dog of dogs) {
    const card = document.createElement("article");
    card.className = `dog-card ${dog.underwalked ? "underwalked" : "ok"}`;

    const statusText = dog.underwalked
      ? "Needs a walk this week"
      : `${dog.walkCount} walk${dog.walkCount === 1 ? "" : "s"} completed`;

    card.innerHTML = `
      <p class="dog-name">${dog.dog}</p>
      <p class="dog-count">${dog.walkCount}</p>
      <p class="dog-status">${statusText}</p>
    `;

    dogGridEl.appendChild(card);
  }
}

function renderWalkTable(dogs) {
  walkTableBodyEl.innerHTML = "";

  for (const dog of dogs) {
    const row = document.createElement("tr");

    const walksHtml =
      dog.walks.length === 0
        ? "No walks logged"
        : `<ul class="walk-list">${dog.walks
            .map((walk) => {
              const timeBits = [walk.checkoutTime, walk.checkinTime].filter(Boolean).join(" → ");
              const walker = walk.walker ? ` · ${walk.walker}` : "";
              const timeSuffix = timeBits ? ` · ${timeBits}` : "";
              return `<li>${formatDisplayDate(walk.date)}${walker}${timeSuffix}</li>`;
            })
            .join("")}</ul>`;

    row.innerHTML = `
      <td>${dog.dog}</td>
      <td>${dog.walkCount}</td>
      <td>
        <span class="badge ${dog.underwalked ? "badge-danger" : "badge-success"}">
          ${dog.underwalked ? "Underwalked" : "On track"}
        </span>
      </td>
      <td>${walksHtml}</td>
    `;

    walkTableBodyEl.appendChild(row);
  }
}

function renderMonthlyVisuals() {
  if (!latestMonthlyStats) {
    return;
  }

  renderCharts(latestMonthlyStats, {
    chartContainer: monthlyChartEl,
    legendContainer: chartLegendEl,
    heatmapContainer: walkHeatmapEl,
    dogSelect: chartDogSelect,
  });
}

async function loadDashboard(week) {
  hideStatus();

  const query = week ? `?week=${encodeURIComponent(week)}` : "";
  const response = await fetch(`/api/walks${query}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to load walk data");
  }

  latestMonthlyStats = data.monthlyStats;
  renderWeekOptions(data.availableWeeks, data.weekStart);
  renderSummary(data);
  renderMonthlyVisuals();
  renderDogGrid(data.dogs);
  renderWalkTable(data.dogs);

  if (data.source === "sample_data") {
    showStatus(
      "Showing demo data from sample-data.csv. Add your Google Sheet URL to .env to go live.",
      "info",
    );
  }
}

async function refreshDashboard() {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Loading…";

  try {
    await loadDashboard(weekSelect.value || undefined);
  } catch (error) {
    showStatus(error.message || "Something went wrong while loading the dashboard.");
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Refresh";
  }
}

weekSelect.addEventListener("change", refreshDashboard);
refreshBtn.addEventListener("click", refreshDashboard);
chartDogSelect.addEventListener("change", renderMonthlyVisuals);
window.addEventListener("resize", renderMonthlyVisuals);

refreshDashboard();
