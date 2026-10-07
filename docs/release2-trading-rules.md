# Release 2 - Paper Trading Rules - v1.0

Status: **approved 2026-10-07, frozen as v1.0**. These rules are fixed in code before any backtest result is looked at. Account-level values (balance, risk per trade, limits, costs) are editable in the app's Settings page and stored with every trade. Any later change gets a new version number and is re-tested on held-back data (see section 8, "Overfitting guard").

---

## 1. Shared rules (all books)

### 1.1 Accounts

- Three paper books, each with its own **$10,000** starting balance, so their results can be compared fairly.
- Only a book that passes the go-live checklist (section 7) would ever trade the real Moomoo account.

### 1.2 Risk per trade

| Book balance | Max risk per trade |
| --- | --- |
| Below $10,000 | 10% of balance (e.g. $800 at $8,000) |
| $10,000 - $39,999 | $1,000 fixed (10% falling to 2.5% as the book grows) |
| $40,000 and above | 2.5% of balance (Radon's rule) |

- Formula: `risk = balance >= 40,000 ? 2.5% x balance : min(1,000, 10% x balance)`
- "Risk" = the most the trade can lose: premium paid for a long option or debit spread, entry-to-stop distance x shares for stock.
- After a book has 30 closed trades, size by half-Kelly from its own win rate and payoff, **never above the cap above**.

### 1.3 Exposure limits (options books)

- Max **5 open trades** per options book.
- Total open risk max **50% of balance** ($5,000 at $10,000).
- Max **1 open trade per ticker** per book.
- A signal that arrives while a limit is full is logged as "skipped: limit", so we can see what was missed.

### 1.4 Timing and fills

- Decisions are made once a day after the close, using that day's collected data (scanner 16:30 ET run, GEX, flow, signals).
- Orders fill at the **next session's close**:
  - Options: buy at the **ask**, sell at the **bid** (Cboe quotes recorded at 16:25 ET) - conservative, no mid-price fills.
  - Shares: next session's **open** (daily price bars).
- Exits are checked daily on the same basis. A stop that gaps through fills at the actual next price, not the stop level.

### 1.5 Costs

- Options: **US$1.00 per contract per leg**, each way (adjustable in Settings; Moomoo AU's real rate to be confirmed).
- Shares: **US$1.00 per order** (adjustable).

### 1.6 Contract selection (options books)

1. Use the two recorded expiries (about 30 and 60 days out); prefer the later one.
2. **Single option first:** the call (or put) with delta closest to **0.40** whose cost fits the risk budget.
3. **Otherwise a debit spread:** buy ~0.50 delta, sell a further-out strike so that cost <= budget **and** max gain >= 2x cost.
4. **Otherwise skip** and log "skipped: too expensive for account size".
5. Skip contracts whose bid-ask spread is wider than **10% of mid** or open interest is under **100**.
6. Contracts = floor(risk budget / cost per contract); at least 1, otherwise skip.

---

## 2. Book A - Signa signal + options flow (options)

**Idea:** trade when Signa's nightly 30-model consensus and today's options flow point the same way.

### Entry (all must hold)

1. Signa `engine.direction` is BULLISH (buy calls) or BEARISH (buy puts), **grade A or B**.
2. Options flow agrees: today's flow-alert premium is >= **1.5x** in that direction (call premium vs put premium), **or** a curated-flow event in that direction with conviction >= 60.
3. Ticker is in the tracked universe (core or scanner-promoted).

### Exit (first one hit)

1. Underlying closes beyond Signa's stop (if Signa gives none: the GEX put wall for calls / call wall for puts).
2. Option value down **50%** from entry.
3. Option value up **100%** (spreads: 80% of max value).
4. **21 days** left to expiry (avoid fast time decay).
5. Signa engine direction flips to the opposite side.

---

## 3. Book B - Radon rules (options)

**Idea:** Radon's three checks, in order. Any check fails: no trade, and the failing check is logged.

### Check 1 - Edge

1. Flow Scanner score >= **60** that day, with **confluence** (options bias and dark pool agree).
2. Dark pool in the same direction for **2+ sessions** in a row.
3. "Hasn't moved yet": the stock has not already moved more than **1 ATR** (average daily range) in the signal direction over the last 5 sessions.

### Check 2 - Convexity

- Target = GEX call wall (for calls) or put wall (for puts) from the latest GEX snapshot.
- The structure's estimated gain at the target must be **>= 2x its cost**. If no contract or spread reaches 2:1, no trade.

### Check 3 - Risk

- Sizing per section 1.2 and limits per section 1.3.

### Exit (first one hit)

1. Underlying reaches the GEX target wall.
2. Option value down **50%**.
3. Dark pool flips to the opposite direction for **2 sessions** in a row.
4. **21 days** left to expiry.

---

## 4. Book C - Shares (Signa levels)

**Idea:** the same Signa signals traded as stock, which is simpler and backtestable from free daily prices.

### Entry (all must hold)

1. Signa `engine.direction` BULLISH, **grade A or B** (long only; shorting is out of scope for now).
2. Signa supplies an entry, a stop and a target, and the stop is below the entry.
3. Price is no more than **2% above** Signa's entry level.

### Sizing

- Risk **1% of balance** per trade (entry-to-stop distance x shares).
- Each position max **20% of balance** in value.
- Max **8 open positions**.

### Exit (first one hit)

1. Price trades at or below the stop (gap-down: fill at the open).
2. Price reaches Signa's target.
3. **20 trading days** held.
4. Signa engine flips to BEARISH.

---

## 5. Earnings (all books)

Source: Nasdaq earnings calendar, collected daily into `signal.earnings_calendar` (report date + before-open / after-close timing).

| Rule | Options books (A, B) | Shares book (C) |
| --- | --- | --- |
| New entries | No new trade if the ticker reports within the next **10 trading days** | Same |
| Open position before earnings | **Close at the last close before the report**, in profit or loss | Close too, **unless the position is up 2R or more**: then hold, with the stop moved to the entry price |

- "Last close before the report": for a before-open report, the previous session's close; for an after-close report (or unknown timing), that same day's close.
- Why options always close: implied volatility rises into the report and collapses the day after (IV crush), so a bought option often loses even when the stock moves the right way.
- **Shadow tracking:** every position closed for earnings also records what it would have returned if held to its normal exit. After a few earnings seasons this shows, with our own numbers, whether holding would have been better. A rule change based on it is a new version (section 8).
- A ticker with no known report date is treated as having none; this is logged so gaps in the calendar are visible.

---

## 6. Reported for every book

- Equity curve vs SPY buy-and-hold over the same days.
- Win rate, average win, average loss, average R (profit per $1 risked), profit factor, max drawdown, longest losing streak.
- Count of signals skipped, by reason (limit full, too expensive, illiquid, failed check 1/2/3, earnings window).
- Earnings exits: actual result vs the shadow "held through" result.

---

## 7. Go-live checklist (agreed 2026-10-04)

A book may trade real money only when **all** hold:

1. At least 30 closed trades (50 preferred) over at least 3 months.
2. Average R above about 0.2 and profit factor >= 1.3, after costs.
3. Max drawdown within the limit you set.
4. Still profitable after removing its 2 best trades.
5. Replay (backtest) and paper (forward) results agree.
6. Then start at **25% of normal size** for 1-2 months.

---

## 8. Overfitting guard

- The thresholds above (grade A/B, 1.5x flow, score 60, 0.40 delta, -50% / +100%, 21 days, 1 ATR, 10-day earnings window, 2R earnings hold) are set **before** looking at any result.
- The most recent **2 weeks** of data are held back. Any rule change is decided on the older data and must also hold on the held-back weeks.
- Every rule version is stored with each trade, so results from different versions are never mixed.

---

## 9. Known limits

- Dark pool data is a sample (latest 50 prints per pull), not the full tape Radon uses.
- Flow alerts for the busiest tickers are capped at 50 per hour.
- Earnings dates come from a free calendar and can move; the calendar is refreshed daily and the latest date wins.
- Option fills use end-of-day delayed quotes; real fills during the day could be better or worse.
