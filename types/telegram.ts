export type TelegramParseSource = 'regex' | 'gemini' | 'failed';

export type TelegramParserResult = {
  source: TelegramParseSource;
  tokenMint: string | null;
  tokenName: string | null;
  investedSol: number | null;
  soldSol: number | null;
  profitSol: number | null;
  profitPct: number | null;
  error?: string;
};

export type TelegramChannelRow = {
  id: string;
  username: string;
  label: string | null;
  created_at: string;
};

/** Favori token PnL Telegram (persisté serveur par canal). */
export type TelegramPnlFavoriteDto = {
  mint: string;
  tokenName: string | null;
  createdAt: string;
};

export type TelegramLeaderboardRow = {
  token_mint: string;
  token_name: string | null;
  /** Dernière persistance en base pour ce mint (scrape / re-scrape), max(parsed_at). */
  fetched_at: string | null;
  invested: string;
  sold: string;
  profit: string;
  avg_profit_pct: string | null;
  posts: string;
};
