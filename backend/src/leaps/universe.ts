// LEAPS candidate list (docs/leaps-rules.md section 1): S&P 100 members plus other US large caps.
// Only the starting list - market cap, profit, revenue, volatility and liquidity checks decide eligibility each day.
// Update annually with NYSE_HOLIDAYS / fomc.ts. One share class per company (GOOGL, not GOOG).
//   - BRK-B is left out: no listed LEAPS ticker matches across SEC / Yahoo / Cboe spellings
export const LEAPS_UNIVERSE: string[] = [
  // S&P 100
  'AAPL', 'ABBV', 'ABT', 'ACN', 'ADBE', 'AIG', 'AMD', 'AMGN', 'AMT', 'AMZN', 'AVGO', 'AXP', 'BA', 'BAC', 'BK', 'BKNG',
  'BLK', 'BMY', 'C', 'CAT', 'CHTR', 'CL', 'CMCSA', 'COF', 'COP', 'COST', 'CRM', 'CSCO', 'CVS', 'CVX', 'DE', 'DHR',
  'DIS', 'DUK', 'EMR', 'F', 'FDX', 'GD', 'GE', 'GILD', 'GM', 'GOOGL', 'GS', 'HD', 'HON', 'IBM', 'INTC', 'INTU',
  'ISRG', 'JNJ', 'JPM', 'KO', 'LIN', 'LLY', 'LMT', 'LOW', 'MA', 'MCD', 'MDLZ', 'MDT', 'MET', 'META', 'MMM', 'MO',
  'MRK', 'MS', 'MSFT', 'NEE', 'NFLX', 'NKE', 'NOW', 'NVDA', 'ORCL', 'PEP', 'PFE', 'PG', 'PLTR', 'PM', 'PYPL', 'QCOM',
  'RTX', 'SBUX', 'SCHW', 'SO', 'SPG', 'T', 'TGT', 'TMO', 'TMUS', 'TSLA', 'TXN', 'UBER', 'UNH', 'UNP', 'UPS', 'USB',
  'V', 'VZ', 'WFC', 'WMT', 'XOM',
  // Other US large caps
  'ADI', 'AMAT', 'ANET', 'APH', 'BSX', 'BX', 'CRWD', 'ETN', 'HCA', 'KKR', 'KLAC', 'LRCX', 'MCK', 'MU', 'PANW', 'PGR',
  'REGN', 'SPGI', 'SYK', 'TJX', 'VRTX',
];
