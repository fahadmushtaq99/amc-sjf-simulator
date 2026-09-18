<<<<<<< HEAD
# AMC-SJF CPU Scheduling Simulator

A browser-based simulator that compares two CPU scheduling strategies across
multiple virtual cores:

- **Normal SJF** — Shortest Job First, the classic textbook algorithm.
- **AMC-SJF** — Adaptive Multi-Core Shortest Job First, a variant that adds an
  *aging* term so long-waiting processes eventually win a core instead of
  being starved by a constant stream of short jobs.

> **This is a simulation only.** It runs entirely in your browser as
> JavaScript arithmetic on timestamps you type in. It does not read, control,
> pause, or otherwise touch any real process on your computer or operating
> system.

---

## 1. Project overview

You describe a workload (a list of processes, each with an arrival time and
a burst/CPU-time), pick how many CPU cores to simulate and an aging weight
**λ (lambda)**, and the app works out, second by second, which process each
core would run and when — for both algorithms — so you can compare them
side by side on a Gantt chart and a metrics table.

## 2. Features

- Add / remove processes with Process ID, Arrival Time and Burst Time, with
  input validation (unique IDs, non-negative integers, burst ≥ 1). Arrival
  and burst values can also be edited directly in the table — an invalid
  edit (blank, negative, non-integer, zero burst) is rejected and the field
  reverts to its last valid value.
- Configurable CPU core count (1–16) and aging weight λ (0–10, default `0.5`).
- **AMC-SJF** engine: multi-core, non-preemptive, priority-based dispatch
  using `P = 1/remaining_burst + λ × (waiting/total_burst)`.
- **Normal SJF** engine for a like-for-like comparison (same simulator, no
  aging term).
- Per-process results table: Start, Finish, Waiting, Turnaround, Response
  time and the Priority score it was dispatched with.
- Multi-core Gantt chart with one lane per core, idle periods hatched and
  clearly labelled, scaled responsively.
- Aggregate performance metrics: average waiting / turnaround / response
  time, CPU utilization, throughput, and total execution time.
- One-click "Compare algorithms" view with a metric-by-metric delta table.
- "Load sample workload" and "Generate random workload" buttons so you can
  demo the app with zero typing.
- Handles edge cases: empty input, negative/zero values, duplicate IDs,
  simultaneous arrivals, single-core runs, all-cores-idle gaps, and larger
  process counts.
- An **optional** Python CLI helper (`scripts/generate_processes.py`) that
  generates random workload files from the terminal, purely as a
  convenience — the simulator itself needs no backend and no Python to run.

## 3. Technologies used

| Layer               | Technology                                   |
|----------------------|-----------------------------------------------|
| Structure            | HTML5                                         |
| Styling              | CSS3 (custom properties, grid/flexbox, no framework) |
| Scheduling logic & UI | Vanilla JavaScript (ES6+, no build step)     |
| Fonts                | IBM Plex Sans / IBM Plex Mono (Google Fonts)  |
| Optional CLI helper  | Python 3, `colorama`, `pyfiglet`, `os`, `time`, `random` |
| Dev environment      | Windows + WSL (Ubuntu) + VS Code               |

There is **no database and no application backend**. All scheduling math
runs client-side in `script.js`.

## 4. Project folder structure

```
amc-sjf-simulator/
├── index.html                 # Page structure: form, tables, Gantt chart, metrics
├── style.css                  # All styling (single stylesheet, no framework)
├── script.js                  # Scheduling engine + UI logic (single file, no build step)
├── README.md                  # This file
└── scripts/
    ├── generate_processes.py  # Optional CLI: generates random workload files
    └── requirements.txt       # Python deps for the optional CLI (colorama, pyfiglet)
```

## 5. Installation / setup (Windows + WSL Ubuntu)

You only need a browser to *use* the simulator. These steps also cover the
optional Python helper.

1. **Install WSL + Ubuntu** (skip if you already have it) — from PowerShell
   as Administrator:
   ```bash
   wsl --install -d Ubuntu
   ```
   Restart when prompted, then finish the Ubuntu username/password setup.

2. **Open Ubuntu and update packages:**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

3. **Get the project files onto your machine.** If you received this as a
   folder, copy it into your Linux home directory, e.g.:
   ```bash
   cp -r /mnt/c/Users/<your-windows-username>/Downloads/amc-sjf-simulator ~/amc-sjf-simulator
   cd ~/amc-sjf-simulator
   ```

