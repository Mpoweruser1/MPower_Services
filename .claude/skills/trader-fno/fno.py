#!/usr/bin/env python3
"""F&O position analyser for Zerodha (NSE/BSE). Standard library only.

It never talks to a broker and never places anything. It reads the positions
file you download from Zerodha Console (Portfolio > Positions > F&O, XLSX or
CSV), groups the legs by underlying (all ASHOKLEY futures and options together),
and works out:

  report    for each underlying: today's P&L, net delta (rupees per Re 1 move),
            daily time decay, the payoff at expiry over a price range, break-even
            points, worst and best case, and warnings (expiry soon, options that
            lost most of their value, unlimited risk, futures MTM in cash).
  whatif    the value of every leg if the underlying moves to a price you name,
            today or on a date you name, keeping each option's implied volatility.

    python3 fno.py report positions.xlsx
    python3 fno.py report positions.xlsx --holdings holdings.xlsx
    python3 fno.py report positions.xlsx --only ASHOKLEY --range 15
    python3 fno.py whatif positions.xlsx --at ASHOKLEY=170
    python3 fno.py whatif positions.xlsx --at ASHOKLEY=170 --date 2026-11-23
    python3 fno.py report positions.xlsx --price SAIL=125 --price TMPV=266.35

Prices: an underlying's futures price comes from a FUT leg in the file; for an
underlying with options only, give --price SYMBOL=VALUE or --holdings (the
Zerodha holdings file, previous closing price). Option values before expiry use
Black-76 with the implied volatility solved from each option's last price;
treat them as estimates. Expiry dates are worked out as the last Tuesday of the
month (NSE monthly F&O since September 2025; BSE uses Thursday); a trading
holiday moves it earlier, so pass --expiry SYMBOL=YYYY-MM-DD when it does.
"""

import argparse
import calendar
import csv
import datetime
import io
import json
import math
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

RATE = 0.065  # annual risk-free rate used for option values (about the Indian T-bill yield)
MONTHS = {m.upper(): i for i, m in enumerate(calendar.month_abbr) if m}
WEEKLY_MONTH = {str(i): i for i in range(1, 10)}
WEEKLY_MONTH.update({"O": 10, "N": 11, "D": 12})
MONTHLY = re.compile(r"^(?P<u>[A-Z][A-Z0-9&\-]*?)(?P<yy>\d{2})(?P<mon>JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)"
                     r"(?:(?P<k>\d+(?:\.\d+)?)(?P<cp>CE|PE)|(?P<fut>FUT))$")
WEEKLY = re.compile(r"^(?P<u>[A-Z][A-Z&\-]*?)(?P<yy>\d{2})(?P<m>[1-9OND])(?P<dd>\d{2})(?P<k>\d+(?:\.\d+)?)(?P<cp>CE|PE)$")


class FnoError(Exception):
    pass


# ---------------------------------------------------------------- reading files

def _xlsx_sheets(path):
    """{sheet name: [rows of cell values]} from an .xlsx, with zipfile + XML only."""
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
          "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
          "p": "http://schemas.openxmlformats.org/package/2006/relationships"}
    try:
        z = zipfile.ZipFile(path)
    except zipfile.BadZipFile:
        raise FnoError("%s is not an .xlsx file" % path)
    with z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", ns):
                shared.append("".join(t.text or "" for t in si.iter("{%s}t" % ns["m"])))
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        target = {r.get("Id"): r.get("Target") for r in rels.findall("p:Relationship", ns)}
        out = {}
        for sh in wb.find("m:sheets", ns).findall("m:sheet", ns):
            t = target.get(sh.get("{%s}id" % ns["r"]), "")
            t = t.lstrip("/")
            t = t if t.startswith("xl/") else "xl/" + t
            if t not in z.namelist():
                continue
            rows = []
            for row in ET.fromstring(z.read(t)).iter("{%s}row" % ns["m"]):
                cells = {}
                for c in row.findall("m:c", ns):
                    ref = re.match(r"([A-Z]+)", c.get("r", "A"))
                    col = 0
                    for ch in ref.group(1):
                        col = col * 26 + ord(ch) - 64
                    typ, v = c.get("t"), c.find("m:v", ns)
                    if typ == "s" and v is not None:
                        val = shared[int(v.text)]
                    elif typ == "inlineStr":
                        val = "".join(x.text or "" for x in c.iter("{%s}t" % ns["m"]))
                    elif v is not None and v.text is not None:
                        try:
                            val = float(v.text)
                        except ValueError:
                            val = v.text
                    else:
                        val = None
                    cells[col] = val
                if cells:
                    rows.append([cells.get(i) for i in range(1, max(cells) + 1)])
            out[sh.get("name")] = rows
        return out


