# LEAPS Book - Trading Rules - v1.3

Status: **approved 2026-10-25 (v1.0); v1.1 the same day changes only the backtest's price model (section 9); v1.2 (later the same day) adds the index book (section 6b), T-bill interest on idle cash and the daily LEAPS quote grid (section 10); v1.3 splits the index book into IS (SPY) and IQ (QQQ) - see the change log.** Thresholds marked *(proposed)* were suggested and accepted as written. The rules are frozen in code (`LEAPS_RULES_VERSION`) and versioned like `docs/release2-trading-rules.md`: any later change gets a new version and is re-tested.

**Idea:** buy long-dated calls (LEAPS) on high-quality large caps only when the market is down, take half off at +100%, and let the rest run.

---

## 1. Universe - "bulletproof" companies

A ticker is eligible on a given day only when **all** hold:

1. US-listed common stock filing 10-Q/10-K (no ADRs, no ETFs). Same SEC classification as the Fundamentals page.
2. Market cap **>= $100B** *(proposed)* = SEC shares outstanding x close price on that day.
3. Positive operating income in each of the last **4 quarters** (SEC `sec_quarters`). Banks and insurers file no operating income line, so net income is used for them.
4. Revenue in the latest quarter above the same quarter a year earlier.
5. Stock's IV30 **<= 2.25x VIX** (= 45% when VIX is 20) *(proposed)* - keeps meme-like volatility out even among large caps. Measured against VIX rather than a fixed 45% so that a market-wide panic (VIX 40+), exactly when this book wants to buy, does not rule out every stock.
6. LEAPS liquidity at the chosen contract: open interest **>= 500**, bid-ask spread **<= 5% of mid** *(proposed)*.

Candidate list: S&P 100 constituents plus other US large caps (`backend/src/leaps/universe.ts`, update annually like the holiday calendar), filtered daily by the checks above. SEC data is refreshed by the 07:00 SEC job. Checks 3-4 use only quarters that had been filed by the decision date: a quarter counts from 65 days after its end (no look-ahead).

---

## 2. Market condition - when to buy

New entries only while the market is down:

| State | Condition | Size allowed |
| --- | --- | --- |
| **Correction** | SPY close >= **10%** below its 52-week high | Full |
| **Pullback** | SPY 5-10% below its high **and** (VIX > 20 **or** Market Quality Score < 60) | Half |

The backtest has no history of the Market Quality Score, so there Pullback = SPY 5-10% off **and** VIX > 20.
| Normal | Anything else | No new entries (held positions are unaffected) |

And the stock itself must be **>= 15%** below its own 52-week high *(proposed)*.

---

## 3. Confirmation from Signa data (forward / paper only)

Recorded for every entry as `confirmed: yes/no` plus the details; **does not block an entry** so results can be split confirmed vs unconfirmed later:

- Dark pool buy share **>= 55%** over the last 3 sessions (`dp_daily`).
- Flow-alert premium call-heavy (calls >= 1.5x puts) over the last 5 sessions.
- Any stored raw-flow print **>= $250k in a call expiring >= 365 days out** in the last 10 sessions ("LEAPS whale print").
- **Confirmed** = dark pool buying **and** (call-heavy flow **or** a LEAPS whale print).
- Dark pool and flow alerts are only collected for tracked symbols (core + scanner-promoted), so most LEAPS names show "no data" for those two; raw flow is market-wide. No extra Signa calls are made for this.

Not available in the historical backtest (data only exists since collection started in October 2026).

---

## 4. Contract selection

1. Expiry: the first standard monthly expiry **>= 15 months** (457 days) out; if none is listed within 15-27 months, skip ("no LEAPS expiry").
2. Strike: call with delta closest to the book's target (section 6).
3. Buy at the **ask**, next session's close quotes (same fill rule as release 2, rule 1.4).
4. Commissions as in Settings (US$1.00 per contract per leg, each way).

---

## 5. Sizing and limits *(all proposed)*

- Book: **$50,000** starting balance, editable in Settings (intended range $25,000-$50,000). Paper results also report which entries a $25,000 book could not have afforded, so the gap between the two sizes is visible.
- Premium paid = the trade's full risk.
- Max **10% of book balance** per position (half that in Pullback state).
- Max **8 open positions**; max **60%** of the balance in open premium; **1 position per ticker**.
- At least **2 contracts** are needed so half can be sold; otherwise skip ("too expensive for split").
- Earnings: an 18-month option is not exposed to IV crush the way a 30-day one is, so **no earnings blackout** for LEAPS (unlike release 2 section 5).

---

## 6. Strike variants - three books