4. **(Optional) Install Python 3 and the CLI helper's dependencies:**
   ```bash
   sudo apt install -y python3 python3-pip
   pip3 install -r scripts/requirements.txt
   ```

5. **Open the project in VS Code from WSL:**
   ```bash
   code .
   ```
   (If `code` isn't recognized, install the "WSL" extension in VS Code on
   Windows first, then reopen the Ubuntu terminal.)

## 6. How to run the project

The web app is a set of static files — no server is required, but using one
avoids occasional browser restrictions on files opened directly from disk.

**Option A — just open it:**
```bash
explorer.exe .    # from the project folder in WSL, opens the folder in Windows Explorer
```
Then double-click `index.html`.

**Option B — serve it locally (recommended):**
```bash
cd ~/amc-sjf-simulator
python3 -m http.server 8000
```
Then open **http://localhost:8000** in your browser.

**Optional — generate a random workload from the terminal:**
```bash
cd ~/amc-sjf-simulator
python3 scripts/generate_processes.py --count 10 --cores 2 --seed 42
```
This prints a colored banner and table, and writes `workload.json` — copy
those PID/Arrival/Burst values into the web app's Process queue form (the
app also has its own built-in "Generate random workload" button if you'd
rather skip Python entirely).

## 7. How to use the application

1. Under **Process queue**, add each process's ID, arrival time and burst
   time, or click **Load sample workload** / **Generate random workload**.
   You can also edit any arrival/burst value directly in the table afterward.
2. Under **CPU configuration**, set the number of cores and λ.
3. Click **Run AMC-SJF** or **Run SJF** to simulate one algorithm, or
   **Compare algorithms** to run both at once.
4. Scroll to **Results** for the per-process table (switch tabs between
   AMC-SJF and SJF), **Gantt chart** for the visual timeline per core, and
   **Metrics** for the aggregate numbers and the side-by-side comparison.
5. **Reset simulation** clears results/charts but keeps your process list;
   **Clear all** empties the process list too.

## 8. How AMC-SJF works

AMC-SJF is **non-preemptive**: once a process is dispatched to a core, it
runs uninterrupted until it finishes. What makes it "adaptive" is *how it
picks* the next process every time a core goes free:

1. Look at every process that has arrived by the current time and hasn't
   started yet — this is the ready queue for that core.
2. Score each one:
   ```
   Priority = 1 / remaining_burst_time  +  λ × (waiting_time / total_burst_time)
   ```
   - The first term favors **short jobs** (smaller remaining burst → bigger
     score).
   - The second term favors **jobs that have waited a long time relative to
     their own size** — this is the aging factor.
3. Dispatch the highest-scoring process to that core for its full burst.
4. Repeat for whichever core frees up next, re-scoring the ready queue at
   that exact moment (so two cores freeing up at the same instant can pick
   two different processes).
5. If every core is free but nothing has arrived yet, every core fast-forwards
   to the next arrival time (an idle gap on the Gantt chart).

This keeps SJF's throughput advantage on short jobs while preventing a
worst case where a long process is repeatedly skipped forever.

## 9. How normal SJF works

Identical engine and multi-core mechanics, but the score is just:
```
Priority = 1 / remaining_burst_time
```
No aging term, so a process's wait time never influences the decision. It's
the textbook baseline the app compares AMC-SJF against.

## 10. Explanation of Lambda / Aging

**λ (lambda)** controls how strongly waiting time is allowed to outweigh job
size in AMC-SJF:

- **λ = 0** — AMC-SJF collapses to plain SJF; waiting never matters.
- **Small λ (e.g. 0.1–0.5)** — short jobs still usually win, but a process
  that's been waiting a very long time relative to its own burst can
  eventually overtake them.
- **Large λ** — waiting time dominates quickly, trading some throughput for
  fairness (closer to a First-Come-First-Served feel).

Because the waiting term is divided by the process's **own total burst**,
aging is relative: a short process only needs to wait a little while before
its score climbs a lot, while a long process needs to wait proportionally
longer — this is intentional, so long jobs don't unfairly leapfrog everyone
the instant they arrive.

## 11. Explanation of performance metrics

