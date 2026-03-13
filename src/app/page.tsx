'use client';

import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';

interface QualResult {
  company: string;
  website: string;
  result: 'PASS' | 'FAIL' | 'MAYBE' | 'ERROR';
  services_detected: string;
  clients_served: string;
  employee_estimate: string;
  reason: string;
  confidence: string;
  error?: string;
}

interface ParsedRow {
  company: string;
  website: string;
}

const RESULT_COLORS = {
  PASS: '#22c55e',
  FAIL: '#ef4444',
  MAYBE: '#f59e0b',
  ERROR: '#64748b',
};

const RESULT_BG = {
  PASS: 'rgba(34,197,94,0.08)',
  FAIL: 'rgba(239,68,68,0.08)',
  MAYBE: 'rgba(245,158,11,0.08)',
  ERROR: 'rgba(100,116,139,0.08)',
};

export default function Home() {
 const [apiKey, setApiKey] = useState('');
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [perplexityKey, setPerplexityKey] = useState('');
  const [perplexityKeyVisible, setPerplexityKeyVisible] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [results, setResults] = useState<QualResult[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentCompany, setCurrentCompany] = useState('');
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [concurrency] = useState(3);
  const abortRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const parseFile = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      let parsed: ParsedRow[] = [];

      if (file.name.endsWith('.csv')) {
        const text = data as string;
        const lines = text.split('\n').filter(Boolean);
        const headers = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''));
        
        const companyIdx = headers.findIndex(h => h.includes('company') || h.includes('name') || h.includes('account'));
        const websiteIdx = headers.findIndex(h => h.includes('website') || h.includes('url') || h.includes('domain'));

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
          const company = companyIdx >= 0 ? cols[companyIdx] : cols[0];
          const website = websiteIdx >= 0 ? cols[websiteIdx] : cols[1];
          if (company) parsed.push({ company: company || '', website: website || '' });
        }
      } else {
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);
        
        parsed = json.map(row => {
          const keys = Object.keys(row).map(k => k.toLowerCase());
          const companyKey = Object.keys(row).find(k => keys.includes(k.toLowerCase()) && (k.toLowerCase().includes('company') || k.toLowerCase().includes('name') || k.toLowerCase().includes('account'))) || Object.keys(row)[0];
          const websiteKey = Object.keys(row).find(k => k.toLowerCase().includes('website') || k.toLowerCase().includes('url') || k.toLowerCase().includes('domain')) || Object.keys(row)[1];
          return {
            company: String(row[companyKey] || ''),
            website: String(row[websiteKey] || ''),
          };
        }).filter(r => r.company);
      }

      setRows(parsed);
      setResults([]);
    };

    if (file.name.endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  const qualifyOne = async (row: ParsedRow): Promise<QualResult> => {
    try {
      const res = await fetch('/api/qualify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: row.company, website: row.website, apiKey, perplexityKey }),      });
      const data = await res.json();
      if (data.error) {
        return { ...row, result: 'ERROR', services_detected: '', clients_served: '', employee_estimate: '', reason: data.error, confidence: 'LOW', error: data.error };
      }
      return data as QualResult;
    } catch (err) {
      return { ...row, result: 'ERROR', services_detected: '', clients_served: '', employee_estimate: '', reason: 'Network error', confidence: 'LOW' };
    }
  };

  const runQualification = async () => {
    if (!apiKey || rows.length === 0) return;
    
    abortRef.current = false;
    setProcessing(true);
    setResults([]);
    setProgress(0);

    const allResults: QualResult[] = [];
    let completed = 0;

    // Process in batches for concurrency
    for (let i = 0; i < rows.length; i += concurrency) {
      if (abortRef.current) break;
      
      const batch = rows.slice(i, i + concurrency);
      setCurrentCompany(batch.map(b => b.company).join(', '));
      
      const batchResults = await Promise.all(batch.map(row => qualifyOne(row)));
      allResults.push(...batchResults);
      completed += batch.length;
      
      setResults([...allResults]);
      setProgress(Math.round((completed / rows.length) * 100));
    }

    setProcessing(false);
    setCurrentCompany('');
  };

  const stopProcessing = () => {
    abortRef.current = true;
    setProcessing(false);
  };

  const exportResults = () => {
    if (results.length === 0) return;
    
    const exportData = results.map(r => ({
      'Company': r.company,
      'Website': r.website,
      'Result': r.result,
      'Services Detected': r.services_detected,
      'Clients Served': r.clients_served,
      'Employee Estimate': r.employee_estimate,
      'Reason': r.reason,
      'Confidence': r.confidence,
    }));

    const wb = XLSX.utils.book_new();
    
    // All results
    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [20, 30, 10, 30, 30, 15, 50, 10].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, 'All Results');

    // PASS only
    const passes = exportData.filter(r => r.Result === 'PASS');
    if (passes.length > 0) {
      const wsPass = XLSX.utils.json_to_sheet(passes);
      wsPass['!cols'] = [20, 30, 10, 30, 30, 15, 50, 10].map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, wsPass, 'PASS Only');
    }

    // MAYBE
    const maybes = exportData.filter(r => r.Result === 'MAYBE');
    if (maybes.length > 0) {
      const wsMaybe = XLSX.utils.json_to_sheet(maybes);
      wsMaybe['!cols'] = [20, 30, 10, 30, 30, 15, 50, 10].map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, wsMaybe, 'MAYBE Only');
    }

    XLSX.writeFile(wb, `axion-qualified-leads-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const counts = {
    pass: results.filter(r => r.result === 'PASS').length,
    fail: results.filter(r => r.result === 'FAIL').length,
    maybe: results.filter(r => r.result === 'MAYBE').length,
    error: results.filter(r => r.result === 'ERROR').length,
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '0 0 80px 0' }}>
      {/* Header */}
      <div style={{
        borderBottom: '1px solid var(--border)',
        padding: '24px 40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--surface)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 800,
          }}>A</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>Axion ICP Qualifier</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>Automated Agency Lead Scoring</div>
          </div>
        </div>
        {results.length > 0 && (
          <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
            <span style={{ color: 'var(--pass)' }}>✓ {counts.pass} PASS</span>
            <span style={{ color: 'var(--maybe)' }}>~ {counts.maybe} MAYBE</span>
            <span style={{ color: 'var(--fail)' }}>✗ {counts.fail} FAIL</span>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 24px' }}>

        {/* API Key Input */}
        <div style={{ marginBottom: 32 }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 8, fontFamily: 'DM Mono, monospace', letterSpacing: '0.05em' }}>
            OPENAI API KEY
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type={apiKeyVisible ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-..."
              style={{
                flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 14px', color: 'var(--text)',
                fontFamily: 'DM Mono, monospace', fontSize: 13, outline: 'none',
              }}
            />
            <button
              onClick={() => setApiKeyVisible(!apiKeyVisible)}
              style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 14px', color: 'var(--muted)',
                cursor: 'pointer', fontSize: 12,
              }}
            >
              {apiKeyVisible ? 'Hide' : 'Show'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
            Your key is never stored. Get one at platform.openai.com → API Keys. ~$1-3 per 1,000 companies.
          </div>
        </div>
{/* Perplexity API Key */}
<div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'DM Mono, monospace', letterSpacing: '0.05em' }}>
              PERPLEXITY API KEY
            </label>
            <span style={{ fontSize: 10, background: 'rgba(99,102,241,0.15)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 4, fontFamily: 'DM Mono, monospace' }}>
              OPTIONAL — enables 2nd pass on uncertain results
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type={perplexityKeyVisible ? 'text' : 'password'}
              value={perplexityKey}
              onChange={e => setPerplexityKey(e.target.value)}
              placeholder="pplx-..."
              style={{
                flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 14px', color: 'var(--text)',
                fontFamily: 'DM Mono, monospace', fontSize: 13, outline: 'none',
              }}
            />
            <button
              onClick={() => setPerplexityKeyVisible(!perplexityKeyVisible)}
              style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 14px', color: 'var(--muted)',
                cursor: 'pointer', fontSize: 12,
              }}
            >
              {perplexityKeyVisible ? 'Hide' : 'Show'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
            Get one free at perplexity.ai/api — ~$5 per 1,000 uncertain companies. Skips PASSes automatically.
          </div>
        </div>
        {/* File Upload */}
        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 12, padding: '48px 24px', textAlign: 'center',
            cursor: 'pointer', marginBottom: 32, transition: 'all 0.2s',
            background: dragOver ? 'rgba(99,102,241,0.05)' : 'transparent',
          }}
        >
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileInput} style={{ display: 'none' }} />
          <div style={{ fontSize: 32, marginBottom: 12 }}>📂</div>
          {fileName ? (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{fileName}</div>
              <div style={{ color: 'var(--pass)', fontSize: 13 }}>{rows.length} companies loaded</div>
            </div>
          ) : (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Drop your CSV or Excel file here</div>
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                Needs columns for <span style={{ fontFamily: 'DM Mono, monospace' }}>company name</span> and <span style={{ fontFamily: 'DM Mono, monospace' }}>website</span>
              </div>
            </div>
          )}
        </div>

        {/* Apollo Export Tip */}
        {rows.length === 0 && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '16px 20px', marginBottom: 32, fontSize: 13,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--accent)' }}>💡 Apollo Export Tip</div>
            <div style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
              In Apollo: Filter by Industry → Marketing & Advertising, Employees → 30-100, Country → US.
              Export CSV with <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>Company Name</span> and <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>Website</span> columns. Drop it here.
            </div>
          </div>
        )}

        {/* Run Button */}
        {rows.length > 0 && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 32, alignItems: 'center' }}>
            {!processing ? (
              <button
                onClick={runQualification}
                disabled={!apiKey}
                style={{
                  background: apiKey ? 'var(--accent)' : 'var(--border)',
                  border: 'none', borderRadius: 8, padding: '12px 28px',
                  color: 'white', fontWeight: 700, fontSize: 14,
                  cursor: apiKey ? 'pointer' : 'not-allowed',
                  fontFamily: 'Syne, sans-serif', letterSpacing: '-0.01em',
                  transition: 'all 0.2s',
                }}
              >
                Run Qualification → {rows.length} companies
              </button>
            ) : (
              <button
                onClick={stopProcessing}
                style={{
                  background: 'var(--fail)', border: 'none', borderRadius: 8,
                  padding: '12px 28px', color: 'white', fontWeight: 700, fontSize: 14,
                  cursor: 'pointer', fontFamily: 'Syne, sans-serif',
                }}
              >
                Stop
              </button>
            )}
            {results.length > 0 && (
              <button
                onClick={exportResults}
                style={{
                  background: 'transparent', border: '1px solid var(--pass)',
                  borderRadius: 8, padding: '12px 28px',
                  color: 'var(--pass)', fontWeight: 600, fontSize: 14,
                  cursor: 'pointer', fontFamily: 'Syne, sans-serif',
                }}
              >
                Export Excel ↓
              </button>
            )}
          </div>
        )}

        {/* Progress Bar */}
        {processing && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12, color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>
              <span>Checking: {currentCompany}</span>
              <span>{progress}% ({results.length}/{rows.length})</span>
            </div>
            <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', background: 'var(--accent)',
                width: `${progress}%`, transition: 'width 0.3s',
                borderRadius: 2,
              }} />
            </div>
          </div>
        )}

        {/* Summary Cards */}
        {results.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
            {[
              { label: 'PASS', count: counts.pass, color: 'var(--pass)' },
              { label: 'MAYBE', count: counts.maybe, color: 'var(--maybe)' },
              { label: 'FAIL', count: counts.fail, color: 'var(--fail)' },
              { label: 'ERROR', count: counts.error, color: 'var(--muted)' },
            ].map(stat => (
              <div key={stat.label} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '16px 20px',
              }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: stat.color, lineHeight: 1 }}>{stat.count}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, fontFamily: 'DM Mono, monospace' }}>{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Results Table */}
        {results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4, fontFamily: 'DM Mono, monospace' }}>
              RESULTS — showing {results.length} of {rows.length}
            </div>
            {results.map((r, i) => (
              <div key={i} style={{
                background: RESULT_BG[r.result] || 'var(--surface)',
                border: `1px solid ${RESULT_COLORS[r.result] || 'var(--border)'}22`,
                borderLeft: `3px solid ${RESULT_COLORS[r.result] || 'var(--border)'}`,
                borderRadius: 10, padding: '14px 18px',
                display: 'grid', gridTemplateColumns: '80px 1fr 1fr 80px',
                gap: 16, alignItems: 'start',
              }}>
                <div>
                  <div style={{
                    display: 'inline-block', padding: '2px 10px', borderRadius: 4,
                    background: RESULT_COLORS[r.result] + '22',
                    color: RESULT_COLORS[r.result],
                    fontFamily: 'DM Mono, monospace', fontSize: 11, fontWeight: 500,
                  }}>{r.result}</div>
                  {r.confidence && (
  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, fontFamily: 'DM Mono, monospace' }}>{r.confidence}</div>
)}
{!!(r as Record<string, unknown>).second_pass_used && (
  <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 2, fontFamily: 'DM Mono, monospace' }}>2nd pass ✓</div>
)}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{r.company}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>{r.website}</div>
                  {r.reason && (
                    <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 6, lineHeight: 1.4, opacity: 0.8 }}>{r.reason}</div>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {r.services_detected && <div style={{ marginBottom: 4 }}><span style={{ color: 'var(--text)' }}>Services:</span> {r.services_detected}</div>}
                  {r.clients_served && <div style={{ marginBottom: 4 }}><span style={{ color: 'var(--text)' }}>Clients:</span> {r.clients_served}</div>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>
                  {r.employee_estimate && <div>{r.employee_estimate} emp.</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
