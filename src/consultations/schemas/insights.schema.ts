/** Types for the vitals insights response. No Zod schema — the LLM is
 *  prompted to return JSON directly and the service validates manually. */

export interface InsightEntry {
  parameter: string;
  severity: 'normal' | 'watch' | 'alert';
  direction: 'up' | 'down' | 'flat' | 'mixed';
  message: string;
}

export interface InsightsResult {
  insights: InsightEntry[];
  summary: string;
}