| Metric | Formula | What it tells you |
|---|---|---|
| **Waiting time** | `start_time − arrival_time` | How long a process sat ready before it got a core. |
| **Turnaround time** | `finish_time − arrival_time` | Total time from arrival to completion. |
| **Response time** | `start_time − arrival_time` | Time until the process first got the CPU (equal to waiting time here, since this simulator is non-preemptive — a process runs once, start to finish). |
| **Priority at dispatch** | the score computed at the moment it was chosen | Lets you see *why* the scheduler picked that process over others. |
| **Avg. waiting / turnaround / response** | mean across all processes | Overall fairness/speed of the schedule. |
| **CPU utilization** | `(sum of all burst times) / (cores × total execution time) × 100` | How much of the available core-time was spent doing real work vs. idle. |
| **Throughput** | `process count / total execution time` | Processes completed per millisecond. |
| **Total execution time** | time the last process finishes (assuming the simulation starts at t = 0) | The overall makespan of the schedule. |

## 12. Example input and expected output

**Example input** (or click "Load sample workload"):

| PID | Arrival | Burst |
|---|---|---|
| P1 | 0 | 8 |
| P2 | 1 | 4 |
| P3 | 2 | 9 |
| P4 | 3 | 5 |
| P5 | 4 | 2 |
| P6 | 6 | 3 |
| P7 | 9 | 7 |

With **2 cores** and **λ = 0.5**, running both algorithms should produce:

- Two populated results tables (one row per process, both algorithms),
  each with different Start/Finish times because the dispatch order
  differs.
- A two-lane Gantt chart per algorithm, with visible idle hatching only if
  a core briefly has nothing ready to run.
- Non-zero, generally *lower* average waiting time for AMC-SJF than SJF on
  workloads where a long process (like P3 or P7 here) would otherwise be
  pushed back repeatedly — the exact numbers depend on λ and the process
  mix, which is the point of the comparison view.

## 13. Troubleshooting

| Problem | Likely cause / fix |
|---|---|
| Buttons do nothing when clicked | Make sure `script.js` is in the same folder as `index.html` and loads without a console error (open DevTools → Console). |
| "Process ID already exists" | PIDs are case-insensitive and must be unique — remove or rename the duplicate. |
| Run button shows an error and does nothing | Add at least one process first, and check CPU cores (≥1, ≤16) and λ (≥0) are valid numbers. |
| Gantt chart looks empty / all idle | Check your arrival times — if every process arrives very late relative to a small burst, most of the chart is legitimately idle before it starts. |
| Fonts look like a generic sans-serif | You're offline — the page links Google Fonts (IBM Plex Sans/Mono) but falls back gracefully; functionality is unaffected. |
| `python3 scripts/generate_processes.py` fails with `ModuleNotFoundError` | Run `pip3 install -r scripts/requirements.txt` inside your WSL Ubuntu shell. |
| `python3: command not found` in WSL | `sudo apt install -y python3 python3-pip` |
| Port 8000 already in use | `python3 -m http.server 8080` and open `http://localhost:8080` instead. |

---

## Final checklist

- [x] Process add/remove with validation (unique ID, non-negative integers, burst ≥ 1)
- [x] CPU core count and λ configuration, default λ = 0.5, ms time unit
- [x] AMC-SJF engine — multi-core, priority formula, aging, no starvation, correct idle/arrival handling
- [x] Normal SJF engine for comparison, same simulator core
- [x] Per-process results: Start, Finish, Waiting, Turnaround, Response, Priority at dispatch
- [x] Aggregate metrics: avg waiting/turnaround/response, CPU utilization, throughput, total execution time
- [x] Multi-lane, responsive Gantt chart with idle periods shown
- [x] Professional, responsive UI (desktop/tablet/mobile), clear sections, no unnecessary animation
- [x] Controls: Add/Remove Process, Run AMC-SJF, Run SJF, Compare, Reset, sample/random workload generators
- [x] Edge cases handled: empty input, negatives, duplicates, zero burst, simultaneous arrivals, 1 core, many cores, idle gaps, large workloads
- [x] Clean modular files: `index.html`, `style.css`, `script.js`, `README.md`
- [x] Optional, clearly separated Python CLI using `colorama`, `pyfiglet`, `os`, `time`, `random`
- [x] Full documentation (this README)
=======
# amc-sjf-simulator
AMC-SJF is a client-side JavaScript web simulator that compares classical Shortest Job First with an Adaptive Multi-Core dispatch strategy. It prevents starvation by using an aging formula to score waiting processes across virtual CPU cores. Users can configure workloads, view Gantt charts, and analyze performance metrics.
>>>>>>> 7a7520726addc36ebb656f1a794edc999e12d26f