def read_tables(path):
    """[(sheet name, rows)] from .xlsx, .csv or .json."""
    if not os.path.exists(path):
        raise FnoError("no file at %s" % path)
    low = path.lower()
    if low.endswith(".xlsx"):
        return list(_xlsx_sheets(path).items())
    if low.endswith(".csv"):
        with open(path, encoding="utf-8-sig", newline="") as fh:
            return [("csv", [r for r in csv.reader(fh)])]
    if low.endswith(".json"):
        with open(path, encoding="utf-8") as fh:
            doc = json.load(fh)
        rows = doc.get("positions", doc) if isinstance(doc, dict) else doc
        if not rows:
            return [("json", [])]
        head = list(rows[0].keys())
        return [("json", [head] + [[r.get(h) for h in head] for r in rows])]
    raise FnoError("use the .xlsx or .csv file from Zerodha Console (got %s)" % path)


def _num(v):
    if v is None or v == "" or v == "-":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(",", "").replace("₹", "").strip())
    except ValueError:
        return None


def _norm(h):
    return re.sub(r"[^a-z]", "", str(h or "").lower())


def _find_header(rows, must):
    for i, r in enumerate(rows):
        names = [_norm(c) for c in r]
        if all(m in names for m in must):
            return i, names
    return None, None


def as_of_date(tables):
    for _, rows in tables:
        for r in rows[:6]:
            for c in r:
                m = re.search(r"as on (\d{4}-\d{2}-\d{2})", str(c or ""))
                if m:
                    return m.group(1)
    return None


def read_positions(path):
    tables = read_tables(path)
    legs = []
    for _, rows in tables:
        i, names = _find_header(rows, ("symbol",))
        if i is None:
            continue
        col = {n: j for j, n in enumerate(names)}
        qty_col = next((col[n] for n in ("openquantity", "quantity", "netquantity", "qty") if n in col), None)
        avg_col = next((col[n] for n in ("openaverage", "averageprice", "avgprice", "average") if n in col), None)
        ltp_col = next((col[n] for n in ("previouscloseprice", "ltp", "lastprice", "closeprice", "previousclosingprice")
                        if n in col), None)
        side_col = next((col[n] for n in ("positiontype", "side", "type") if n in col), None)
        if qty_col is None or avg_col is None:
            continue
        for r in rows[i + 1:]:
            r = list(r) + [None] * (len(names) - len(r))
            sym = str(r[col["symbol"]] or "").strip().upper()
            q = _num(r[qty_col])
            if not sym or not q:
                continue
            side = str(r[side_col] or "").strip().lower() if side_col is not None else ""
            sign = -1 if side in ("sell", "short", "s") or q < 0 else 1
            leg = parse_symbol(sym)
            if leg is None:
                continue
            leg.update({"qty": abs(q) * sign, "avg": _num(r[avg_col]),
                        "ltp": _num(r[ltp_col]) if ltp_col is not None else None})
            legs.append(leg)
    if not legs:
        raise FnoError("found no F&O positions in %s (is it the Positions > F&O download?)" % path)
    return legs, as_of_date(tables)


