const DOG_COLORS = [
  "#2f6fed",
  "#c0392b",
  "#1f7a4d",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#be185d",
  "#4d7c0f",
  "#b45309",
  "#4338ca",
  "#0f766e",
  "#9f1239",
  "#365314",
  "#1d4ed8",
  "#a16207",
  "#6d28d9",
  "#047857",
  "#dc2626",
];

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "2-digit",
  }).format(new Date(year, month - 1, 1));
}

function getDogColor(index) {
  return DOG_COLORS[index % DOG_COLORS.length];
}

function countForDogMonth(stats, dog, month) {
  return stats.counts[dog]?.[month] ?? 0;
}

function maxMonthlyCount(stats) {
  let max = 0;
  for (const dog of stats.dogs) {
    for (const month of stats.months) {
      max = Math.max(max, countForDogMonth(stats, dog, month));
    }
  }
  return max || 1;
}

function renderMonthlyChart(container, legendContainer, stats, selectedDog) {
  container.innerHTML = "";
  legendContainer.innerHTML = "";

  if (!stats.months.length || !stats.dogs.length) {
    container.innerHTML = `<p class="chart-empty">No monthly walk data yet.</p>`;
    return;
  }

  const dogsToShow =
    selectedDog === "__all__" ? stats.dogs : stats.dogs.filter((dog) => dog === selectedDog);

  const width = Math.max(640, container.clientWidth || 640);
  const height = 320;
  const padding = { top: 24, right: 24, bottom: 48, left: 48 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  let maxY = 0;
  for (const dog of dogsToShow) {
    for (const month of stats.months) {
      maxY = Math.max(maxY, countForDogMonth(stats, dog, month));
    }
  }
  maxY = Math.max(maxY, 1);
  const yTickStep = maxY <= 5 ? 1 : maxY <= 10 ? 2 : Math.ceil(maxY / 5);
  const yTicks = [];
  for (let tick = 0; tick <= maxY; tick += yTickStep) {
    yTicks.push(tick);
  }
  if (yTicks[yTicks.length - 1] !== maxY) {
    yTicks.push(maxY);
  }

  const xStep = stats.months.length > 1 ? plotWidth / (stats.months.length - 1) : 0;
  const xAt = (index) => padding.left + (stats.months.length > 1 ? index * xStep : plotWidth / 2);
  const yAt = (value) => padding.top + plotHeight - (value / maxY) * plotHeight;

  const svgParts = [
    `<svg viewBox="0 0 ${width} ${height}" class="chart-svg" aria-hidden="true">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="transparent"></rect>`,
  ];

  for (const tick of yTicks) {
    const y = yAt(tick);
    svgParts.push(
      `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="chart-grid-line"></line>`,
      `<text x="${padding.left - 10}" y="${y + 4}" class="chart-axis-label" text-anchor="end">${tick}</text>`,
    );
  }

  stats.months.forEach((month, index) => {
    const x = xAt(index);
    svgParts.push(
      `<text x="${x}" y="${height - 16}" class="chart-axis-label" text-anchor="middle">${formatMonthLabel(month)}</text>`,
    );
  });

  dogsToShow.forEach((dog, dogIndex) => {
    const color = getDogColor(stats.dogs.indexOf(dog));
    const points = stats.months.map((month, index) => {
      const count = countForDogMonth(stats, dog, month);
      return `${xAt(index)},${yAt(count)}`;
    });

    svgParts.push(
      `<polyline points="${points.join(" ")}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></polyline>`,
    );

    stats.months.forEach((month, index) => {
      const count = countForDogMonth(stats, dog, month);
      if (count === 0) {
        return;
      }
      svgParts.push(
        `<circle cx="${xAt(index)}" cy="${yAt(count)}" r="4.5" fill="${color}" stroke="#fff" stroke-width="1.5">` +
          `<title>${dog}: ${count} walk${count === 1 ? "" : "s"} in ${formatMonthLabel(month)}</title>` +
          `</circle>`,
      );
    });

    const legendItem = document.createElement("button");
    legendItem.type = "button";
    legendItem.className = "legend-item";
    legendItem.innerHTML = `<span class="legend-swatch" style="background:${color}"></span>${dog}`;
    legendContainer.appendChild(legendItem);
  });

  svgParts.push("</svg>");
  container.innerHTML = svgParts.join("");
}

function heatColor(count, maxCount) {
  if (count === 0) {
    return "#eef1f6";
  }

  const ratio = count / maxCount;
  const lightness = 92 - ratio * 42;
  return `hsl(221 72% ${lightness}%)`;
}

function renderHeatmap(container, stats) {
  container.innerHTML = "";

  if (!stats.months.length || !stats.dogs.length) {
    container.innerHTML = `<p class="chart-empty">No walk data for heatmap.</p>`;
    return;
  }

  const maxCount = maxMonthlyCount(stats);
  const grid = document.createElement("div");
  grid.className = "heatmap-grid";
  grid.style.gridTemplateColumns = `minmax(120px, 1.2fr) repeat(${stats.months.length}, minmax(52px, 1fr))`;

  const corner = document.createElement("div");
  corner.className = "heatmap-corner";
  corner.textContent = "Dog";
  grid.appendChild(corner);

  for (const month of stats.months) {
    const header = document.createElement("div");
    header.className = "heatmap-month";
    header.textContent = formatMonthLabel(month);
    grid.appendChild(header);
  }

  for (const dog of stats.dogs) {
    const label = document.createElement("div");
    label.className = "heatmap-dog";
    label.textContent = dog;
    grid.appendChild(label);

    for (const month of stats.months) {
      const count = countForDogMonth(stats, dog, month);
      const cell = document.createElement("div");
      cell.className = "heatmap-cell";
      cell.style.background = heatColor(count, maxCount);
      cell.title = `${dog}: ${count} walk${count === 1 ? "" : "s"} in ${formatMonthLabel(month)}`;
      cell.innerHTML = `<span>${count || ""}</span>`;
      grid.appendChild(cell);
    }
  }

  container.appendChild(grid);
}

function populateDogSelect(select, stats, selectedValue) {
  select.innerHTML = `<option value="__all__">All dogs</option>`;
  for (const dog of stats.dogs) {
    const option = document.createElement("option");
    option.value = dog;
    option.textContent = dog;
    option.selected = dog === selectedValue;
    select.appendChild(option);
  }
  if (selectedValue === "__all__") {
    select.value = "__all__";
  }
}

export function renderCharts(stats, { chartContainer, legendContainer, heatmapContainer, dogSelect }) {
  populateDogSelect(dogSelect, stats, dogSelect.value || "__all__");
  renderMonthlyChart(chartContainer, legendContainer, stats, dogSelect.value || "__all__");
  renderHeatmap(heatmapContainer, stats);
}
