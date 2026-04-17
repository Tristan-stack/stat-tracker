export type AnalysisStatus = 'pending' | 'running' | 'completed' | 'failed';

export type AnalysisMode = 'token' | 'funding' | 'combined' | 'token_hunting';

export type WalletSource = 'token' | 'funding' | 'both';

export interface WalletAnalysis {
  id: string;
  ruggerId: string;
  mode: AnalysisMode;
  status: AnalysisStatus;
  fundingDepth: number;
  buyerLimit: number;
  tokenCount: number;
  buyerCount: number;
  progress: number;
  progressLabel: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface AnalysisBuyerWallet {
  id: string;
  analysisId: string;
  walletAddress: string;
  source: WalletSource;
  motherAddressId: string | null;
  tokensBought: number;
  totalTokens: number;
  coveragePercent: number;
  firstBuyAt: string | null;
  lastBuyAt: string | null;
  activeDays: number;
  spanDaysInScope: number;
  consistency: number;
  weight: number;
  avgHoldDuration: number | null;
  fundingDepth: number | null;
  fundingChain: string[] | null;
  motherChildCount: number;
  hasHighFanoutMother: boolean;
  matchingConfidence: number;
  inclusionDecision: 'included' | 'excluded' | 'included_with_risk';
  riskFlag: string | null;
  riskLevel: 'low' | 'medium' | 'high' | null;
  decisionReasons: string[];
  purchases: AnalysisBuyerPurchase[];
}

export interface AnalysisBuyerPurchase {
  id: string;
  buyerWalletId: string;
  tokenAddress: string;
  tokenName: string | null;
  purchasedAt: string | null;
  amountSol: number | null;
}

export interface AnalysisMotherAddress {
  id: string;
  analysisId: string;
  address: string;
  walletsFunded: number;
  validated: boolean;
  validatedAt: string | null;
}

export interface FundingChainCacheEntry {
  id: string;
  userId: string;
  walletAddress: string;
  motherAddress: string | null;
  fundingDepth: number;
  chainJson: string[];
  resolvedAt: string;
}

export interface TokenBuyer {
  walletAddress: string;
  tokenAddress: string;
  tokenName: string | null;
  purchasedAt: string;
  amountSol: number | null;
}

export interface FundingChainResult {
  wallet: string;
  mother: string | null;
  depth: number;
  chain: string[];
  stoppedBy: 'exchange' | 'circular' | 'depth' | 'noisy' | 'no_funder' | null;
}

export interface MotherAddressResult {
  address: string;
  walletsFunded: number;
  wallets: string[];
}

export interface WalletCombinationStep {
  walletAddress: string;
  newTokensCovered: string[];
  cumulativeCoverage: number;
}

export interface SiblingWallet {
  walletAddress: string;
  motherAddress: string;
  amountReceived: number | null;
  receivedAt: string | null;
}

export interface SiblingDiscoveryResult {
  motherAddress: string;
  siblings: SiblingWallet[];
  ruggerChain: string[];
  motherChildCount: number;
  hasHighFanoutMother: boolean;
}

export interface CrossRuggerMatch {
  walletAddress: string;
  ruggerNames: string[];
  ruggerIds: string[];
}