def read_holdings_prices(path):
    prices = {}
    for _, rows in read_tables(path):
        i, names = _find_header(rows, ("symbol",))
        if i is None:
            continue
        col = {n: j for j, n in enumerate(names)}
        pc = next((col[n] for n in ("previousclosingprice", "previousclose", "ltp", "lastprice") if n in col), None)
        if pc is None:
            continue
        for r in rows[i + 1:]:
            r = list(r) + [None] * (len(names) - len(r))
            s, p = str(r[col["symbol"]] or "").strip().upper(), _num(r[pc])
            if s and p:
                prices[s] = p
    return prices


# ---------------------------------------------------------------- contracts

def last_weekday(year, month, weekday):
    d = datetime.date(year, month, calendar.monthrange(year, month)[1])
    while d.weekday() != weekday:
        d -= datetime.timedelta(days=1)
    return d


def parse_symbol(sym):
    """ASHOKLEY26DEC165CE -> {underlying, kind CE|PE|FUT, strike, expiry}. None if not F&O."""
    m = MONTHLY.match(sym)
    if m:
        y, mon = 2000 + int(m.group("yy")), MONTHS[m.group("mon")]
        exp = last_weekday(y, mon, calendar.TUESDAY)
        kind = "FUT" if m.group("fut") else m.group("cp")
        strike = float(m.group("k")) if m.group("k") else None
        return {"symbol": sym, "underlying": m.group("u"), "kind": kind, "strike": strike,
                "expiry": exp.isoformat(), "expiry_guessed": True}
    m = WEEKLY.match(sym)
    if m:
        try:
            exp = datetime.date(2000 + int(m.group("yy")), WEEKLY_MONTH[m.group("m")], int(m.group("dd")))
        except ValueError:
            return None
        return {"symbol": sym, "underlying": m.group("u"), "kind": m.group("cp"), "strike": float(m.group("k")),
                "expiry": exp.isoformat(), "expiry_guessed": False}
    return None


# ---------------------------------------------------------------- pricing

