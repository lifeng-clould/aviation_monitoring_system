(() => {
  let trajectoryMap;
  let trajectoryLayer;

  const datasetSelect = document.getElementById("dataset-select");
  const datasetKeyword = document.getElementById("dataset-keyword");
  const datasetRefreshBtn = document.getElementById("dataset-refresh-btn");
  const datasetTable = document.getElementById("dataset-table");
  const refreshSummaryBtn = document.getElementById("refresh-summary-btn");
  const trajectoryTypeSelect = document.getElementById("trajectory-type");
  const trajectoryIdentifierSelect = document.getElementById("trajectory-identifier");
  const complianceForm = document.getElementById("compliance-form");
  const speedInput = document.getElementById("speed-input");
  const distanceInput = document.getElementById("distance-input");
  const brakeInput = document.getElementById("brake-input");
  const complianceResult = document.getElementById("compliance-result");
  const timelineRefreshBtn = document.getElementById("timeline-refresh-btn");

  function formatNumber(value) {
    return value.toLocaleString("zh-CN");
  }

  function renderMatchingChart(successRates) {
    if (!successRates) return;
    const categories = [
      "航班-任务匹配",
      "航班-ADS-B匹配",
      "任务-车辆匹配",
    ];
    const values = [
      successRates.flight_task || 0,
      successRates.flight_adsb || 0,
      successRates.task_vehicle || 0,
    ];
    Plotly.newPlot(
      "matching-chart",
      [
        {
          type: "bar",
          x: categories,
          y: values,
          marker: { color: ["#0f4c81", "#1f78ff", "#46c0ff"] },
          text: values.map((v) => `${v.toFixed(1)}%`),
          textposition: "auto",
        },
      ],
      {
        margin: { t: 20, r: 20, l: 40, b: 60 },
        yaxis: { range: [0, 100], ticksuffix: "%" },
        height: 300,
      },
      { displayModeBar: false }
    );
  }

  function renderDatasetChart(datasetCounts) {
    if (!datasetCounts) return;
    const labels = Object.keys(datasetCounts);
    const values = Object.values(datasetCounts);
    Plotly.newPlot(
      "dataset-chart",
      [
        {
          type: "pie",
          labels,
          values,
          marker: { colors: ["#0f4c81", "#1f78ff", "#46c0ff", "#8dd3c7"] },
          textinfo: "label+percent",
        },
      ],
      {
        margin: { t: 20, b: 20, l: 20, r: 20 },
        height: 300,
      },
      { displayModeBar: false }
    );
  }

  function populateDatasetOptions() {
    const datasets = summaryData?.datasets?.available || [];
    datasetSelect.innerHTML = "";
    datasets.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      datasetSelect.appendChild(option);
    });
  }

  async function loadDataset() {
    const dataset = datasetSelect.value;
    if (!dataset) return;
    datasetRefreshBtn.disabled = true;
    datasetRefreshBtn.textContent = "加载中…";
    const params = new URLSearchParams({ limit: "50" });
    const keyword = datasetKeyword.value.trim();
    if (keyword) {
      params.append("keyword", keyword);
    }
    try {
      const response = await fetch(
        `${DATASET_ENDPOINT}/${dataset}?${params.toString()}`
      );
      const data = await response.json();
      renderDatasetTable(data.items || []);
    } catch (error) {
      console.error(error);
      renderDatasetTable([]);
    } finally {
      datasetRefreshBtn.disabled = false;
      datasetRefreshBtn.textContent = "加载";
    }
  }

  function renderDatasetTable(items) {
    const thead = datasetTable.querySelector("thead");
    const tbody = datasetTable.querySelector("tbody");
    if (!items || items.length === 0) {
      thead.innerHTML = "";
      tbody.innerHTML =
        '<tr><td colspan="8" class="text-center text-muted py-4">暂无可展示的数据</td></tr>';
      return;
    }
    const columns = Object.keys(items[0]).slice(0, 8);
    thead.innerHTML = `<tr>${columns
      .map((col) => `<th>${col}</th>`)
      .join("")}</tr>`;
    tbody.innerHTML = items
      .map(
        (row) =>
          `<tr>${columns
            .map((col) => `<td>${row[col] ?? ""}</td>`)
            .join("")}</tr>`
      )
      .join("");
  }

  async function refreshSummary() {
    try {
      const response = await fetch(SUMMARY_ENDPOINT);
      summaryData = await response.json();
      renderMatchingChart(summaryData.success_rates);
      renderDatasetChart(summaryData.datasets?.counts);
      populateDatasetOptions();
      populateTrajectoryOptions();
    } catch (error) {
      console.error("Failed to refresh summary", error);
    }
  }

  function populateTrajectoryOptions() {
    const type = trajectoryTypeSelect.value;
    const options =
      type === "flight"
        ? summaryData?.options?.fuuid || []
        : summaryData?.options?.vehicles || [];
    trajectoryIdentifierSelect.innerHTML = "";
    options.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      trajectoryIdentifierSelect.appendChild(option);
    });
    if (options.length) {
      trajectoryIdentifierSelect.value = options[0];
      drawTrajectory();
    } else {
      resetTrajectoryMap();
    }
  }

  function initTrajectoryMap() {
    trajectoryMap = L.map("trajectory-map").setView([31.145, 121.805], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(trajectoryMap);
  }

  function resetTrajectoryMap() {
    if (!trajectoryMap) return;
    if (trajectoryLayer) {
      trajectoryMap.removeLayer(trajectoryLayer);
      trajectoryLayer = null;
    }
  }

  async function drawTrajectory() {
    if (!trajectoryMap) return;
    const identifier = trajectoryIdentifierSelect.value;
    if (!identifier) return;
    const type = trajectoryTypeSelect.value;
    const endpoint =
      type === "flight"
        ? `${TRAJECTORY_FLIGHT_ENDPOINT}/${identifier}`
        : `${TRAJECTORY_VEHICLE_ENDPOINT}/${identifier}`;
    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error("trajectory fetch error");
      const data = await response.json();
      const points = data.points || [];
      if (!points.length) return;
      const latLngs =
        type === "flight"
          ? points.map((p) => [p.LA || p.lat || 0, p.LO || p.lon || 0])
          : points.map((p) => [p.LATITUDE, p.LONGITUDE]);
      resetTrajectoryMap();
      trajectoryLayer = L.polyline(latLngs, {
        color: type === "flight" ? "#1f78ff" : "#ff9f1c",
        weight: 4,
        opacity: 0.85,
      }).addTo(trajectoryMap);
      trajectoryMap.fitBounds(trajectoryLayer.getBounds(), { padding: [20, 20] });
    } catch (error) {
      console.error("Failed to draw trajectory", error);
    }
  }

  function updateRangeLabels() {
    document.getElementById("speed-value").textContent = Number(
      speedInput.value
    ).toFixed(1);
    document.getElementById("distance-value").textContent = Number(
      distanceInput.value
    ).toFixed(1);
  }

  async function submitCompliance(event) {
    event.preventDefault();
    const payload = {
      speed: Number(speedInput.value),
      distance_to_aircraft: Number(distanceInput.value),
      brake_test_count: Number(brakeInput.value),
    };
    complianceResult.innerHTML = "<p class='text-muted'>检测中…</p>";
    try {
      const response = await fetch(CONTRACT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (result.compliant) {
        complianceResult.innerHTML =
          "<div class='alert alert-success'>✅ 合规：未检测到违规行为。</div>";
      } else {
        const violations =
          result.violations
            ?.map(
              (item) =>
                `<li><strong>${item.rule}</strong> · ${item.violation} · 严重性：${item.severity}</li>`
            )
            .join("") || "";
        complianceResult.innerHTML = `
          <div class="alert alert-danger">
            ⚠️ 检测到 ${result.violations?.length || 0} 项违规：
            <ul class="mb-0">${violations}</ul>
          </div>
        `;
      }
    } catch (error) {
      complianceResult.innerHTML =
        "<div class='alert alert-warning'>检测失败，请稍后重试。</div>";
    }
  }

  async function refreshTimeline() {
    try {
      const response = await fetch(BLOCKCHAIN_STATS_ENDPOINT);
      const stats = await response.json();
      const events = [
        {
          title: "链上存证同步",
          detail: `累计区块：${formatNumber(stats.total_blocks || 0)}`,
          time: new Date().toLocaleString(),
        },
        {
          title: "合约告警总览",
          detail: `违规事件：${formatNumber(stats.total_violations || 0)}`,
          time: new Date().toLocaleString(),
        },
        {
          title: "告警缓存",
          detail: `待处理告警：${formatNumber(stats.alerts_cached || 0)}`,
          time: new Date().toLocaleString(),
        },
      ];
      const container = document.getElementById("timeline");
      container.innerHTML = events
        .map(
          (event) => `
            <div class="timeline-item">
              <h6 class="mb-1">${event.title}</h6>
              <p class="text-muted mb-1">${event.detail}</p>
              <small class="text-secondary">${event.time}</small>
            </div>
          `
        )
        .join("");
    } catch (error) {
      console.error("Failed to refresh timeline", error);
    }
  }

  function bindEvents() {
    if (refreshSummaryBtn) refreshSummaryBtn.addEventListener("click", refreshSummary);
    if (datasetRefreshBtn) datasetRefreshBtn.addEventListener("click", loadDataset);
    if (datasetKeyword) {
      datasetKeyword.addEventListener("keypress", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          loadDataset();
        }
      });
    }
    if (trajectoryTypeSelect) {
      trajectoryTypeSelect.addEventListener("change", populateTrajectoryOptions);
    }
    if (trajectoryIdentifierSelect) {
      trajectoryIdentifierSelect.addEventListener("change", drawTrajectory);
    }
    if (speedInput && distanceInput) {
      speedInput.addEventListener("input", updateRangeLabels);
      distanceInput.addEventListener("input", updateRangeLabels);
    }
    if (complianceForm) {
      complianceForm.addEventListener("submit", submitCompliance);
    }
    if (timelineRefreshBtn) {
      timelineRefreshBtn.addEventListener("click", refreshTimeline);
    }
  }

  function init() {
    renderMatchingChart(summaryData.success_rates);
    renderDatasetChart(summaryData.datasets?.counts);
    populateDatasetOptions();
    initTrajectoryMap();
    populateTrajectoryOptions();
    loadDataset();
    updateRangeLabels();
    refreshTimeline();
    bindEvents();
  }

  document.addEventListener("DOMContentLoaded", init);
})();

