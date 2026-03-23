'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { QualResult, EnrichedResult, ParsedRow, normalizeDomain } from '@/lib/types';
import {
  saveBulkResults,
  getResultsByDomains,
  getHistoryCount,
  clearHistory,
} from '@/lib/history';

const STORAGE_KEY = 'axion_qualifier_results';

const RESULT_COLORS: Record<string, string> = {
  PASS: '#22c55e',
  FAIL: '#ef4444',
  MAYBE: '#f59e0b',
  ERROR: '#64748b',
};

const RESULT_BG: Record<string, string> = {
  PASS: 'rgba(34,197,94,0.08)',
  FAIL: 'rgba(239,68,68,0.08)',
  MAYBE: 'rgba(245,158,11,0.08)',
  ERROR: 'rgba(100,116,139,0.08)',
};

type FilterTab = 'ALL' | 'PASS' | 'MAYBE' | 'FAIL';

export default function Home() {
  const [apiKey, setApiKey] = useState('');
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [perplexityKey, setPerplexityKey] = useState('');
  const [perplexityKeyVisible, setPerplexityKeyVisible] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [results, setResults] = useState<EnrichedResult[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentCompany, setCurrentCompany] = useState('');
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [concurrency] = useState(3);
  const [restoredCount, setRestoredCount] = useState(0);
  const [historyCount, setHistoryCount] = useState(0);
  const [cachedResults, setCachedResults] = useState<Map<string, EnrichedResult>>(new Map());
  const [filterTab, setFilterTab] = useState<FilterTab>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(50);
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [importMessage, setImportMessage] = useState('');
  const [eta, setEta] = useState('');
  const abortRef = useRef(false);
  const startTimeRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const historyFileRef = useRef<HTMLInputElement>(null);

  // Load history count + restore session on page load
  useEffect(() => {
    getHistoryCount().then(setHistoryCount);
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as EnrichedResult[];
        if (parsed.length > 0) {
          setResults(parsed);
          setRestoredCount(parsed.length);
        }
      } catch { /* ignore corrupt data */ }
    }
  }, []);

  const parseFile = useCallback(async (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = async (e) => {
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

      // Check for duplicates in history
      const domains = parsed.map(r => normalizeDomain(r.website));
      const cached = await getResultsByDomains(domains);
      setCachedResults(cached);
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

  const qualifyOne = async (row: ParsedRow): Promise<EnrichedResult> => {
    try {
      const res = await fetch('/api/qualify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: row.company, website: row.website, apiKey, perplexityKey }),
      });
      const data = await res.json();
      if (data.error) {
        return { ...row, result: 'ERROR', services_detected: '', clients_served: '', reason: data.error, confidence: 'LOW', owner_name: '', error: data.error };
      }
      return data as EnrichedResult;
    } catch {
      return { ...row, result: 'ERROR', services_detected: '', clients_served: '', reason: 'Network error', confidence: 'LOW', owner_name: '' };
    }
  };

  const runQualification = async (resume = false) => {
    if (!apiKey || rows.length === 0) return;

    abortRef.current = false;
    setProcessing(true);
    startTimeRef.current = Date.now();

    const existingResults = resume ? [...results] : [];
    const processedDomains = new Set(existingResults.map(r => normalizeDomain(r.website)));

    if (!resume) {
      setResults([]);
      setRestoredCount(0);
      localStorage.removeItem(STORAGE_KEY);
    }
    setProgress(0);

    const allResults: EnrichedResult[] = [...existingResults];
    let completed = existingResults.length;

    // Separate rows into cached (from history) and new (need API)
    const rowsToProcess: ParsedRow[] = [];
    for (const row of rows) {
      const domain = normalizeDomain(row.website);
      if (processedDomains.has(domain)) continue; // already in current results (resume)
      const cached = cachedResults.get(domain);
      if (cached && !resume) {
        allResults.push(cached);
        completed++;
      } else if (!processedDomains.has(domain)) {
        rowsToProcess.push(row);
      }
    }

    // Show cached results immediately
    if (allResults.length > existingResults.length) {
      setResults([...allResults]);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(allResults));
      setProgress(Math.round((completed / rows.length) * 100));
    }

    // Process new rows in batches
    let batchCount = 0;
    for (let i = 0; i < rowsToProcess.length; i += concurrency) {
      if (abortRef.current) break;

      const batch = rowsToProcess.slice(i, i + concurrency);
      setCurrentCompany(batch.map(b => b.company).join(', '));

      const batchResults = await Promise.all(batch.map(row => qualifyOne(row)));

      // Enrich with metadata for history
      const enriched = batchResults.map(r => ({
        ...r,
        normalizedDomain: normalizeDomain(r.website),
        processedAt: Date.now(),
      }));

      allResults.push(...enriched);
      completed += batch.length;
      batchCount++;

      setResults([...allResults]);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(allResults));
      setProgress(Math.round((completed / rows.length) * 100));

      // Save to IndexedDB
      saveBulkResults(enriched);

      // Update ETA
      const elapsed = Date.now() - startTimeRef.current;
      const avgPerBatch = elapsed / batchCount;
      const remainingBatches = Math.ceil((rowsToProcess.length - (i + concurrency)) / concurrency);
      if (remainingBatches > 0) {
        const mins = Math.round((avgPerBatch * remainingBatches) / 60000);
        setEta(mins > 0 ? `~${mins} min remaining` : '<1 min remaining');
      }
    }

    setProcessing(false);
    setCurrentCompany('');
    setEta('');
    getHistoryCount().then(setHistoryCount);
  };

  const stopProcessing = () => {
    abortRef.current = true;
    setProcessing(false);
    setEta('');
  };

  const clearResults = () => {
    localStorage.removeItem(STORAGE_KEY);
    setResults([]);
    setRestoredCount(0);
    setCachedResults(new Map());
  };

  const updateResult = (index: number, updates: Partial<EnrichedResult>) => {
    setResults(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...updates };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      // Also update in IndexedDB if it has a domain
      if (updated[index].normalizedDomain) {
        saveBulkResults([updated[index]]);
      }
      return updated;
    });
  };

  const toggleCard = (index: number) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const importHistory = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const workbook = XLSX.read(ev.target?.result, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);

        const imported: EnrichedResult[] = json.map(row => ({
          company: row['Company'] || '',
          website: row['Website'] || '',
          result: (row['Result'] as EnrichedResult['result']) || 'MAYBE',
          services_detected: row['Services Detected'] || '',
          clients_served: row['Clients Served'] || '',
          reason: row['Reason'] || '',
          confidence: row['Confidence'] || 'LOW',
          owner_name: row['Owner / CEO'] || '',
          notes: row['Notes'] || '',
          userDecision: (['PASS', 'MAYBE', 'FAIL'].includes(row['Your Decision'] || '') ? row['Your Decision'] : '') as EnrichedResult['userDecision'],
          normalizedDomain: normalizeDomain(row['Website'] || ''),
          processedAt: Date.now(),
        })).filter(r => r.company && r.normalizedDomain);

        await saveBulkResults(imported);
        const count = await getHistoryCount();
        setHistoryCount(count);
        setImportMessage(`Imported ${imported.length} results into history`);
        setTimeout(() => setImportMessage(''), 4000);
      } catch {
        setImportMessage('Failed to import file');
        setTimeout(() => setImportMessage(''), 4000);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleClearHistory = async () => {
    if (!confirm('Clear all history? This cannot be undone.')) return;
    await clearHistory();
    setHistoryCount(0);
    setCachedResults(new Map());
  };

  const exportResults = () => {
    if (results.length === 0) return;

    const exportData = results.map(r => ({
      'Company': r.company,
      'Website': r.website,
      'Owner / CEO': r.owner_name || '',
      'Result': r.result,
      'Your Decision': r.userDecision || '',
      'Services Detected': r.services_detected,
      'Clients Served': r.clients_served,
      'Reason': r.reason,
      'Confidence': r.confidence,
      'Notes': r.notes || '',
    }));

    const colWidths = [20, 30, 25, 10, 14, 30, 30, 50, 10, 30].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();

    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws, 'All Results');

    const passes = exportData.filter(r => r.Result === 'PASS');
    if (passes.length > 0) {
      const wsPass = XLSX.utils.json_to_sheet(passes);
      wsPass['!cols'] = colWidths;
      XLSX.utils.book_append_sheet(wb, wsPass, 'PASS Only');
    }

    const maybes = exportData.filter(r => r.Result === 'MAYBE');
    if (maybes.length > 0) {
      const wsMaybe = XLSX.utils.json_to_sheet(maybes);
      wsMaybe['!cols'] = colWidths;
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

  // Filter + search logic
  const filteredResults = results.filter(r => {
    if (filterTab !== 'ALL' && r.result !== filterTab) return false;
    if (searchQuery && !r.company.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });
  const visibleResults = filteredResults.slice(0, visibleCount);

  // Dedup stats
  const newCount = rows.length - cachedResults.size;
  const cachedCount = cachedResults.size;

  // Can resume?
  const canResume = !processing && results.length > 0 && rows.length > 0 && results.length < rows.length;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', backgroundImage: 'var(--noise)', backgroundRepeat: 'repeat', padding: '0 0 100px 0' }}>
      {/* ── Header ── */}
      <div style={{
        borderBottom: '1px solid var(--border)',
        padding: '18px 40px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'linear-gradient(180deg, var(--surface-raised) 0%, var(--surface) 100%)',
        position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: 'linear-gradient(135deg, var(--accent) 0%, #818cf8 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 800, color: 'white',
            boxShadow: '0 0 20px var(--accent-glow)',
          }}>A</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)' }}>Axion ICP Qualifier</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'DM Mono, monospace', letterSpacing: '0.02em' }}>
              {historyCount > 0 ? `${historyCount.toLocaleString()} in history` : 'Agency Lead Scoring'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {results.length > 0 && (
            <div style={{ display: 'flex', gap: 4 }}>
              {[
                { label: counts.pass, color: 'var(--pass)', bg: 'var(--pass-dim)' },
                { label: counts.maybe, color: 'var(--maybe)', bg: 'var(--maybe-dim)' },
                { label: counts.fail, color: 'var(--fail)', bg: 'var(--fail-dim)' },
              ].map((s, i) => (
                <span key={i} style={{
                  padding: '3px 10px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                  fontFamily: 'DM Mono, monospace', color: s.color, background: s.bg,
                }}>{s.label}</span>
              ))}
            </div>
          )}
          {eta && (
            <span style={{
              fontSize: 11, color: 'var(--accent)', fontFamily: 'DM Mono, monospace',
              animation: 'pulse-subtle 2s ease infinite',
            }}>{eta}</span>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 920, margin: '0 auto', padding: '36px 24px' }}>

        {/* ── API Keys ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
          {/* OpenAI Key */}
          <div>
            <label style={{ display: 'block', fontSize: 10, color: 'var(--muted)', marginBottom: 6, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              OpenAI Key
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type={apiKeyVisible ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-..."
                style={{
                  flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '9px 12px', color: 'var(--text)',
                  fontFamily: 'DM Mono, monospace', fontSize: 12, outline: 'none',
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)',
                }}
              />
              <button
                onClick={() => setApiKeyVisible(!apiKeyVisible)}
                style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '9px 12px', color: 'var(--muted)',
                  cursor: 'pointer', fontSize: 11, fontFamily: 'DM Mono, monospace',
                }}
              >{apiKeyVisible ? 'Hide' : 'Show'}</button>
            </div>
          </div>
          {/* Perplexity Key */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <label style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Perplexity Key
              </label>
              <span style={{ fontSize: 9, background: 'var(--accent-glow)', color: 'var(--accent)', padding: '1px 6px', borderRadius: 3, fontFamily: 'DM Mono, monospace' }}>
                optional
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type={perplexityKeyVisible ? 'text' : 'password'}
                value={perplexityKey}
                onChange={e => setPerplexityKey(e.target.value)}
                placeholder="pplx-..."
                style={{
                  flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '9px 12px', color: 'var(--text)',
                  fontFamily: 'DM Mono, monospace', fontSize: 12, outline: 'none',
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)',
                }}
              />
              <button
                onClick={() => setPerplexityKeyVisible(!perplexityKeyVisible)}
                style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '9px 12px', color: 'var(--muted)',
                  cursor: 'pointer', fontSize: 11, fontFamily: 'DM Mono, monospace',
                }}
              >{perplexityKeyVisible ? 'Hide' : 'Show'}</button>
            </div>
          </div>
        </div>

        {/* ── History Panel ── */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '12px 18px', marginBottom: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 12, fontFamily: 'DM Mono, monospace' }}>
            {historyCount > 0 ? (
              <><span style={{ color: 'var(--text)', fontWeight: 500 }}>{historyCount.toLocaleString()}</span><span style={{ color: 'var(--muted)' }}> in history</span></>
            ) : (
              <span style={{ color: 'var(--muted)' }}>No history — run a batch or import</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input ref={historyFileRef} type="file" accept=".xlsx,.xls" onChange={importHistory} style={{ display: 'none' }} />
            <button
              onClick={() => historyFileRef.current?.click()}
              style={{
                background: 'transparent', border: '1px solid var(--border)',
                borderRadius: 5, padding: '5px 12px', color: 'var(--accent)',
                cursor: 'pointer', fontSize: 11, fontFamily: 'DM Mono, monospace',
              }}
            >Import</button>
            {historyCount > 0 && (
              <button
                onClick={handleClearHistory}
                style={{
                  background: 'transparent', border: '1px solid var(--border)',
                  borderRadius: 5, padding: '5px 12px', color: 'var(--muted)',
                  cursor: 'pointer', fontSize: 11, fontFamily: 'DM Mono, monospace',
                }}
              >Clear</button>
            )}
          </div>
        </div>

        {/* Import Message */}
        {importMessage && (
          <div style={{
            background: 'var(--accent-glow)', border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: 8, padding: '10px 16px', marginBottom: 14, fontSize: 12, color: 'var(--accent)',
            fontFamily: 'DM Mono, monospace',
          }}>{importMessage}</div>
        )}

        {/* ── File Upload ── */}
        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `1px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 10, padding: '40px 24px', textAlign: 'center',
            cursor: 'pointer', marginBottom: 28, transition: 'all 0.2s',
            background: dragOver ? 'var(--accent-glow)' : 'var(--surface)',
          }}
        >
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileInput} style={{ display: 'none' }} />
          {fileName ? (
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, letterSpacing: '-0.01em' }}>{fileName}</div>
              <div style={{ color: 'var(--pass)', fontSize: 13, fontFamily: 'DM Mono, monospace' }}>{rows.length} companies loaded</div>
              {cachedCount > 0 && (
                <div style={{ color: 'var(--accent)', fontSize: 11, marginTop: 6, fontFamily: 'DM Mono, monospace' }}>
                  {cachedCount} cached &middot; {newCount} new
                </div>
              )}
            </div>
          ) : (
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, letterSpacing: '-0.01em' }}>Drop CSV or Excel here</div>
              <div style={{ color: 'var(--muted)', fontSize: 12, fontFamily: 'DM Mono, monospace' }}>
                company name + website columns
              </div>
            </div>
          )}
        </div>

        {/* ── Action Bar ── */}
        {(rows.length > 0 || results.length > 0) && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 28, alignItems: 'center', flexWrap: 'wrap' }}>
            {!processing && rows.length > 0 && (
              <button
                onClick={() => runQualification(false)}
                disabled={!apiKey}
                style={{
                  background: apiKey ? 'linear-gradient(135deg, var(--accent) 0%, #818cf8 100%)' : 'var(--border)',
                  border: 'none', borderRadius: 7, padding: '11px 24px',
                  color: 'white', fontWeight: 700, fontSize: 13,
                  cursor: apiKey ? 'pointer' : 'not-allowed',
                  fontFamily: 'Syne, sans-serif', letterSpacing: '-0.01em',
                  boxShadow: apiKey ? '0 2px 16px var(--accent-glow)' : 'none',
                }}
              >
                {cachedCount > 0 ? `Run \u2192 ${newCount} new + ${cachedCount} cached` : `Run \u2192 ${rows.length} companies`}
              </button>
            )}
            {canResume && (
              <button
                onClick={() => runQualification(true)}
                disabled={!apiKey}
                style={{
                  background: apiKey ? 'linear-gradient(135deg, var(--accent) 0%, #818cf8 100%)' : 'var(--border)',
                  border: 'none', borderRadius: 7, padding: '11px 24px',
                  color: 'white', fontWeight: 700, fontSize: 13,
                  cursor: apiKey ? 'pointer' : 'not-allowed',
                  fontFamily: 'Syne, sans-serif',
                  boxShadow: apiKey ? '0 2px 16px var(--accent-glow)' : 'none',
                }}
              >Resume \u2192 {rows.length - results.length} left</button>
            )}
            {processing && (
              <button
                onClick={stopProcessing}
                style={{
                  background: 'var(--fail)', border: 'none', borderRadius: 7,
                  padding: '11px 24px', color: 'white', fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', fontFamily: 'Syne, sans-serif',
                }}
              >Stop</button>
            )}
            {results.length > 0 && !processing && (
              <button
                onClick={clearResults}
                style={{
                  background: 'transparent', border: '1px solid var(--border)',
                  borderRadius: 7, padding: '10px 18px',
                  color: 'var(--muted)', fontWeight: 500, fontSize: 13,
                  cursor: 'pointer', fontFamily: 'Syne, sans-serif',
                }}
              >Clear</button>
            )}
            {results.length > 0 && (
              <button
                onClick={exportResults}
                style={{
                  background: 'transparent', border: '1px solid var(--pass)',
                  borderRadius: 7, padding: '10px 24px', marginLeft: 'auto',
                  color: 'var(--pass)', fontWeight: 600, fontSize: 13,
                  cursor: 'pointer', fontFamily: 'DM Mono, monospace',
                }}
              >Export .xlsx</button>
            )}
          </div>
        )}

        {/* ── Progress ── */}
        {processing && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11, color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>
              <span style={{ opacity: 0.8 }}>{currentCompany}</span>
              <span>{progress}% &middot; {results.length}/{rows.length}{eta && ` \u2022 ${eta}`}</span>
            </div>
            <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
              <div style={{
                height: '100%',
                background: 'linear-gradient(90deg, var(--accent) 0%, #818cf8 50%, var(--accent) 100%)',
                backgroundSize: '200% 100%',
                width: `${progress}%`, transition: 'width 0.4s ease',
                borderRadius: 2,
                animation: 'progress-glow 2s ease infinite',
              }} />
            </div>
          </div>
        )}

        {/* ── Stats ── */}
        {results.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
            {[
              { label: 'PASS', count: counts.pass, color: 'var(--pass)', dim: 'var(--pass-dim)' },
              { label: 'MAYBE', count: counts.maybe, color: 'var(--maybe)', dim: 'var(--maybe-dim)' },
              { label: 'FAIL', count: counts.fail, color: 'var(--fail)', dim: 'var(--fail-dim)' },
              { label: 'ERROR', count: counts.error, color: 'var(--muted)', dim: 'var(--surface)' },
            ].map(stat => (
              <div key={stat.label} style={{
                background: stat.dim, border: `1px solid ${stat.color}15`,
                borderRadius: 8, padding: '14px 18px',
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ fontSize: 30, fontWeight: 800, color: stat.color, lineHeight: 1, letterSpacing: '-0.04em' }}>{stat.count}</div>
                <div style={{ fontSize: 10, color: stat.color, marginTop: 4, fontFamily: 'DM Mono, monospace', opacity: 0.7, letterSpacing: '0.06em' }}>{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Restore Banner */}
        {restoredCount > 0 && !processing && (
          <div style={{
            background: 'var(--accent-glow)', border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: 8, padding: '10px 16px', marginBottom: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: 12, fontFamily: 'DM Mono, monospace',
          }}>
            <span style={{ color: 'var(--accent)' }}>Restored {restoredCount} results from last session</span>
            <button
              onClick={() => setRestoredCount(0)}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '2px 6px' }}
            >&times;</button>
          </div>
        )}

        {/* ── Filters ── */}
        {results.length > 0 && (
          <div style={{ display: 'flex', gap: 0, marginBottom: 14, alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
            {(['ALL', 'PASS', 'MAYBE', 'FAIL'] as FilterTab[]).map(tab => {
              const tabCount = tab === 'ALL' ? results.length : counts[tab.toLowerCase() as keyof typeof counts];
              const isActive = filterTab === tab;
              const tabColor = tab === 'ALL' ? 'var(--accent)' : RESULT_COLORS[tab];
              return (
                <button
                  key={tab}
                  onClick={() => { setFilterTab(tab); setVisibleCount(50); }}
                  style={{
                    background: 'transparent', border: 'none',
                    borderBottom: isActive ? `2px solid ${tabColor}` : '2px solid transparent',
                    padding: '8px 16px', marginBottom: -1,
                    color: isActive ? tabColor : 'var(--muted)',
                    cursor: 'pointer', fontSize: 11, fontFamily: 'DM Mono, monospace',
                    fontWeight: isActive ? 500 : 400,
                    transition: 'all 0.15s',
                    letterSpacing: '0.02em',
                  }}
                >{tab} <span style={{ opacity: 0.6 }}>{tabCount}</span></button>
              );
            })}
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setVisibleCount(50); }}
              style={{
                marginLeft: 'auto', background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 5, padding: '5px 12px', color: 'var(--text)',
                fontFamily: 'DM Mono, monospace', fontSize: 11, outline: 'none', width: 180,
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)',
              }}
            />
          </div>
        )}

        {/* ── Results ── */}
        {results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6, fontFamily: 'DM Mono, monospace', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {searchQuery || filterTab !== 'ALL'
                ? `${filteredResults.length} of ${results.length}`
                : `${results.length} results`}
            </div>
            {visibleResults.map((r) => {
              const realIdx = results.indexOf(r);
              const isExpanded = expandedCards.has(realIdx);
              const accentColor = RESULT_COLORS[r.result] || 'var(--border)';
              return (
                <div key={realIdx} style={{
                  background: 'var(--surface)',
                  border: `1px solid var(--border-subtle)`,
                  borderLeft: `2px solid ${accentColor}`,
                  borderRadius: 8, padding: '10px 14px',
                  transition: 'all 0.15s ease',
                }}>
                  {/* Compact row */}
                  <div
                    onClick={() => toggleCard(realIdx)}
                    style={{ display: 'grid', gridTemplateColumns: '62px 1fr auto', gap: 10, alignItems: 'center', cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                      <span style={{
                        padding: '2px 0', width: '100%', borderRadius: 3,
                        background: accentColor + '18', color: accentColor,
                        fontFamily: 'DM Mono, monospace', fontSize: 10, fontWeight: 500,
                        textAlign: 'center', letterSpacing: '0.04em',
                      }}>{r.result}</span>
                      {r.second_pass_used && (
                        <span style={{ fontSize: 8, color: 'var(--accent)', fontFamily: 'DM Mono, monospace', letterSpacing: '0.02em' }}>2nd pass</span>
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, letterSpacing: '-0.01em', color: 'var(--text)' }}>{r.company}</span>
                        <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'DM Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.website}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'DM Mono, monospace', fontWeight: 300 }}>
                        {r.reason}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', userSelect: 'none', padding: '0 4px', opacity: 0.5 }}>{isExpanded ? '\u25B4' : '\u25BE'}</div>
                  </div>

                  {/* Expanded */}
                  {isExpanded && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)', animation: 'expand-in 0.2s ease' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 10 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'DM Mono, monospace', fontWeight: 300, lineHeight: 1.6 }}>
                          {r.owner_name && r.owner_name !== 'Unknown' && (
                            <div style={{ marginBottom: 4 }}><span style={{ color: 'var(--text)', fontWeight: 400 }}>Owner</span> {r.owner_name}</div>
                          )}
                          {r.services_detected && (
                            <div style={{ marginBottom: 4 }}><span style={{ color: 'var(--text)', fontWeight: 400 }}>Services</span> {r.services_detected}</div>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'DM Mono, monospace', fontWeight: 300, lineHeight: 1.6 }}>
                          {r.clients_served && (
                            <div style={{ marginBottom: 4 }}><span style={{ color: 'var(--text)', fontWeight: 400 }}>Clients</span> {r.clients_served}</div>
                          )}
                          <div><span style={{ color: 'var(--text)', fontWeight: 400 }}>Confidence</span> {r.confidence}</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                        <input
                          type="text"
                          placeholder="Add note..."
                          value={r.notes || ''}
                          onChange={e => updateResult(realIdx, { notes: e.target.value })}
                          style={{
                            flex: 1, background: 'var(--bg)', border: '1px solid var(--border-subtle)',
                            borderRadius: 5, padding: '5px 10px', color: 'var(--text)',
                            fontFamily: 'DM Mono, monospace', fontSize: 10, outline: 'none',
                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)',
                          }}
                        />
                        <select
                          value={r.userDecision || ''}
                          onChange={e => updateResult(realIdx, { userDecision: e.target.value as EnrichedResult['userDecision'] })}
                          style={{
                            background: 'var(--bg)', border: '1px solid var(--border-subtle)',
                            borderRadius: 5, padding: '5px 10px', color: r.userDecision ? RESULT_COLORS[r.userDecision] || 'var(--text)' : 'var(--muted)',
                            fontFamily: 'DM Mono, monospace', fontSize: 10, outline: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <option value="">Your Decision</option>
                          <option value="PASS">PASS</option>
                          <option value="MAYBE">MAYBE</option>
                          <option value="FAIL">FAIL</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {visibleCount < filteredResults.length && (
              <button
                onClick={() => setVisibleCount(prev => prev + 50)}
                style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 7, padding: '10px', color: 'var(--muted)',
                  cursor: 'pointer', fontSize: 11, fontFamily: 'DM Mono, monospace',
                  marginTop: 6, letterSpacing: '0.02em',
                }}
              >Show more \u2022 {filteredResults.length - visibleCount} remaining</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