You weren't sure which strike to use, so the backtest runs the same entries through three books and compares them:

| Book | Target delta | Character |
| --- | --- | --- |
| **L1** | 0.75 (deep ITM) | Stock replacement, little time decay; +100% needs a large stock move |
| **L2** | 0.50 (ATM) | Balanced |
| **L3** | 0.30 (OTM) | Cheap, most leverage; expires worthless more often |

---

## 6b. Index books IS (SPY) and IQ (QQQ), always held (v1.2, split in v1.3)

**Idea:** from the 2026-10-25 research (below), the only LEAPS approach that beat its own index at equal risk in both 2016-2021 and 2022-2026: hold deep ITM index calls all the time instead of picking stocks in dips. Two separate books, each with its own balance, so each is judged against its own index.

| Book | Holds | Compared with |
| --- | --- | --- |
| **IS** | one SPY LEAPS | SPY (total return) |
| **IQ** | one QQQ LEAPS | QQQ (total return) |

- **Always invested:** the book's one call is **30% of its equity** when bought; the other ~70% earns the 13-week T-bill rate.
- **Contract:** first standard monthly expiry **500-900 days** out, delta nearest **0.85**. Spread <= 5% of mid; no open-interest floor (index options).
- **Exit:** only the time exit - sold with **120 days** left and replaced in the same session (a roll). No half sale, no stop, no quality check, no market-state condition. 500+ days at purchase means every position is held more than 12 months (CGT discount).
- **Size:** one 0.85-delta SPY or QQQ LEAPS costs ~$20,000, so 30% buys one whole contract only from a book of ~$65,000-70,000. Below that the paper book holds **fractional contracts** (tracked to 4 decimals) and the page shows the book size needed; a real account of $25-50k could not hold this book as specified.
- **Results (modeled prices, 2016-10 -> 2026-10, total return):** IS CAGR 14.8%, max drawdown 26%, vs SPY 15.3% / 34%. IQ CAGR 20.6% / 28% vs QQQ 20.3% / 35%. So: about the index's return with a drawdown ~8 points smaller. Against its own index leveraged to the same drawdown: SPY +5.5 / +0.9 points a year (2016-2021 / 2022-2026), QQQ +4.8 / +1.1. The edge is largest in crashes (a call cannot lose more than its premium) and small since 2022; it may be noise.
- v1.2 held both indexes in one book (IX, 15% each); IX backtest runs stay readable but are no longer produced.

---

## 7. Exits

Checked daily after the close; fills at the next session's close bid.

1. **Take half at +100%:** option value >= 2x entry cost -> sell half the contracts (rounded down). The rest is the "runner".
2. **Stop - time AND loss:** more than **half the time from entry to expiry** has passed **and** value <= **50%** of entry -> close everything. No stop before the halfway point.
3. **Runner exit:** after at least **6 months** held, close the runner when its value falls **40%** from its highest close since the half sale *(proposed)*.
4. **Time exit:** **120 days** left to expiry -> close everything *(proposed)*. Time decay speeds up sharply after this.
5. **Quality break:** the company fails checks 1.3 or 1.4 (losses or shrinking revenue) at a new filing -> close everything.

Tax note: in many countries a holding of 12+ months gets a lower capital-gains rate. Not modeled; the runner rule can add a 12-month minimum hold if that applies to you.

---

## 8. Price levels shown for every proposed trade and open position

For each proposed contract (and each open paper position, using its actual fill):

