---
name: trader-fno
description: >-
  F&O Analyst for Zerodha (NSE/BSE futures and options). Reads the positions
  file from Zerodha Console (Portfolio > Positions > F&O, XLSX or CSV), groups
  every leg by underlying (a short future and long calls on ASHOKLEY together),
  and shows today's P&L, net delta in rupees per Re 1, daily time decay, the
  payoff at expiry over a price range, break-even points, worst case, and
  warnings: expiry this week, options that lost most of their value, unlimited
  risk, futures MTM cash. Answers "what if it goes to 170 on Monday" for every
  leg. Calculates only; never places orders. Use when the user says "check my
  F&O", "my futures", "my options", "what if ASHOKLEY goes to", "break-even",
  "worst case", "how much do I lose per day", "payoff", uploads a Zerodha
  positions file, or names a contract like ASHOKLEY26DEC165CE.
argument-hint: "[positions file] [SYMBOL=PRICE]"
---

# trader-fno

Shows a beginner exactly how their futures and options work together, in
rupees, before they decide anything. It is a calculator, not an adviser.

`${CLAUDE_SKILL_DIR}` below is this skill's folder (where this SKILL.md lives).

```bash
python3 "${CLAUDE_SKILL_DIR}/fno.py" report positions.xlsx
python3 "${CLAUDE_SKILL_DIR}/fno.py" report positions.xlsx --holdings holdings.xlsx
python3 "${CLAUDE_SKILL_DIR}/fno.py" report positions.xlsx --only ASHOKLEY --range 15
python3 "${CLAUDE_SKILL_DIR}/fno.py" whatif positions.xlsx --at ASHOKLEY=170 --date 2026-11-23
python3 "${CLAUDE_SKILL_DIR}/fno.py" report positions.xlsx --price SAIL=125
```

## Getting the file

The user downloads it from console.zerodha.com: Portfolio > Positions > F&O >
download (XLSX). The holdings file (Portfolio > Holdings > download) adds
spot prices for stocks that have options but no future in the file. Live
prices are not fetched: when the user tells you a price ("ASHOKLEY now 168"),
pass it with `--price` or `--at`. Never ask for a Zerodha password, PIN or OTP.

## Steps

1. Run `report` on the file. Explain each underlying in plain words: what they
   hold, whether they gain when the price rises or falls (delta), how much the
   options lose per day if nothing moves (decay), break-even and worst case.
2. Read every `!` warning out. Expiry within a week and options that lost
   most of their value come first.
3. For "what if" questions run `whatif` with the price and the day.
4. Explain the user's own choices (hold, close, close part) with their numbers.
   Do not tell them which to pick. Say these are estimates and live prices
   are in Kite.

## How it works

- Symbols are parsed from Zerodha's format: `ASHOKLEY26DECFUT`,
  `ASHOKLEY26DEC165CE`, weekly `NIFTY2611320000CE`.
- Monthly expiry is taken as the last Tuesday of the month (NSE since
  September 2025). A holiday moves it earlier: `--expiry SYMBOL=YYYY-MM-DD`.
- Payoff at expiry is exact. Values before expiry (delta, decay, what-if) use
  Black-76 with each option's implied volatility solved from its last price,
  and a 6.5 % rate: good estimates, not quotes.
- Futures P&L is cash in or out every day (MTM); option gains are not cash
  until sold. The report says so whenever a future is in the book.

## What it never does

- Never places, changes or cancels an order. F&O orders are not in this pack's
  order path at all; the user places them in Kite.
- Never presents an estimate as a live price, and never says "buy" or "sell".

## Safety

Education and tooling, not financial advice. F&O can lose more than the money
put in. For decisions about large positions, suggest a SEBI-registered adviser.
