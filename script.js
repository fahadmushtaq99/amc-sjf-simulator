/* ============================================================
   AMC-SJF Simulator — script.js
   Everything here is a pure client-side simulation. It never
   touches real OS processes; it only works with numbers you
   type into the form.

   File is organized in four parts:
     1. State
     2. Scheduling engine (runSchedule)
     3. Metric calculations
     4. UI wiring / rendering
   ============================================================ */

(() => {
  "use strict";

  /* ------------------------------------------------------------
     1. STATE
     ------------------------------------------------------------ */

  /** @type {{pid:string, arrival:number, burst:number}[]} */
  let processes = [];

  /** Holds the last run's output for each algorithm so tabs/compare can reuse it. */
  const lastRun = { amc: null, sjf: null };

  /* ------------------------------------------------------------
     2. SCHEDULING ENGINE
     ------------------------------------------------------------ */

  /**
   * Runs a non-preemptive, multi-core, priority-driven simulation.
   *
   * How it works, step by step:
   *   - Every core has a "free at" timestamp (starts at 0).
   *   - Repeatedly: look at every core, find the one whose free time
   *     is earliest AND that has at least one process that has already
   *     arrived by that time. That core makes the next decision.
   *   - Among the processes that have arrived by that core's free time
   *     and have not yet been dispatched, score each one and dispatch
   *     the best-scoring one to that core for its FULL remaining burst
   *     (this simulator is non-preemptive: once a process starts, it
   *     runs to completion).
   *   - If no core has any arrived-but-undispatched process, every
   *     core is idle — jump every core forward to the next arrival.
   *   - Repeat until every process has been dispatched.
   *
   * @param {{pid:string, arrival:number, burst:number}[]} inputProcesses
   * @param {number} cores
   * @param {number} lambda
   * @param {boolean} adaptive - true = AMC-SJF (uses aging), false = normal SJF
   */
  function runSchedule(inputProcesses, cores, lambda, adaptive) {
    // Work on independent copies so re-running never mutates shared state.
    const procs = inputProcesses.map((p) => ({
      pid: p.pid,
      arrival: p.arrival,
      burst: p.burst,
      remaining: p.burst,
      assigned: false,
      core: null,
      start: null,
      finish: null,
      priority: null,
      waitingAtDispatch: null,
    }));

    const n = procs.length;
    const coreFreeAt = new Array(cores).fill(0);
    // Raw list of every busy block placed on each core, used to build the Gantt chart later.
    const coreBlocks = Array.from({ length: cores }, () => []);

    let dispatched = 0;
    let safety = 0;
    const SAFETY_LIMIT = n * cores + 10000; // guards against an infinite loop bug

    while (dispatched < n) {
      safety += 1;
      if (safety > SAFETY_LIMIT) {
        throw new Error("Scheduler safety limit hit — check for a logic error.");
      }

      // For every core, work out the earliest moment it could actually
      // dispatch something: if a process has already arrived by the
      // time the core goes free, that's immediate; otherwise the core
      // has to idle forward to the next arrival. Each core is judged
      // independently — an idle core is NOT stuck waiting for some
      // other, busier core to catch up.
      let chosenCore = -1;
      let chosenTime = Infinity;
      const unassignedArrivals = procs.filter((p) => !p.assigned).map((p) => p.arrival);
      const nextArrivalOverall = unassignedArrivals.length ? Math.min(...unassignedArrivals) : Infinity;

      for (let c = 0; c < cores; c++) {
        const t = coreFreeAt[c];
        const hasReady = procs.some((p) => !p.assigned && p.arrival <= t);
        const effectiveTime = hasReady ? t : Math.max(t, nextArrivalOverall);
        if (effectiveTime < chosenTime) {
          chosenTime = effectiveTime;
          chosenCore = c;
        }
      }

      const c = chosenCore;
      const t = chosenTime;
      coreFreeAt[c] = t; // advance this core's clock past any idle gap before it dispatches

      // Ready queue at this exact decision point.
      const ready = procs.filter((p) => !p.assigned && p.arrival <= t);

      // Score every ready process and keep the best.
      let best = null;
      let bestScore = -Infinity;

      for (const p of ready) {
        const waiting = t - p.arrival; // how long it has sat in the ready queue so far
        const score = adaptive
          ? 1 / p.remaining + lambda * (waiting / p.burst)
          : 1 / p.remaining; // normal SJF ignores waiting entirely

        // Tie-break: earlier arrival first, then lower PID string, so results are deterministic.
        const better =
          score > bestScore ||
          (score === bestScore && best !== null && p.arrival < best.arrival) ||
          (score === bestScore && best !== null && p.arrival === best.arrival && p.pid < best.pid);

        if (best === null || better) {
          best = p;
          bestScore = score;
        }
      }

      // Dispatch `best` onto core `c` for its full remaining burst.
      best.assigned = true;
      best.core = c;
      best.start = t;
      best.finish = t + best.remaining;
      best.priority = bestScore;
      best.waitingAtDispatch = t - best.arrival;

      coreBlocks[c].push({ pid: best.pid, start: best.start, finish: best.finish });
      coreFreeAt[c] = best.finish;
      dispatched += 1;
    }

    const makespan = n === 0 ? 0 : Math.max(...procs.map((p) => p.finish));

    return {
      processes: procs.sort((a, b) => a.start - b.start),
      coreBlocks,
      cores,
      makespan,
    };
  }

  /* ------------------------------------------------------------
     3. METRICS
     ------------------------------------------------------------ */

  /**
   * A process's waiting, turnaround and response times all derive from
   * the same three numbers (arrival, start, finish). Both the results
   * table and the aggregate metrics need these, so they're computed in
   * exactly one place to avoid the two ever drifting out of sync.
   *
   *   waiting     = start  - arrival   (time spent ready, not running)
   *   turnaround  = finish - arrival   (total time in the system)
   *   response    = start  - arrival   (time to first get the CPU — equal
   *                                      to waiting here because this is a
   *                                      non-preemptive simulator: a
   *                                      process runs once, start to finish)
   */
  function deriveTimes(p) {
    const waiting = p.start - p.arrival;
    const turnaround = p.finish - p.arrival;
    const response = p.start - p.arrival;
    return { waiting, turnaround, response };
  }

  function computeMetrics(runResult) {
    const { processes: procs, cores, makespan } = runResult;
    const n = procs.length;
    if (n === 0) {
      return { avgWaiting: 0, avgTurnaround: 0, avgResponse: 0, utilization: 0, throughput: 0, makespan: 0 };
    }

    let sumWaiting = 0, sumTurnaround = 0, sumResponse = 0, sumBurst = 0;
    for (const p of procs) {
      const { waiting, turnaround, response } = deriveTimes(p);
      sumWaiting += waiting;
      sumTurnaround += turnaround;
      sumResponse += response;
      sumBurst += p.burst;
    }

    const utilization = makespan > 0 ? (sumBurst / (cores * makespan)) * 100 : 0;
    const throughput = makespan > 0 ? n / makespan : 0;

    return {
      avgWaiting: sumWaiting / n,
      avgTurnaround: sumTurnaround / n,
      avgResponse: sumResponse / n,
      utilization,
      throughput,
      makespan,
    };
  }

  /* ------------------------------------------------------------
     4. UI WIRING
     ------------------------------------------------------------ */

  const el = (id) => document.getElementById(id);

  const processTableBody = el("process-table-body");
  const formError = el("form-error");
  const runStatus = el("run-status");

  function fmt(n, decimals = 2) {
    if (!isFinite(n)) return "—";
    return n.toFixed(decimals);
  }

  function renderProcessTable() {
    processTableBody.innerHTML = "";
    if (processes.length === 0) {
      processTableBody.innerHTML =
        '<tr class="empty-row"><td colspan="4">No processes yet — add one above, or load a sample set.</td></tr>';
      return;
    }
    processes.forEach((p, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(p.pid)}</td>
        <td><input type="number" class="row-input" data-idx="${idx}" data-field="arrival" value="${p.arrival}" min="0" step="1" aria-label="Arrival time for ${escapeHtml(p.pid)}"></td>
        <td><input type="number" class="row-input" data-idx="${idx}" data-field="burst" value="${p.burst}" min="1" step="1" aria-label="Burst time for ${escapeHtml(p.pid)}"></td>
        <td><button class="row-remove" data-idx="${idx}">Remove</button></td>
      `;
      processTableBody.appendChild(tr);
    });
  }

  /**
   * Lets you edit a process's arrival/burst directly in the table instead
   * of having to remove and re-add it. Invalid edits (blank, negative,
   * non-integer, zero burst) are rejected and the field snaps back to its
   * last valid value — the underlying `processes` array is never left in
   * an invalid state.
   */
  processTableBody.addEventListener("change", (e) => {
    if (!e.target.matches(".row-input")) return;
    const idx = Number(e.target.dataset.idx);
    const field = e.target.dataset.field;
    const p = processes[idx];
    if (!p) return;

    const value = Number(e.target.value);
    const isArrival = field === "arrival";
    const valid = isArrival
      ? Number.isFinite(value) && Number.isInteger(value) && value >= 0
      : Number.isFinite(value) && Number.isInteger(value) && value >= 1;

    if (!valid) {
      setFormError(
        isArrival
          ? `Arrival time for "${p.pid}" must be a whole number ≥ 0 — reverted.`
          : `Burst time for "${p.pid}" must be a whole number ≥ 1 — reverted.`
      );
      e.target.value = p[field]; // revert the input to the last valid value
      return;
    }

    setFormError("");
    p[field] = value;
  });

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function setFormError(msg) {
    formError.textContent = msg || "";
  }

  function addProcess(pid, arrival, burst) {
    pid = (pid || "").trim();

    if (!pid) return setFormError("Process ID can't be empty.");
    if (processes.some((p) => p.pid.toLowerCase() === pid.toLowerCase()))
      return setFormError(`Process ID "${pid}" already exists — IDs must be unique.`);
    if (!Number.isFinite(arrival) || arrival < 0 || !Number.isInteger(arrival))
      return setFormError("Arrival time must be a whole number ≥ 0.");
    if (!Number.isFinite(burst) || burst < 1 || !Number.isInteger(burst))
      return setFormError("Burst time must be a whole number ≥ 1 (zero-burst processes aren't schedulable).");
    if (processes.length >= 200)
      return setFormError("That's a lot of processes — capped at 200 for a readable Gantt chart.");

    processes.push({ pid, arrival, burst });
    setFormError("");
    renderProcessTable();
  }

  el("process-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const pid = el("pid").value;
    const arrival = Number(el("arrival").value);
    const burst = Number(el("burst").value);
    addProcess(pid, arrival, burst);
    if (!formError.textContent) {
      el("pid").value = "";
      el("arrival").value = "";
      el("burst").value = "";
      el("pid").focus();
    }
  });

  processTableBody.addEventListener("click", (e) => {
    if (e.target.matches(".row-remove")) {
      const idx = Number(e.target.dataset.idx);
      processes.splice(idx, 1);
      renderProcessTable();
    }
  });

  el("clear-btn").addEventListener("click", () => {
    processes = [];
    renderProcessTable();
    setFormError("");
  });

  el("sample-btn").addEventListener("click", () => {
    processes = [
      { pid: "P1", arrival: 0, burst: 8 },
      { pid: "P2", arrival: 1, burst: 4 },
      { pid: "P3", arrival: 2, burst: 9 },
      { pid: "P4", arrival: 3, burst: 5 },
      { pid: "P5", arrival: 4, burst: 2 },
      { pid: "P6", arrival: 6, burst: 3 },
      { pid: "P7", arrival: 9, burst: 7 },
    ];
    renderProcessTable();
    setFormError("");
  });

  el("random-btn").addEventListener("click", () => {
    const count = 6 + Math.floor(Math.random() * 5); // 6-10 processes
    const list = [];
    let t = 0;
    for (let i = 1; i <= count; i++) {
      t += Math.floor(Math.random() * 4); // arrivals trickle in
      list.push({ pid: `P${i}`, arrival: t, burst: 1 + Math.floor(Math.random() * 12) });
    }
    processes = list;
    renderProcessTable();
    setFormError("");
  });

  /* ---------- Running simulations ---------- */

  function readConfig() {
    const cores = Number(el("cores").value);
    const lambda = Number(el("lambda").value);
    if (!Number.isFinite(cores) || cores < 1 || !Number.isInteger(cores)) {
      return { error: "CPU cores must be a whole number ≥ 1." };
    }
    if (cores > 16) return { error: "16 cores is the display limit for this simulator." };
    if (!Number.isFinite(lambda) || lambda < 0) {
      return { error: "Lambda must be a number ≥ 0." };
    }
    if (lambda > 10) return { error: "Lambda above 10 stops being meaningful here — keep it between 0 and 10." };
    return { cores, lambda };
  }

  function runAlgorithm(kind) {
    if (processes.length === 0) {
      setStatus("Add at least one process before running a simulation.", "err");
      return;
    }
    const cfg = readConfig();
    if (cfg.error) {
      setStatus(cfg.error, "err");
      return;
    }

    let result;
    try {
      result = runSchedule(processes, cfg.cores, cfg.lambda, kind === "amc");
    } catch (err) {
      setStatus("Simulation error: " + err.message, "err");
      return;
    }
    const metrics = computeMetrics(result);
    lastRun[kind] = { result, metrics, lambda: cfg.lambda, cores: cfg.cores };

    renderResultsTable(kind, result);
    renderGantt(kind, result);
    renderMetricsFor(kind);
    updateComparison();

    setStatus(
      `${kind === "amc" ? "AMC-SJF" : "Normal SJF"} simulated — ${processes.length} process(es) across ${cfg.cores} core(s).`,
      "ok"
    );
  }

  function setStatus(msg, cls) {
    runStatus.textContent = msg;
    runStatus.className = "run-status" + (cls ? " " + cls : "");
  }

  el("run-amc-btn").addEventListener("click", () => runAlgorithm("amc"));
  el("run-sjf-btn").addEventListener("click", () => runAlgorithm("sjf"));

  el("compare-btn").addEventListener("click", () => {
    runAlgorithm("amc");
    runAlgorithm("sjf");
    setStatus("Compared AMC-SJF and normal SJF on the current workload.", "ok");
    const compareBlock = document.getElementById("comparison-block");
    if (typeof compareBlock.scrollIntoView === "function") {
      compareBlock.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  el("reset-btn").addEventListener("click", () => {
    lastRun.amc = null;
    lastRun.sjf = null;
    el("amc-results-body").innerHTML =
      '<tr class="empty-row"><td colspan="10">Run AMC-SJF to see results here.</td></tr>';
    el("sjf-results-body").innerHTML =
      '<tr class="empty-row"><td colspan="10">Run SJF to see results here.</td></tr>';
    el("amc-gantt").innerHTML = '<p class="gantt-empty">Run AMC-SJF to draw its Gantt chart.</p>';
    el("sjf-gantt").innerHTML = '<p class="gantt-empty">Run SJF to draw its Gantt chart.</p>';
    ["m-waiting", "m-turnaround", "m-response", "m-util", "m-throughput", "m-total"].forEach((id) => (el(id).textContent = "—"));
    ["m-waiting-sub", "m-turnaround-sub", "m-response-sub", "m-util-sub", "m-throughput-sub", "m-total-sub"].forEach(
      (id) => (el(id).textContent = "")
    );
    el("comparison-block").classList.add("hidden");
    setStatus("Simulation reset. Process list kept — run again whenever you're ready.", "");
  });

  /* ---------- Results table ---------- */

  function renderResultsTable(kind, result) {
    const body = el(kind + "-results-body");
    body.innerHTML = "";
    if (result.processes.length === 0) return;
    for (const p of result.processes) {
      const { waiting, turnaround, response } = deriveTimes(p);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(p.pid)}</td>
        <td>C${p.core}</td>
        <td>${p.arrival}</td>
        <td>${p.burst}</td>
        <td>${p.start}</td>
        <td>${p.finish}</td>
        <td>${waiting}</td>
        <td>${turnaround}</td>
        <td>${response}</td>
        <td>${fmt(p.priority, 4)}</td>
      `;
      body.appendChild(tr);
    }
  }

  /* ---------- Gantt chart ---------- */

  const GANTT_COLORS = ["#B8792E", "#2C7A72", "#6B5B95", "#3F6C8A", "#8A6D3B", "#4A7856", "#9E5B4C", "#5B6E8C"];

  function colorForPid(pid) {
    // Deterministic color from a simple string hash, so the same PID is always the same color.
    let hash = 0;
    for (let i = 0; i < pid.length; i++) hash = (hash * 31 + pid.charCodeAt(i)) >>> 0;
    return GANTT_COLORS[hash % GANTT_COLORS.length];
  }

  function renderGantt(kind, result) {
    const container = el(kind + "-gantt");
    container.innerHTML = "";
    if (result.processes.length === 0) {
      container.innerHTML = '<p class="gantt-empty">No processes to display.</p>';
      return;
    }

    const makespan = Math.max(1, result.makespan);

    for (let c = 0; c < result.cores; c++) {
      const blocks = [...result.coreBlocks[c]].sort((a, b) => a.start - b.start);

      const row = document.createElement("div");
      row.className = "gantt-row";

      const label = document.createElement("div");
      label.className = "gantt-row-label";
      label.textContent = `Core ${c}`;
      row.appendChild(label);

      const track = document.createElement("div");
      track.className = "gantt-track";

      let cursor = 0;
      const pushSegment = (start, finish, pid) => {
        const width = ((finish - start) / makespan) * 100;
        if (width <= 0) return;
        const seg = document.createElement("div");
        if (pid === null) {
          seg.className = "gantt-block idle";
          seg.style.width = width + "%";
          seg.textContent = width > 4 ? "idle" : "";
          seg.title = `Idle from ${start} to ${finish}`;
        } else {
          seg.className = "gantt-block";
          seg.style.width = width + "%";
          seg.style.background = colorForPid(pid);
          seg.innerHTML = `${escapeHtml(pid)}<span class="block-time">${start}\u2013${finish}</span>`;
          seg.title = `${pid}: ${start} \u2192 ${finish}`;
        }
        track.appendChild(seg);
      };

      for (const b of blocks) {
        if (b.start > cursor) pushSegment(cursor, b.start, null); // idle gap
        pushSegment(b.start, b.finish, b.pid);
        cursor = b.finish;
      }
      if (cursor < makespan) pushSegment(cursor, makespan, null); // trailing idle

      row.appendChild(track);
      container.appendChild(row);
    }

    // Axis with a handful of evenly-spaced time labels.
    const axis = document.createElement("div");
    axis.className = "gantt-axis";
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const span = document.createElement("span");
      span.textContent = Math.round((makespan / steps) * i);
      axis.appendChild(span);
    }
    container.appendChild(axis);
  }

  /* ---------- Metrics ---------- */

  function unitTime(v) {
    return fmt(v, 2) + " ms";
  }

  function renderMetricsFor(kind) {
    // BUGFIX: this used to always prefer lastRun.amc if it existed at all,
    // so re-running SJF after AMC had already been run left the metrics
    // cards frozen on the old AMC numbers. The metrics panel must reflect
    // whichever algorithm was JUST run, not whichever ran first.
    const current = lastRun[kind];
    if (!current) return;
    const m = current.metrics;
    el("m-waiting").textContent = unitTime(m.avgWaiting);
    el("m-turnaround").textContent = unitTime(m.avgTurnaround);
    el("m-response").textContent = unitTime(m.avgResponse);
    el("m-util").textContent = fmt(m.utilization, 1) + "%";
    el("m-throughput").textContent = fmt(m.throughput, 4) + " proc/ms";
    el("m-total").textContent = unitTime(m.makespan);

    const label = kind === "amc" ? "AMC-SJF" : "Normal SJF";
    ["m-waiting-sub", "m-turnaround-sub", "m-response-sub", "m-util-sub", "m-throughput-sub", "m-total-sub"].forEach(
      (id) => (el(id).textContent = label)
    );
  }

  function updateComparison() {
    const block = el("comparison-block");
    if (!lastRun.amc || !lastRun.sjf) {
      block.classList.add("hidden");
      return;
    }
    block.classList.remove("hidden");
    const a = lastRun.amc.metrics;
    const s = lastRun.sjf.metrics;

    const rows = [
      ["Avg. waiting time", unitTime(a.avgWaiting), unitTime(s.avgWaiting), unitTime(a.avgWaiting - s.avgWaiting)],
      ["Avg. turnaround time", unitTime(a.avgTurnaround), unitTime(s.avgTurnaround), unitTime(a.avgTurnaround - s.avgTurnaround)],
      ["Avg. response time", unitTime(a.avgResponse), unitTime(s.avgResponse), unitTime(a.avgResponse - s.avgResponse)],
      ["CPU utilization", fmt(a.utilization, 1) + "%", fmt(s.utilization, 1) + "%", fmt(a.utilization - s.utilization, 1) + " pts"],
      ["Throughput", fmt(a.throughput, 4) + " proc/ms", fmt(s.throughput, 4) + " proc/ms", fmt(a.throughput - s.throughput, 4) + " proc/ms"],
      ["Total execution time", unitTime(a.makespan), unitTime(s.makespan), unitTime(a.makespan - s.makespan)],
    ];

    const body = el("comparison-body");
    body.innerHTML = rows
      .map(
        (r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`
      )
      .join("");
  }

  /* ---------- Tabs ---------- */

  function showTabPane(prefix, tab) {
    if (prefix === "amc-results" || prefix === "results") {
      el("amc-results-table").classList.toggle("hidden", tab !== "amc");
      el("sjf-results-table").classList.toggle("hidden", tab !== "sjf");
    }
    if (prefix === "gantt") {
      el("amc-gantt").classList.toggle("hidden", tab !== "amc");
      el("sjf-gantt").classList.toggle("hidden", tab !== "sjf");
    }
  }

  el("results-tabs").addEventListener("click", (e) => {
    if (!e.target.matches(".tab-btn")) return;
    el("results-tabs").querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === e.target));
    showTabPane("results", e.target.dataset.tab);
  });

  el("gantt-tabs").addEventListener("click", (e) => {
    if (!e.target.matches(".tab-btn")) return;
    el("gantt-tabs").querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === e.target));
    showTabPane("gantt", e.target.dataset.tab);
  });

  /* ---------- Init ---------- */

  renderProcessTable();
})();
