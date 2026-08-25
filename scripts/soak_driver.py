#!/usr/bin/env python3
"""ECP soak driver for RELAY-0 long-session testing (issue #13).

Drives a sideloaded RELAY-0 channel on a real Roku over its ECP port (8060)
and captures debug-console output (8085) so the session can be scored for
timer multiplication, observer accumulation, and runtime errors.

This is a test *driver*, not a test oracle: it records what was pressed and
what the console said. Scoring the transcript against the pass/fail gates in
docs/LONG_SESSION.md is a separate, deliberate step.

Usage:
    python3 scripts/soak_driver.py --host 192.168.1.50 --duration 60 \
        --out soak_results/

No third-party dependencies. ECP is plain HTTP POST; the debug console is a
raw TCP stream.
"""

import argparse
import socket
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ECP_PORT = 8060
DEBUG_PORT = 8085

# Key names accepted by Roku ECP (keypress endpoint). NOTE: some firmware
# (onn. C302X, Roku OS 15.3.4) returns HTTP 400 for the "OK" alias; "Select"
# is the canonical name for the same key.
KEYS = [
    "Up", "Down", "Left", "Right", "Select", "Back", "Home",
    "Rev", "Fwd", "InstantReplay",
]


def press(host: str, key: str, timeout: float = 5.0) -> bool:
    """Send a single keypress to the device. Returns True on HTTP 200."""
    url = f"http://{host}:{ECP_PORT}/keypress/{key}"
    req = urllib.request.Request(url, data=b"", method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status == 200
    except Exception as exc:  # noqa: BLE001 - driver must survive network hiccups
        log(f"keypress {key} failed: {exc}")
        return False


class DebugTap:
    """Background reader for the telnet debug console on port 8085."""

    def __init__(self, host: str):
        self.host = host
        self.lines: list[str] = []
        self.sock: socket.socket | None = None

    def connect(self) -> bool:
        try:
            self.sock = socket.create_connection((self.host, DEBUG_PORT), timeout=5)
            self.sock.settimeout(0.2)
            return True
        except Exception as exc:  # noqa: BLE001
            log(f"debug console unavailable: {exc}")
            self.sock = None
            return False

    def drain(self) -> None:
        if self.sock is None:
            return
        buf = b""
        try:
            while True:
                chunk = self.sock.recv(4096)
                if not chunk:
                    break
                buf += chunk
        except socket.timeout:
            pass
        except Exception as exc:  # noqa: BLE001
            log(f"debug read error: {exc}")
        if buf:
            for line in buf.decode("utf-8", errors="replace").splitlines():
                self.lines.append(line)

    def close(self) -> None:
        if self.sock is not None:
            try:
                self.sock.close()
            except Exception:  # noqa: BLE001
                pass
            self.sock = None


def log(msg: str) -> None:
    print(f"[{datetime.now(timezone.utc).isoformat(timespec='seconds')}] {msg}",
          flush=True)


def phase_active(host: str, tap: DebugTap, seconds: int, rng_seed: int) -> None:
    """Random-walk the five tabs with OK presses, like the #11 chaos run."""
    import random
    rnd = random.Random(rng_seed)
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        key = rnd.choice(KEYS[:6])  # navigation keys only; Home would exit
        press(host, key)
        tap.drain()
        time.sleep(0.25)


def phase_idle(tap: DebugTap, seconds: int) -> None:
    """No input at all — exercises income/event timers and idle drift."""
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        tap.drain()
        time.sleep(1.0)


def write_transcript(out_dir: Path, tap: DebugTap, presses: list) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = out_dir / f"soak-{stamp}.log"
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("# RELAY-0 soak transcript\n")
        fh.write(f"# finished: {stamp}\n")
        fh.write(f"# keypresses: {len(presses)}\n\n")
        fh.write("## keypress log\n")
        for ts, key in presses:
            fh.write(f"{ts}\t{key}\n")
        fh.write("\n## debug console (port 8085)\n")
        for line in tap.lines:
            fh.write(line + "\n")
    return path


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--host", required=True, help="Roku device IP")
    ap.add_argument("--duration", type=int, default=60,
                    help="total soak minutes (default 60)")
    ap.add_argument("--active-share", type=float, default=0.4,
                    help="fraction of time spent in active input phases")
    ap.add_argument("--cycles", type=int, default=6,
                    help="active/idle cycles (default 6)")
    ap.add_argument("--seed", type=int, default=13, help="input RNG seed")
    ap.add_argument("--out", default="soak_results", help="output directory")
    args = ap.parse_args()

    total_s = args.duration * 60
    active_s = int(total_s * args.active_share) // max(args.cycles, 1)
    idle_s = (total_s - active_s * args.cycles) // max(args.cycles, 1)

    tap = DebugTap(args.host)
    presses: list = []

    log(f"connecting to {args.host} (ECP {ECP_PORT}, console {DEBUG_PORT})")
    if not tap.connect():
        log("FATAL: cannot read debug console; results would be unverifiable")
        return 2

    log(f"plan: {args.cycles} cycles of ~{active_s}s active / ~{idle_s}s idle, "
        f"total {args.duration} min")

    try:
        for cycle in range(args.cycles):
            log(f"cycle {cycle + 1}/{args.cycles}: active phase ({active_s}s)")
            phase_start = len(presses)
            deadline = time.monotonic() + active_s
            import random
            rnd = random.Random(args.seed + cycle)
            while time.monotonic() < deadline:
                key = rnd.choice(KEYS[:6])
                if press(args.host, key):
                    presses.append(
                        (datetime.now(timezone.utc).isoformat(timespec='seconds'),
                         key))
                tap.drain()
                time.sleep(0.25)
            log(f"  {len(presses) - phase_start} keypresses sent")

            log(f"cycle {cycle + 1}/{args.cycles}: idle phase ({idle_s}s)")
            phase_idle(tap, idle_s)
            tap.drain()
    except KeyboardInterrupt:
        log("interrupted — writing partial transcript")
    finally:
        tap.drain()
        path = write_transcript(Path(args.out), tap, presses)
        tap.close()

    log(f"{len(presses)} keypresses, {len(tap.lines)} console lines captured")
    log(f"transcript written: {path}")
    log("next: score against the gates in docs/LONG_SESSION.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
