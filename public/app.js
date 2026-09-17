const $ = (id) => document.getElementById(id);
const refreshBtn = $("refresh-btn");
const statusBanner = $("status-banner");

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});
const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});
const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short" });

function parseDate(isoDate) {
  return new Date(`${isoDate}T12:00:00`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(message = "", type = "error") {
  statusBanner.textContent = message;
  statusBanner.className = message ? `status ${type}` : "status hidden";
}

function describeLastWalk(dog) {
  if (dog.walkedToday) return dog.walksToday > 1 ? `${dog.walksToday} walks today` : "Walked today";
  if (dog.daysSinceWalk == null) return "No walks recorded";
  if (dog.daysSinceWalk === 1) return "Last walked yesterday";
  return `Last walked ${dog.daysSinceWalk} days ago`;
}

function renderPriorityCard(dog, rank) {
  const article = document.createElement("article");
  article.className = "priority-card";
  article.innerHTML = `
    <div class="priority-rank" aria-label="Priority ${rank}">${rank}</div>
    <div>
      <h3>${escapeHtml(dog.dog)}</h3>
      <p class="priority-reason">${escapeHtml(describeLastWalk(dog))}</p>
      <p class="recent-count">${dog.walksLast14Days} walk${dog.walksLast14Days === 1 ? "" : "s"} in 14 days</p>
    </div>
  `;
  return article;
}

function renderDogRow(dog) {
  const article = document.createElement("article");
  article.className = `dog-row ${dog.walkedToday ? "walked" : ""}`;
  article.innerHTML = `
    <div class="dog-state" aria-hidden="true">${dog.walkedToday ? "✓" : ""}</div>
    <div class="dog-main">
      <h3>${escapeHtml(dog.dog)}</h3>
      <p>${escapeHtml(describeLastWalk(dog))}</p>
    </div>
    <div class="dog-total">
      <strong>${dog.walksLast14Days}</strong>
      <span>14 days</span>
    </div>
  `;
  return article;
}

function heatClass(count) {
  if (count <= 0) return "heat-0";
  if (count === 1) return "heat-1";
  if (count === 2) return "heat-2";
  return "heat-3";
}

function renderHeatmap(data) {
  const container = $("walk-heatmap");
  container.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "heatmap-grid";
  grid.style.gridTemplateColumns = `minmax(104px, 1fr) repeat(${data.dates.length}, 34px)`;

  const corner = document.createElement("div");
  corner.className = "heat-corner";
  corner.textContent = "Dog";
  grid.appendChild(corner);

  data.dates.forEach((isoDate) => {
    const date = parseDate(isoDate);
    const header = document.createElement("div");
    header.className = `heat-date ${isoDate === data.today ? "today" : ""}`;
    header.innerHTML = `<span>${weekdayFormatter.format(date).slice(0, 1)}</span><strong>${date.getDate()}</strong>`;
    header.title = shortDateFormatter.format(date);
    grid.appendChild(header);
  });

  data.dogs.forEach((dog) => {
    const label = document.createElement("div");
    label.className = `heat-dog ${dog.priority ? "priority" : ""}`;
    label.textContent = dog.dog;
    grid.appendChild(label);
    data.dates.forEach((isoDate) => {
      const count = dog.dailyCounts[isoDate] || 0;
      const cell = document.createElement("div");
      cell.className = `heat-cell ${heatClass(count)} ${isoDate === data.today ? "today" : ""}`;
      cell.textContent = count || "";
      cell.title = `${dog.dog}: ${count} walk${count === 1 ? "" : "s"} on ${shortDateFormatter.format(parseDate(isoDate))}`;
      grid.appendChild(cell);
    });
  });
  container.appendChild(grid);
}

function render(data) {
  $("today-label").textContent = dateFormatter.format(parseDate(data.today));
  $("walks-today").textContent = data.summary.walksToday;
  $("walked-today").textContent = `${data.summary.walkedToday}/${data.summary.totalDogs}`;
  $("need-walk").textContent = data.summary.needWalkToday;
  $("priority-count").textContent = `${data.priorityDogs.length} dogs`;
  $("roster-count").textContent = `${data.otherDogs.length} dogs`;

  const priorityGrid = $("priority-grid");
  priorityGrid.className = "priority-grid";
  priorityGrid.innerHTML = "";
  if (!data.priorityDogs.length) {
    priorityGrid.innerHTML = '<p class="all-walked">Every current dog has already walked today.</p>';
  } else {
    data.priorityDogs.forEach((dog, index) => priorityGrid.appendChild(renderPriorityCard(dog, index + 1)));
  }

  const otherList = $("other-list");
  otherList.innerHTML = "";
  data.otherDogs.forEach((dog) => otherList.appendChild(renderDogRow(dog)));
  renderHeatmap(data);

  $("last-updated").textContent = `Updated ${new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(data.updatedAt))}`;

  if (!data.currentDogsConfigured) {
    setStatus("Connect the Current Dogs tab so newly arrived dogs with no walk history appear.", "info");
  } else if (data.source === "sample_data") {
    setStatus("Showing sample data. Connect the Google Sheet in Render to go live.", "info");
  } else {
    setStatus();
  }
}

async function loadDashboard() {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Loading…";
  try {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load walk data.");
    render(data);
  } catch (error) {
    setStatus(error.message || "Could not load walk data. Please try again.");
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Refresh";
  }
}

refreshBtn.addEventListener("click", loadDashboard);
loadDashboard();
