// Shared types for Axion Lead Enricher

export interface QualResult {
  company: string;
  website: string;
  result: 'PASS' | 'FAIL' | 'MAYBE' | 'ERROR';
  services_detected: string;
  clients_served: string;
  reason: string;
  confidence: string;
  owner_name?: string;
  error?: string;
  second_pass_used?: boolean;
}

export interface EnrichedResult extends QualResult {
  notes?: string;
  userDecision?: 'PASS' | 'FAIL' | 'MAYBE' | '';
  processedAt?: number;
  normalizedDomain?: string;
}

export interface ParsedRow {
  company: string;
  website: string;
}

export function normalizeDomain(url: string): string {
  let d = (url || '').toLowerCase().trim();
  d = d.replace(/^https?:\/\//, '');
  d = d.replace(/^www\./, '');
  d = d.replace(/\/.*$/, '');
  return d;
}
