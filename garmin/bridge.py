#!/usr/bin/env python3
"""
Garmin Connect helper for the dashboard (uses the unofficial `garminconnect` library).

The Node server runs this script; input arrives as JSON on stdin and the result is one JSON
object on stdout. Progress lines go to stderr as JSON too.

Commands:
  login    {"email", "password"}          -> {"ok"} | {"needs_mfa", "state"}
  mfa      {"state", "code"}               -> {"ok"}
  check    {}                              -> {"ok", "full_name", "display_name"}
  sync     {see run_sync}                  -> {"ok", "meta": [...], "health": {...}, ...}
  logout   {}                              -> {"ok"}

Tokens are stored in $GARMIN_DIR/tokens (default /data/garmin/tokens). The password is never
written to disk; it is only held in memory for the duration of the login call.
For an interactive login from a terminal (Portainer > container > Console):
  python3 /app/garmin/bridge.py login-cli
"""
from __future__ import annotations

import json
import os
import sys
import time
import traceback
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

GARMIN_DIR = Path(os.environ.get("GARMIN_DIR", "/data/garmin"))
TOKEN_DIR = GARMIN_DIR / "tokens"
STATE_FILE = GARMIN_DIR / "state.json"
PAUSE = float(os.environ.get("GARMIN_REQUEST_PAUSE", "0.6"))


def out(obj):
    sys.stdout.write(json.dumps(obj, default=str) + "\n")
    sys.stdout.flush()


def progress(message, **kw):
    sys.stderr.write(json.dumps({"progress": message, **kw}) + "\n")
    sys.stderr.flush()


def load_state():
    try:
        return json.loads(STATE_FILE.read_text())
    except Exception:
        return {}


def save_state(state):
    GARMIN_DIR.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state))
    tmp.replace(STATE_FILE)


def import_lib():
    try:
        import garminconnect  # noqa: F401
        from garminconnect import (  # noqa: F401
            Garmin,
            GarminConnectAuthenticationError,
            GarminConnectConnectionError,
            GarminConnectTooManyRequestsError,
        )
        return garminconnect
    except ImportError as e:
        raise SystemExit(json.dumps({"error": f"garminconnect library missing: {e}"}))


def classify(e):
    from garminconnect import GarminConnectAuthenticationError, GarminConnectTooManyRequestsError

    if isinstance(e, GarminConnectAuthenticationError):
        return "auth"
    if isinstance(e, GarminConnectTooManyRequestsError):
        return "rate_limit"
    msg = str(e)
    if "401" in msg or "403" in msg:
        return "auth"
    if "429" in msg or "427" in msg:
        return "rate_limit"
    return "error"


def save_tokens(garmin):
    TOKEN_DIR.mkdir(parents=True, exist_ok=True)
    garmin.client.dump(str(TOKEN_DIR))


def logged_in_client():
    from garminconnect import Garmin

    if not TOKEN_DIR.exists():
        raise RuntimeError("not_logged_in")
    g = Garmin()
    g.login(str(TOKEN_DIR))
    return g


def profile_info(g):
    info = {"full_name": getattr(g, "full_name", None), "display_name": getattr(g, "display_name", None)}
    try:
        p = g.get_user_profile() or {}
        ud = p.get("userData") or {}
        info["profile"] = {
            k: ud.get(k)
            for k in (
                "gender", "weight", "height", "birthDate", "vo2MaxRunning", "vo2MaxCycling",
                "lactateThresholdHeartRate", "lactateThresholdSpeed", "measurementSystem",
            )
            if ud.get(k) is not None
        }
    except Exception:
        pass
    return info


# --- commands -------------------------------------------------------------------------------

def cmd_login(args):
    from garminconnect import Garmin

    email, password = args.get("email"), args.get("password")
    if not email or not password:
        return out({"error": "Email and password are required"})
    g = Garmin(email, password, return_on_mfa=True)
    try:
        status, state = g.login()
    except Exception as e:
        return out({"error": str(e).splitlines()[0][:300], "kind": classify(e)})
    if status == "needs_mfa":
        return out({"needs_mfa": True, "state": state})
    save_tokens(g)
    try:
        g2 = logged_in_client()
        return out({"ok": True, **profile_info(g2)})
    except Exception:
        return out({"ok": True})


