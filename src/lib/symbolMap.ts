/**
 * Master symbol dictionary for RIA: Strategy Studio and Live Terminal use this single source.
 * Each instrument has: label (display), tvSymbol (TradingView e.g. NSE:RELIANCE), angelSymbol (broker), token (Angel One).
 * value: unique key for our API (backtest, /candles, /quote).
 */

export type InstrumentCategory = "INDICES" | "STOCKS" | "ETFS";

export interface Instrument {
  value: string;
  label: string;
  tvSymbol: string;
  angelSymbol: string;
  token: string;
  category: InstrumentCategory;
}

const INDICES: Instrument[] = [
  { value: "NIFTY",       label: "Nifty 50",     tvSymbol: "NSE:NIFTY 50",     angelSymbol: "NIFTY 50",     token: "99926000", category: "INDICES" },
  { value: "BANKNIFTY",   label: "Nifty Bank",   tvSymbol: "NSE:NIFTY BANK",   angelSymbol: "NIFTY BANK",   token: "260105",   category: "INDICES" },
  { value: "SENSEX",      label: "Sensex",       tvSymbol: "BSE:SENSEX",      angelSymbol: "SENSEX",       token: "99926009", category: "INDICES" },
];

const STOCKS: Instrument[] = [
  { value: "RELIANCE",    label: "Reliance Industries", tvSymbol: "NSE:RELIANCE",      angelSymbol: "RELIANCE-EQ",      token: "2881",   category: "STOCKS" },
  { value: "TCS",         label: "TCS",                 tvSymbol: "NSE:TCS",           angelSymbol: "TCS-EQ",           token: "11536",  category: "STOCKS" },
  { value: "HDFCBANK",    label: "HDFC Bank",          tvSymbol: "NSE:HDFCBANK",      angelSymbol: "HDFCBANK-EQ",      token: "1330",   category: "STOCKS" },
  { value: "INFY",        label: "Infosys",            tvSymbol: "NSE:INFY",          angelSymbol: "INFY-EQ",          token: "1594",   category: "STOCKS" },
  { value: "ICICIBANK",   label: "ICICI Bank",         tvSymbol: "NSE:ICICIBANK",     angelSymbol: "ICICIBANK-EQ",     token: "1333",   category: "STOCKS" },
  { value: "SBIN",        label: "State Bank of India", tvSymbol: "NSE:SBIN",        angelSymbol: "SBIN-EQ",          token: "3045",   category: "STOCKS" },
  { value: "BHARTIARTL",  label: "Bharti Airtel",      tvSymbol: "NSE:BHARTIARTL",    angelSymbol: "BHARTIARTL-EQ",    token: "10604",  category: "STOCKS" },
  { value: "TATAMOTORS",  label: "Tata Motors",        tvSymbol: "NSE:TATAMOTORS",    angelSymbol: "TATAMOTORS-EQ",    token: "3456",   category: "STOCKS" },
  { value: "BAJFINANCE",  label: "Bajaj Finance",      tvSymbol: "NSE:BAJFINANCE",    angelSymbol: "BAJFINANCE-EQ",    token: "317",    category: "STOCKS" },
  { value: "WIPRO",       label: "Wipro",              tvSymbol: "NSE:WIPRO",         angelSymbol: "WIPRO-EQ",         token: "6951",   category: "STOCKS" },
  { value: "MARUTI",      label: "Maruti Suzuki",      tvSymbol: "NSE:MARUTI",        angelSymbol: "MARUTI-EQ",        token: "10999",  category: "STOCKS" },
  // IDEA / Vodafone Idea
  { value: "IDEA",        label: "Vodafone Idea",      tvSymbol: "NSE:IDEA",          angelSymbol: "IDEA-EQ",          token: "",       category: "STOCKS" },
];

const ETFS: Instrument[] = [
  { value: "GOLDBEES",   label: "GOLDBEES",   tvSymbol: "NSE:GOLDBEES",   angelSymbol: "GOLDBEES",   token: "99926012", category: "ETFS" },
  { value: "BANKBEES",   label: "BANKBEES",   tvSymbol: "NSE:BANKBEES",   angelSymbol: "BANKBEES",   token: "99926014", category: "ETFS" },
];

/** Categorized groups for optgroup dropdowns. */
export const SYMBOL_GROUPS: { heading: string; instruments: Instrument[] }[] = [
  { heading: "INDICES", instruments: INDICES },
  { heading: "STOCKS",  instruments: STOCKS },
  { heading: "ETFS",    instruments: ETFS },
];

/** Flat list of all instruments. */
export const ALL_INSTRUMENTS: Instrument[] = [...INDICES, ...STOCKS, ...ETFS];

/** Default instrument (Nifty 50). */
export const DEFAULT_INSTRUMENT: Instrument = INDICES[0];

export function getInstrumentByValue(value: string): Instrument | undefined {
  return ALL_INSTRUMENTS.find((i) => i.value === value);
}

export function getInstrumentByValueOrDefault(value: string | null | undefined): Instrument {
  if (value) {
    const found = getInstrumentByValue(value);
    if (found) return found;
  }
  return DEFAULT_INSTRUMENT;
}
