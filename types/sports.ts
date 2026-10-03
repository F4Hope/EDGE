export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type OpportunityStatus = "BETTABLE" | "WATCH" | "HIGH RISK" | "NO BET";

export type EdgeMetrics = {
  modelProbability: number;
  impliedProbability: number;
  estimatedEdge: number;
  estimatedValue: number;
  edgeScore: number;
  risk: RiskLevel;
  status: OpportunityStatus;
};