def cmd_mfa(args):
    from garminconnect import Garmin

    g = Garmin(return_on_mfa=True)
    try:
        g.resume_login(args["state"], str(args.get("code", "")).strip())
    except Exception as e:
        return out({"error": str(e).splitlines()[0][:300], "kind": classify(e)})
    save_tokens(g)
    return out({"ok": True, **profile_info(g)})


def cmd_login_cli(_args):
    """Interactive login for terminals (Portainer console)."""
    import getpass
    from garminconnect import Garmin

    email = input("Garmin email: ").strip()
    password = getpass.getpass("Garmin password: ")
    g = Garmin(email, password, prompt_mfa=lambda: input("MFA code: ").strip())
    try:
        g.login()
    except Exception as e:
        print(f"Login failed: {e}")
        sys.exit(1)
    save_tokens(g)
    print(f"Logged in as {getattr(g, 'full_name', None) or email}. Tokens saved to {TOKEN_DIR}.")
    print("Click 'Sync now' in the dashboard.")


def cmd_check(_args):
    try:
        g = logged_in_client()
    except Exception as e:
        return out({"error": str(e)[:300], "kind": "auth" if "not_logged_in" in str(e) else classify(e)})
    save_tokens(g)  # persist refreshed tokens
    return out({"ok": True, **profile_info(g)})


def cmd_logout(_args):
    import shutil

    shutil.rmtree(TOKEN_DIR, ignore_errors=True)
    try:
        STATE_FILE.unlink()
    except FileNotFoundError:
        pass
    return out({"ok": True})


# --- sync -------------------------------------------------------------------------------------