| Level | Meaning |
| --- | --- |
| **Break-even at expiry** | strike + premium paid (+ commissions per share) |
| **Break-even today** | stock price at which the option is worth what was paid, if IV stays the same (Black-Scholes, solved for the stock price) |
| **+100% at expiry** | strike + 2x premium |
| **+100% today** | stock price at which the option is worth 2x what was paid today, same IV |
| **+100% in 6 months** | same, with 6 months less time left (the runner's minimum hold) |
| **Sell limit for half** | option limit price = 2x the premium paid per share - the order to place right after the fill |

The "today" levels move as time passes and IV changes, so they are recalculated every day from that day's quote.

---

## 9. Backtest (historical replay)

- Period: **2016-10 to 2026-10** (covers the 2018 Q4, 2020, 2022 and 2025 drawdowns). Daily bars from Yahoo.
- **No historical LEAPS quotes exist in our data**, so prices are **modeled**: Black-Scholes with
  - IV = (0.07 + 0.75 x stock's 1-year realized vol) x sqrt(VIX6M / 22), the last factor clamped to 0.75-2. Fitted on 2026-10-23 to the real Cboe 15-27 month at-the-money IV of 20 names (SPY, AAPL, MSFT, NVDA ... AMD), which it matches within a few points. `^VIX6M` (6-month VIX) sets the stress level because 18-month IV rises far less than 30-day VIX in a panic.
  - risk-free rate from `^IRX`, dividends ignored
  - half-spread of 2% of mid (min $0.05) on every fill
- Volatility check (1.5) in the backtest: stock's 1-year realized vol / VIX <= 2.25, standing in for the live IV30 / VIX.
- Market cap in the backtest: today's market cap scaled by the (split-adjusted) price, so buybacks and dilution are ignored.
- Idle cash earns the 13-week T-bill rate (`^IRX`) every session (v1.2; v1.0-1.1 earned nothing).
- Sells decided for a session fill before that session's buys, so a roll's proceeds pay for its replacement.
- The SPY comparison is total return (dividends reinvested, Yahoo adjusted close); v1.0-1.1 compared against SPY's price only, about 1.3 points a year too low.
- Strikes snapped to a realistic grid ($5 under $200, $10 above).
- Backtest sizes in **fractional contracts** so the three books compare the strategy itself; paper trading (section 9) uses whole contracts.
- Calibration: from now on the collector records real LEAPS quotes; the model's prices are compared against them and the error reported on the Performance page.

---

## 10. Paper (forward) trading

- Same rules on live data: daily screener of eligible names in Correction/Pullback, Signa confirmation from section 3, real Cboe LEAPS quotes.
- Collector job `leaps` at close + 45 min: one Cboe chain request per name in the candidate list plus SPY and QQQ (~125). No Signa calls.
- Stored in `leaps_quotes`: the contract chosen for each book, every held contract, and the **research grid** (`grid = true`, from v1.2): on every standard monthly expiry 270+ days out, the call nearest each of deltas 0.20 / 0.30 / 0.40 / 0.50 / 0.60 / 0.75 / 0.85, with bid, ask, IV, delta, open interest and the stock price. About 4,000 rows a session (~1 million a year). Purpose: check and refit the backtest's LEAPS price model (section 9) against real quotes once they include stressed markets, and later backtest on real LEAPS prices.
- Paper books' idle cash earns the T-bill rate for the calendar days between processed sessions (`leaps_interest`).

---

## 11. Reported for every book

Same as release 2 section 6, plus: % of trades that reached the +100% half sale, runner P&L separately from the first half, average holding time, results per drawdown period, confirmed vs unconfirmed (paper only).

---

## 12. Known limits

- Modeled prices: real LEAPS spreads in a panic can be wider than 2%. The IV model was fitted on one calm day (VIX 19); how far 18-month IV rises in a panic (the VIX6M factor) is an assumption until the collector has recorded LEAPS quotes through a real sell-off.
- Survivorship bias: the candidate list is built from companies large today. A 2016 name that later collapsed may be missing. Point-in-time market cap and profit checks reduce this but don't remove it.
- Few independent episodes: 10 years contains only ~4-5 correction periods, so results cluster; treat them as a sanity check, not proof.

---

## 13. Open questions (resolved)

1. Book size: $25,000-$50,000; default $50,000 (section 5). Expect L1 (deep ITM) to be skipped often at this size: 2 contracts must cost <= $5,000, i.e. <= $25/share premium.
2. Proposed thresholds: accepted as written.
3. Signa confirmation: recorded only, does not block entries.

---

## Change log

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-10-25 | Draft. |
| 1.0 | 2026-10-25 | Approved. Added section 8 (price levels). Before approval: IV check measured against VIX, net income for banks, backtest Pullback without the Market Quality Score. |
| 1.1 | 2026-10-25 | Backtest price model only (section 9); no trading rule changed. The v1.0 model (IV = VIX x stock/SPY realized-vol ratio) priced LEAPS ~50% above real Cboe quotes even in a calm market, and far higher in panics, when 30-day VIX spikes but 18-month IV does not. Its volatility proxy also excluded names the live check accepts (MSFT). Replaced with the fitted model above. Found by checking the model against live quotes, not by tuning for results. |
| 1.2 | 2026-10-25 | Added the index book IX (section 6b). Idle cash earns T-bill interest in the backtest and the paper books; SPY benchmark is total return; sells fill before buys in a session. Daily LEAPS quote grid for research. Stock books L1-L3 unchanged. |
| 1.3 | 2026-10-25 | Index book IX split into IS (SPY only) and IQ (QQQ only), 30% of each book in its one LEAPS, same contract and roll rules; IQ is compared with QQQ, all other books with SPY. Stock books unchanged. |