def _ncdf(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def black76(kind, F, K, T, vol, r=RATE):
    """Option value on a forward price F (Black-76). T in years."""
    intrinsic = max(F - K, 0.0) if kind == "CE" else max(K - F, 0.0)
    if T <= 0 or vol <= 0:
        return intrinsic
    sd = vol * math.sqrt(T)
    d1 = (math.log(F / K) + 0.5 * sd * sd) / sd
    d2 = d1 - sd
    df = math.exp(-r * T)
    if kind == "CE":
        return df * (F * _ncdf(d1) - K * _ncdf(d2))
    return df * (K * _ncdf(-d2) - F * _ncdf(-d1))


def implied_vol(kind, price, F, K, T):
    if price is None or T <= 0:
        return None
    if price <= black76(kind, F, K, T, 1e-4) + 1e-9:
        return None
    lo, hi = 1e-4, 5.0
    if black76(kind, F, K, T, hi) < price:
        return None
    for _ in range(100):
        mid = (lo + hi) / 2
        if black76(kind, F, K, T, mid) < price:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def years(from_date, to_date):
    """Calendar time to expiry at 15:30, in years."""
    a = datetime.date.fromisoformat(from_date)
    b = datetime.date.fromisoformat(to_date)
    return max((b - a).days + 0.25, 0.0) / 365.0 if b >= a else 0.0


# ---------------------------------------------------------------- the book

def group(legs):
    book = {}
    for l in legs:
        book.setdefault(l["underlying"], []).append(l)
    return book


def underlying_price(u, legs, prices):
    """(forward price for options, spot-ish reference, where it came from)."""
    futs = [l for l in legs if l["kind"] == "FUT" and l.get("ltp")]
    if futs:
        f = sorted(futs, key=lambda l: l["expiry"])[0]
        return f["ltp"], f["ltp"], "%s last price" % f["symbol"]
    if u in prices:
        return prices[u], prices[u], "price given for %s" % u
    return None, None, None


def leg_value(l, F, T):
    """Per-unit value of a leg at forward F with T years left (futures: F itself)."""
    if l["kind"] == "FUT":
        return F
    return black76(l["kind"], F, l["strike"], T, l.get("iv") or 0.0)


def leg_pnl_at_expiry(l, S):
    if l["kind"] == "FUT":
        v = S
    elif l["kind"] == "CE":
        v = max(S - l["strike"], 0.0)
    else:
        v = max(l["strike"] - S, 0.0)
    return (v - l["avg"]) * l["qty"]


def expiry_pnl(legs, S):
    return sum(leg_pnl_at_expiry(l, S) for l in legs)


def breakevens(legs, lo, hi):
    """Exact zero crossings of the piecewise-linear expiry payoff in [lo, hi]."""
    pts = sorted({lo, hi} | {l["strike"] for l in legs if l["strike"] and lo < l["strike"] < hi})
    out = []
    for a, b in zip(pts, pts[1:]):
        pa, pb = expiry_pnl(legs, a), expiry_pnl(legs, b)
        if pa == 0:
            out.append(a)
        if (pa < 0 < pb) or (pa > 0 > pb):
            out.append(a + (b - a) * (-pa) / (pb - pa))
    if expiry_pnl(legs, hi) == 0:
        out.append(hi)
    return sorted({round(x, 2) for x in out})


def tail_slopes(legs):
    """Rupees per Re 1 at expiry, far below and far above every strike."""
    up = sum(l["qty"] for l in legs if l["kind"] in ("FUT", "CE"))
    down = sum(l["qty"] for l in legs if l["kind"] == "FUT") - sum(l["qty"] for l in legs if l["kind"] == "PE")
    return down, up


def prepare(legs, as_of, prices, expiry_over):
    for l in legs:
        if l["underlying"] in expiry_over and l["expiry_guessed"]:
            l["expiry"], l["expiry_guessed"] = expiry_over[l["underlying"]], False
    book = group(legs)
    info = {}
    for u, ls in book.items():
        F, ref, src = underlying_price(u, ls, prices)
        for l in ls:
            l["T"] = years(as_of, l["expiry"])
            l["iv"] = None
            if l["kind"] != "FUT" and F:
                # options on spot: carry the spot to the option's expiry when no future is in the file
                Fo = F if src and "last price" in src else F * math.exp(RATE * l["T"])
                l["F"] = Fo
                l["iv"] = implied_vol(l["kind"], l["ltp"], Fo, l["strike"], l["T"])
        info[u] = {"F": F, "ref": ref, "src": src}
    return book, info


def greeks(legs, F, carry, T_shift=0.0):
    """Net delta (Rs per Re 1 move in the underlying) and theta (Rs per day)."""
    if not F:
        return None, None
    h = max(F * 0.001, 0.01)

    def val(f, dt=0.0):
        tot = 0.0
        for l in legs:
            T = max(l["T"] - T_shift - dt, 0.0)
            ff = f if l["kind"] == "FUT" or not carry else f * math.exp(RATE * T)
            tot += leg_value(l, ff, T) * l["qty"]
        return tot

    delta = (val(F + h) - val(F - h)) / (2 * h)
    theta = val(F, 1 / 365.0) - val(F)
    return delta, theta


def mtm(legs):
    return sum(((l["ltp"] if l["ltp"] is not None else l["avg"]) - l["avg"]) * l["qty"] for l in legs)


def warnings(u, legs, as_of, F, delta):
    out = []
    today = datetime.date.fromisoformat(as_of)
    for l in legs:
        days = (datetime.date.fromisoformat(l["expiry"]) - today).days
        if 0 <= days <= 7:
            out.append("%s expires in %d day%s (%s)" % (l["symbol"], days, "" if days == 1 else "s", l["expiry"]))
        if l["kind"] != "FUT" and l["qty"] > 0 and l["ltp"] is not None and l["avg"]:
            drop = 1 - l["ltp"] / l["avg"]
            if drop >= 0.5:
                out.append("%s has lost %.0f%% of what you paid (%s -> %s)"
                           % (l["symbol"], 100 * drop, rs(l["avg"]), rs(l["ltp"])))
        if l["kind"] != "FUT" and F and l["qty"] > 0 and 0 <= days <= 7:
            otm = (l["strike"] - F) / F if l["kind"] == "CE" else (F - l["strike"]) / F
            if otm > 0.05:
                out.append("%s is %.0f%% out of the money with %d days left; it expires worthless unless the "
                           "price moves past %s" % (l["symbol"], 100 * otm, days, rs(l["strike"])))
    down, up = tail_slopes(legs)
    if up < 0:
        out.append("UNLIMITED RISK if %s rises: you lose %s for every Re 1 up, with no cap"
                   % (u, rs(-up)))
    if down > 0:
        out.append("big downside: if %s falls you lose %s for every Re 1 down, with no floor until zero" % (u, rs(down)))
    if any(l["kind"] == "FUT" for l in legs):
        fq = sum(l["qty"] for l in legs if l["kind"] == "FUT")
        out.append("futures: %s of cash moves in or out of your account each day for every Re 1 the price moves "
                   "(MTM); option gains are not cash until you sell" % rs(abs(fq)))
    if any(l["kind"] != "FUT" and l["qty"] < 0 for l in legs):
        out.append("you have SOLD options: Zerodha blocks margin for them and the loss can grow fast")
    return out


# ---------------------------------------------------------------- output

def rs(v):
    v = float(v)
    neg = v < 0
    v = abs(v)
    whole = int(round(v))
    s = str(whole)
    if len(s) > 3:  # Indian grouping: 12,34,567
        head, tail = s[:-3], s[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ",".join(parts) + "," + tail
    if whole < 1000 and abs(v - whole) > 0.004:
        s = "%.2f" % v
    return ("-" if neg else "") + "₹" + s


def signed(v):
    v = round(float(v))
    return ("+" if v > 0 else "") + rs(v)


def describe(l):
    side = "LONG" if l["qty"] > 0 else "SHORT"
    what = "future" if l["kind"] == "FUT" else "%s %s" % (fmt_price(l["strike"]), "call" if l["kind"] == "CE" else "put")
    return "%-5s %8s  %-22s %-14s avg %-9s last %-9s exp %s" % (
        side, "{:,.0f}".format(abs(l["qty"])), l["symbol"], what, fmt_price(l["avg"]),
        fmt_price(l["ltp"]) if l["ltp"] is not None else "?", l["expiry"])


def fmt_price(v):
    return ("%.2f" % v).rstrip("0").rstrip(".") if v is not None else "?"


def price_grid(ref, legs, pct, steps=8):
    strikes = [l["strike"] for l in legs if l["strike"]]
    lo, hi = ref * (1 - pct / 100.0), ref * (1 + pct / 100.0)
    pts = set()
    for i in range(steps + 1):
        pts.add(lo + (hi - lo) * i / steps)
    for k in strikes:
        if lo <= k <= hi:
            pts.add(k)
    pts.add(ref)
    tick = 0.05
    return sorted({round(round(p / tick) * tick, 2) for p in pts})


def report_one(u, legs, info, as_of, pct):
    F, ref, src = info["F"], info["ref"], info["src"]
    lines = ["=" * 78, "%s  (%d leg%s)" % (u, len(legs), "" if len(legs) == 1 else "s"), "-" * 78]
    for l in sorted(legs, key=lambda l: (l["kind"] != "FUT", l["expiry"], l["strike"] or 0)):
        lines.append("  " + describe(l))
    lines.append("")
    lines.append("  P&L now (from the last prices in the file): %s" % signed(mtm(legs)))
    carry = bool(src and "last price" not in src)
    if F:
        delta, theta = greeks(legs, F, carry)
        lines.append("  Price used: %s (%s)" % (fmt_price(ref), src))
        lines.append("  Net delta:  %s per Re 1 move  (%s)" % (
            signed(delta), "you gain if the price RISES" if delta > 0 else "you gain if the price FALLS"))
        if any(l["kind"] != "FUT" for l in legs):
            lines.append("  Time decay: about %s per day if the price stays where it is" % signed(theta))
    else:
        lines.append("  No price for %s: give --price %s=VALUE (or --holdings) for delta, decay and what-if."
                     % (u, u))
    center = ref or (sorted(l["strike"] for l in legs if l["strike"])[len(legs) // 2]
                     if any(l["strike"] for l in legs) else None)
    if center:
        exps = sorted({l["expiry"] for l in legs})
        lines.append("")
        lines.append("  At expiry%s:" % (" (%s)" % exps[0] if len(exps) == 1 else
                                         " (each leg at its own expiry; legs expire on %s)" % ", ".join(exps)))
        grid = price_grid(center, legs, pct)
        vals = [(p, expiry_pnl(legs, p)) for p in grid]
        worst = min(vals, key=lambda x: x[1])
        best = max(vals, key=lambda x: x[1])
        for p, v in vals:
            tag = ""
            if ref and abs(p - ref) < 0.03:
                tag = "  <- now"
            if p == worst[0]:
                tag += "  <- worst in this range"
            lines.append("    %10s   %14s%s" % (fmt_price(p), signed(v), tag))
        be = breakevens(legs, grid[0], grid[-1])
        lines.append("  Break-even at expiry: %s" % (", ".join(fmt_price(b) for b in be) if be else
                                                    "none between %s and %s" % (fmt_price(grid[0]), fmt_price(grid[-1]))))
        down, up = tail_slopes(legs)
        lines.append("  Outside this range: each Re 1 the price FALLS changes P&L by %s; each Re 1 it RISES, by %s"
                     % (signed(-down), signed(up)))
        lines.append("  Worst in range %s at %s; best in range %s at %s" % (
            signed(worst[1]), fmt_price(worst[0]), signed(best[1]), fmt_price(best[0])))
    ws = warnings(u, legs, as_of, F, None)
    if ws:
        lines.append("")
        for w in ws:
            lines.append("  ! " + w)
    if any(l.get("expiry_guessed") for l in legs):
        lines.append("  (expiry taken as the last Tuesday of the month; a holiday moves it earlier: --expiry %s=YYYY-MM-DD)"
                     % u)
    return "\n".join(lines)


def whatif_one(u, legs, info, as_of, at, on_date):
    F, src = info["F"], info["src"]
    carry = bool(src and "last price" not in src)
    shift = years(as_of, on_date) if on_date and on_date > as_of else 0.0
    lines = ["=" * 78, "%s if the price is %s%s" % (u, fmt_price(at), (" on %s" % on_date) if on_date else " today"),
             "-" * 78, "  %-22s %10s %10s %14s %14s" % ("leg", "now", "then", "change", "P&L vs avg")]
    tot_change = tot_pnl = 0.0
    for l in legs:
        T = max(l["T"] - shift, 0.0)
        if l["kind"] == "FUT":
            then = at
        else:
            if l.get("iv") is None and T > 0:
                lines.append("  %-22s could not read its volatility from the last price; shown at expiry value" % l["symbol"])
            ff = at * math.exp(RATE * T) if carry else at
            then = black76(l["kind"], ff, l["strike"], T, l.get("iv") or 0.0)
        now = l["ltp"] if l["ltp"] is not None else l["avg"]
        ch = (then - now) * l["qty"]
        pnl = (then - l["avg"]) * l["qty"]
        tot_change += ch
        tot_pnl += pnl
        lines.append("  %-22s %10s %10s %14s %14s" % (l["symbol"], fmt_price(now), fmt_price(round(then, 2)),
                                                      signed(ch), signed(pnl)))
    lines.append("  %-22s %10s %10s %14s %14s" % ("TOTAL", "", "", signed(tot_change), signed(tot_pnl)))
    lines.append("  (option prices are Black-76 estimates at each option's current implied volatility)")
    return "\n".join(lines)


# ---------------------------------------------------------------- commands

def _kv(items, what, conv):
    out = {}
    for it in items or []:
        if "=" not in it:
            raise FnoError("%s must look like SYMBOL=VALUE, got %r" % (what, it))
        k, v = it.split("=", 1)
        try:
            out[k.strip().upper()] = conv(v.strip())
        except ValueError:
            raise FnoError("bad value in %s %r" % (what, it))
    return out


def _date(s):
    datetime.date.fromisoformat(s)
    return s


def load(a):
    legs, as_of = read_positions(a.positions)
    as_of = a.as_of or as_of or datetime.date.today().isoformat()
    prices = read_holdings_prices(a.holdings) if a.holdings else {}
    prices.update(_kv(a.price, "--price", float))
    book, info = prepare(legs, as_of, prices, _kv(a.expiry, "--expiry", _date))
    if a.only:
        want = {s.upper() for s in a.only}
        book = {u: l for u, l in book.items() if u in want}
        if not book:
            raise FnoError("none of %s is in the file" % ", ".join(sorted(want)))
    return book, info, as_of


def cmd_report(a):
    book, info, as_of = load(a)
    if a.json:
        out = {}
        for u, ls in book.items():
            F = info[u]["F"]
            carry = bool(info[u]["src"] and "last price" not in info[u]["src"])
            d, t = greeks(ls, F, carry)
            out[u] = {"mtm": round(mtm(ls), 2), "price": info[u]["ref"], "delta": d, "theta_per_day": t,
                      "legs": [{k: l[k] for k in ("symbol", "kind", "strike", "expiry", "qty", "avg", "ltp", "iv")}
                               for l in ls], "warnings": warnings(u, ls, as_of, F, d)}
        print(json.dumps({"as_of": as_of, "underlyings": out}, indent=2))
        return 0
    print("F&O positions as of %s. Estimates for learning, not advice; check live prices in Kite." % as_of)
    total = 0.0
    for u in sorted(book, key=lambda u: -abs(mtm(book[u]))):
        print(report_one(u, book[u], info[u], as_of, a.range))
        total += mtm(book[u])
    print("=" * 78)
    print("Total P&L now across these positions: %s" % signed(total))
    return 0


def cmd_whatif(a):
    book, info, as_of = load(a)
    at = _kv(a.at, "--at", float)
    if not at:
        raise FnoError("say the price: --at SYMBOL=PRICE")
    for u, price in at.items():
        if u not in book:
            raise FnoError("%s is not in the file" % u)
        print(whatif_one(u, book[u], info[u], as_of, price, a.date))
    print("Estimates for learning, not advice.")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description="Zerodha F&O position analyser (trader-fno). Never places orders.")
    sub = ap.add_subparsers(dest="cmd")

    def common(p):
        p.add_argument("positions", help="Zerodha Console positions file (.xlsx or .csv)")
        p.add_argument("--holdings", help="Zerodha holdings file, for spot prices of option-only stocks")
        p.add_argument("--price", action="append", help="SYMBOL=PRICE for an underlying (repeatable)")
        p.add_argument("--expiry", action="append", help="SYMBOL=YYYY-MM-DD when a holiday moves expiry")
        p.add_argument("--as-of", help="YYYY-MM-DD the prices are from (default: the file's date)")
        p.add_argument("--only", nargs="+", help="only these underlyings")

    p = sub.add_parser("report", help="P&L, delta, decay, payoff at expiry and warnings")
    common(p)
    p.add_argument("--range", type=float, default=12.0, help="price range around now, in percent (default 12)")
    p.add_argument("--json", action="store_true")
    p = sub.add_parser("whatif", help="value every leg at a price you name")
    common(p)
    p.add_argument("--at", action="append", help="SYMBOL=PRICE (repeatable)")
    p.add_argument("--date", type=_date, help="YYYY-MM-DD (default: the file's date)")
    a = ap.parse_args(argv)
    if not a.cmd:
        ap.print_help()
        return 1
    try:
        return {"report": cmd_report, "whatif": cmd_whatif}[a.cmd](a)
    except FnoError as e:
        print("fno.py: %s" % e, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