def parse_gmt(s):
    """'2024-05-01 06:12:33' (GMT) -> unix seconds"""
    if not s:
        return None
    try:
        return int(datetime.strptime(s[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc).timestamp())
    except ValueError:
        return None


def local_iso(s):
    if not s:
        return None
    return s[:19].replace(" ", "T") + "Z"


def num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def norm_summary(d, s):
    if not s:
        return
    mapping = {
        "steps": "totalSteps", "step_goal": "dailyStepGoal", "distance": "totalDistanceMeters",
        "kcal_total": "totalKilocalories", "kcal_active": "activeKilocalories", "rhr": "restingHeartRate",
        "hr_min": "minHeartRate", "hr_max": "maxHeartRate", "stress_avg": "averageStressLevel",
        "stress_max": "maxStressLevel", "bb_high": "bodyBatteryHighestValue", "bb_low": "bodyBatteryLowestValue",
        "bb_charged": "bodyBatteryChargedValue", "bb_drained": "bodyBatteryDrainedValue",
        "floors": "floorsAscended", "mod_min": "moderateIntensityMinutes", "vig_min": "vigorousIntensityMinutes",
        "spo2": "averageSpo2", "resp": "avgWakingRespirationValue",
    }
    for k, src in mapping.items():
        v = num(s.get(src))
        if v is not None and v >= 0:
            d[k] = v


def norm_sleep(d, s):
    dto = (s or {}).get("dailySleepDTO") or {}
    mapping = {
        "sleep_s": "sleepTimeSeconds", "deep_s": "deepSleepSeconds", "light_s": "lightSleepSeconds",
        "rem_s": "remSleepSeconds", "awake_s": "awakeSleepSeconds", "sleep_start": "sleepStartTimestampLocal",
        "sleep_end": "sleepEndTimestampLocal",
    }
    for k, src in mapping.items():
        v = num(dto.get(src))
        if v is not None:
            d[k] = v
    score = ((dto.get("sleepScores") or {}).get("overall") or {}).get("value")
    if num(score) is not None:
        d["sleep_score"] = score
    if num(dto.get("averageSpO2Value")) is not None:
        d.setdefault("spo2", dto["averageSpO2Value"])
    if num(dto.get("averageRespirationValue")) is not None:
        d["resp"] = dto["averageRespirationValue"]


def norm_hrv(d, h):
    summ = (h or {}).get("hrvSummary") or {}
    if num(summ.get("lastNightAvg")) is not None:
        d["hrv"] = summ["lastNightAvg"]
    if num(summ.get("weeklyAvg")) is not None:
        d["hrv_weekly"] = summ["weeklyAvg"]
    if summ.get("status"):
        d["hrv_status"] = summ["status"]


def run_sync(args):
    """
    args:
      known_ids:      Garmin activity ids already in the dashboard
      known_starts:   activity start times (unix s) already in the dashboard (e.g. from a FIT import)
      inbox:          folder to write downloaded activity zips into
      max_downloads:  max original files to download this run
      health_days:    how many days of health history to keep in sync
      health_have:    dates (YYYY-MM-DD) already stored and final
      health_budget:  max days of health history to fetch this run
    """
    from garminconnect import Garmin

    try:
        g = logged_in_client()
    except Exception as e:
        return out({"error": str(e)[:300], "kind": "auth" if "not_logged_in" in str(e) else classify(e)})

    state = load_state()
    known_ids = set(int(x) for x in args.get("known_ids", []))
    known_starts = sorted(int(x) for x in args.get("known_starts", []))
    inbox = Path(args.get("inbox", "/data/inbox"))
    inbox.mkdir(parents=True, exist_ok=True)
    max_downloads = int(args.get("max_downloads", 150))
    result = {"ok": True, "meta": [], "health": {}, "downloaded": 0, "warnings": []}
    result.update(profile_info(g))

    import bisect

    def start_known(ts):
        if ts is None:
            return False
        i = bisect.bisect_left(known_starts, ts - 90)
        return i < len(known_starts) and known_starts[i] <= ts + 90

    stop_reason = None
    history_done = bool(state.get("history_done"))

    # 1) Activities: newest first, download the original FIT for anything new.
    try:
        offset, page_size, budget_hit = 0, 100, False
        while True:
            progress("Listing activities", offset=offset)
            page = g.get_activities(offset, page_size) or []
            time.sleep(PAUSE)
            if not page:
                if not budget_hit:
                    history_done = True
                break
            page_all_known = True
            for a in page:
                aid = a.get("activityId")
                start = parse_gmt(a.get("startTimeGMT"))
                if not aid or start is None:
                    continue
                event = ((a.get("eventType") or {}).get("typeKey") or "").lower()
                result["meta"].append({
                    "start": start, "id": aid, "name": a.get("activityName"),
                    "type": (a.get("activityType") or {}).get("typeKey"), "race": event == "race",
                    "local": local_iso(a.get("startTimeLocal")),
                })
                if aid in known_ids or start_known(start):
                    continue
                page_all_known = False
                if result["downloaded"] >= max_downloads:
                    budget_hit = True
                    continue
                progress("Downloading activity", id=aid, name=a.get("activityName"))
                try:
                    data = g.download_activity(aid, dl_fmt=Garmin.ActivityDownloadFormat.ORIGINAL)
                    tmp = inbox / f"garmin-{aid}.zip.part"
                    tmp.write_bytes(data)
                    tmp.replace(inbox / f"garmin-{aid}.zip")
                    result["downloaded"] += 1
                except Exception as e:
                    kind = classify(e)
                    if kind in ("auth", "rate_limit"):
                        raise
                    result["warnings"].append(f"activity {aid}: {str(e)[:120]}")
                time.sleep(PAUSE)
            if page_all_known and history_done:
                break  # incremental sync: everything older is already here
            if len(page) < page_size:
                if not budget_hit:
                    history_done = True
                break
            offset += page_size
    except Exception as e:
        kind = classify(e)
        if kind == "auth":
            return out({"error": "Garmin rejected the saved login. Please log in again.", "kind": "auth"})
        stop_reason = f"activities: {str(e).splitlines()[0][:200]}"
        if kind == "rate_limit":
            stop_reason = "Garmin rate limit reached; will continue next sync"
    result["more_activities"] = not history_done
    state["history_done"] = history_done

    # 2) Health / wellness, one day at a time (newest first).
    health_days = int(args.get("health_days", 365))
    budget = int(args.get("health_budget", 45))
    have = set(args.get("health_have", []))
    today = date.today()
    wanted = []
    for i in range(health_days):
        d = (today - timedelta(days=i)).isoformat()
        if i <= 2 or d not in have:  # the last few days are always refreshed (they change)
            wanted.append(d)
    wanted = wanted[: budget + 3]
    if stop_reason is None and health_days > 0:
        try:
            for i, d in enumerate(wanted):
                progress("Health data", date=d, index=i, total=len(wanted))
                day = {"date": d}
                for fn, norm in ((g.get_user_summary, norm_summary), (g.get_sleep_data, norm_sleep), (g.get_hrv_data, norm_hrv)):
                    try:
                        norm(day, fn(d))
                    except Exception as e:
                        if classify(e) in ("auth", "rate_limit"):
                            raise
                    time.sleep(PAUSE)
                day["final"] = d < (today - timedelta(days=2)).isoformat()
                result["health"][d] = day
        except Exception as e:
            stop_reason = "Garmin rate limit reached; will continue next sync" if classify(e) == "rate_limit" else f"health: {str(e)[:200]}"

    # 3) VO2 max history + race predictions, at most once a day.
    if stop_reason is None and state.get("metrics_day") != today.isoformat():
        try:
            progress("VO2 max and race predictions")
            vo2 = {}
            start = today - timedelta(days=max(30, min(health_days, 3 * 365)))
            cur = start
            while cur <= today:
                end = min(today, cur + timedelta(days=89))
                try:
                    rows = g.get_max_metrics_range(cur.isoformat(), end.isoformat()) or []
                except Exception as e:
                    if classify(e) in ("auth", "rate_limit"):
                        raise
                    rows = []
                if isinstance(rows, dict):
                    rows = rows.get("maxMetrics") or rows.get("data") or [rows]
                for r in rows if isinstance(rows, list) else []:
                    gen = (r or {}).get("generic") or {}
                    cyc = (r or {}).get("cycling") or {}
                    dd = gen.get("calendarDate") or cyc.get("calendarDate")
                    if not dd:
                        continue
                    v = vo2.setdefault(dd, {})
                    if num(gen.get("vo2MaxPreciseValue") or gen.get("vo2MaxValue")) is not None:
                        v["vo2max"] = gen.get("vo2MaxPreciseValue") or gen.get("vo2MaxValue")
                    if num(cyc.get("vo2MaxPreciseValue") or cyc.get("vo2MaxValue")) is not None:
                        v["vo2max_cycling"] = cyc.get("vo2MaxPreciseValue") or cyc.get("vo2MaxValue")
                cur = end + timedelta(days=1)
                time.sleep(PAUSE)
            result["vo2max"] = vo2
            try:
                result["race_predictions"] = {"latest": g.get_race_predictions()}
                time.sleep(PAUSE)
                result["race_predictions"]["history"] = g.get_race_predictions(
                    (today - timedelta(days=365)).isoformat(), today.isoformat(), "monthly"
                )
            except Exception as e:
                if classify(e) in ("auth", "rate_limit"):
                    raise
            state["metrics_day"] = today.isoformat()
        except Exception as e:
            stop_reason = "Garmin rate limit reached; will continue next sync" if classify(e) == "rate_limit" else f"metrics: {str(e)[:200]}"

    try:
        save_tokens(g)
    except Exception:
        pass
    save_state(state)
    if stop_reason:
        result["warnings"].append(stop_reason)
    out(result)


COMMANDS = {"login": cmd_login, "mfa": cmd_mfa, "check": cmd_check, "sync": run_sync, "logout": cmd_logout, "login-cli": cmd_login_cli}

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd not in COMMANDS:
        print(f"usage: bridge.py {{{'|'.join(COMMANDS)}}}", file=sys.stderr)
        sys.exit(2)
    import_lib()
    args = {}
    if cmd != "login-cli":
        raw = sys.stdin.read()
        args = json.loads(raw) if raw.strip() else {}
    try:
        COMMANDS[cmd](args)
    except SystemExit:
        raise
    except Exception as e:  # last resort: always answer with JSON
        traceback.print_exc(file=sys.stderr)
        out({"error": str(e)[:300], "kind": "error"})
