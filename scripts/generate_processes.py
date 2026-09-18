#!/usr/bin/env python3
"""
generate_processes.py
----------------------
An OPTIONAL command-line helper for the AMC-SJF Simulator.

This script does not run, control, or touch any real operating-system
process. It only generates a random *list of numbers* (fake process
IDs, arrival times and burst times) that you can copy-paste into the
web app's "Process ID / Arrival / Burst" fields, or load from the
JSON/CSV file it writes out.

Why it exists:
    The assignment asks for genuine use of a few Python libraries
    (colorama, pyfiglet, os, time, random) alongside the web app.
    Rather than bolting Python onto the simulator itself (which would
    need a backend for no real reason), this is a small, honest,
    separate utility: it prints a terminal banner and hands you a
    ready-made workload file.

Usage (from the project root, inside WSL Ubuntu):
    python3 scripts/generate_processes.py
    python3 scripts/generate_processes.py --count 10 --cores 3 --out workload.json
    python3 scripts/generate_processes.py --format csv --out workload.csv

Required libraries:
    pip install colorama pyfiglet
"""

import argparse
import csv
import json
import os
import random
import sys
import time

try:
    from colorama import Fore, Style, init as colorama_init
except ImportError:
    print("Missing dependency 'colorama'. Install it with: pip install colorama")
    sys.exit(1)

try:
    import pyfiglet
except ImportError:
    print("Missing dependency 'pyfiglet'. Install it with: pip install pyfiglet")
    sys.exit(1)


def print_banner():
    """Prints a colored ASCII banner using pyfiglet + colorama."""
    colorama_init(autoreset=True)
    banner = pyfiglet.figlet_format("AMC-SJF", font="standard")
    print(Fore.YELLOW + banner)
    print(Fore.CYAN + Style.BRIGHT + "Random workload generator" + Style.RESET_ALL)
    print(Fore.WHITE + "-" * 46)


def generate_workload(count, max_gap, max_burst, seed=None):
    """
    Builds a random list of processes.

    - `count`     how many processes to generate
    - `max_gap`   the largest possible gap (in ms) between one arrival and the next
    - `max_burst` the largest possible burst time (in ms)
    - `seed`      optional int, for reproducible output (useful for grading/demos)

    Returns a list of dicts: [{"pid": "P1", "arrival": 0, "burst": 7}, ...]
    """
    if seed is not None:
        random.seed(seed)

    workload = []
    clock = 0
    for i in range(1, count + 1):
        clock += random.randint(0, max_gap)
        burst = random.randint(1, max_burst)
        workload.append({"pid": f"P{i}", "arrival": clock, "burst": burst})
    return workload


def write_json(workload, path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(workload, f, indent=2)


def write_csv(workload, path):
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["pid", "arrival", "burst"])
        writer.writeheader()
        writer.writerows(workload)


def print_table(workload):
    print(Fore.GREEN + f"{'PID':<8}{'Arrival':<10}{'Burst':<8}")
    print(Fore.WHITE + "-" * 26)
    for p in workload:
        print(f"{p['pid']:<8}{p['arrival']:<10}{p['burst']:<8}")


def main():
    parser = argparse.ArgumentParser(description="Generate a random process workload for the AMC-SJF simulator.")
    parser.add_argument("--count", type=int, default=8, help="number of processes to generate (default: 8)")
    parser.add_argument("--cores", type=int, default=2, help="just echoed back as a suggestion, not enforced here")
    parser.add_argument("--max-gap", type=int, default=4, help="max ms between successive arrivals (default: 4)")
    parser.add_argument("--max-burst", type=int, default=12, help="max burst time in ms (default: 12)")
    parser.add_argument("--seed", type=int, default=None, help="random seed, for reproducible workloads")
    parser.add_argument("--format", choices=["json", "csv"], default="json", help="output file format")
    parser.add_argument("--out", type=str, default=None, help="output file path (default: workload.<format>)")
    args = parser.parse_args()

    print_banner()

    start = time.time()
    workload = generate_workload(args.count, args.max_gap, args.max_burst, args.seed)
    elapsed_ms = (time.time() - start) * 1000

    print_table(workload)
    print(Fore.WHITE + "-" * 26)
    print(Fore.CYAN + f"Generated {len(workload)} processes in {elapsed_ms:.2f} ms")
    print(Fore.CYAN + f"Suggested CPU cores for this run: {args.cores}")

    out_path = args.out or f"workload.{args.format}"
    out_path = os.path.abspath(out_path)

    if args.format == "json":
        write_json(workload, out_path)
    else:
        write_csv(workload, out_path)

    print(Fore.YELLOW + Style.BRIGHT + f"\nSaved to: {out_path}")
    print(Fore.WHITE + "Open the web app and copy these values into the Process queue form,")
    print(Fore.WHITE + "or paste the JSON array into your browser console if you extend the app with a loader.")


if __name__ == "__main__":
    main()
