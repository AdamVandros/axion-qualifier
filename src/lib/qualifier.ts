export const ICP_PROMPT = `You are a lead pre-screener for Axion Capital. Your job is NOT to make the final qualification decision — your job is to quickly determine if a company is an OBVIOUS disqualify, an OBVIOUS pass, or needs deeper research.

ONLY mark as HIGH confidence PASS if the website clearly shows:
- Revenue-generating marketing services (SEO, PPC, Meta Ads, lead gen, etc.)
- Clear focus on small/local business owners as primary clients
- Professional site with team and results

ONLY mark as HIGH confidence FAIL (skip second pass) if the website clearly shows ONE of these with no ambiguity:
- Exclusively serves Fortune 500 / large national enterprises with ZERO mention of small businesses
- Staffing, recruiting, or HR firm (not a marketing agency at all)
- B2C company serving consumers directly
- Solo freelancer portfolio site with no team
- Non-US based with no US operations
- Pure web design/dev shop with zero ongoing marketing services

For EVERYTHING ELSE → set needs_second_pass: true. This includes:
- Any mention of automotive, dealerships, or car-related clients
- Any mention of MSP, managed services, or IT companies as clients
- Any agency with mixed client types (some big, some small)
- Any agency where client size is unclear
- Any agency serving healthcare, legal, real estate, or financial services (could be large or small)
- Any agency with "enterprise" anywhere on their site even if they also mention small business
- Any franchise-related marketing
- Any eCommerce agency (need to verify if small DTC or large brands)
- Any restaurant, hospitality, or food industry agency
- Anything where you're not 100% certain client size is SMB

Be LIBERAL about triggering second pass. It costs almost nothing and prevents false negatives.
False negatives (missing a good lead) are far more costly than false positives.

EMPLOYEE ESTIMATE:
Infer from team pages, about sections, case study volume, office mentions.

Return ONLY this JSON, no backticks, no explanation:
{
  "result": "PASS" | "FAIL" | "MAYBE",
  "services_detected": "comma-separated list of main services you can identify",
  "clients_served": "your best read on who their clients are",
  "employee_estimate": "Solo / 2-10 / 11-50 / 51-100 / 100+ / Unknown",
  "reason": "One sentence. What specifically did you see that drove this verdict?",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "needs_second_pass": true | false
}

When in doubt: needs_second_pass: true. Always.`;

export const SECOND_PASS_PROMPT = `You are the FINAL qualifier for Axion Capital's partner pipeline. You are making the definitive pass/fail decision on a marketing agency.

AXION'S BUSINESS: We deliver qualified sales meetings to marketing agencies. Our SMS and outbound system works best reaching small business owners — local, physical businesses or small product-based businesses. We need agency partners whose clients ARE these kinds of business owners.

THE ONLY QUESTION THAT MATTERS:
Does this agency serve small business owners anywhere in their client base?

You have website content AND fresh web research. Use both. The web research is often more revealing than the website.

PASS — if any of these are true:
- They serve small business owners as their PRIMARY focus
- They serve a MIX of clients that includes small businesses (even if they also have some larger clients)
- Their niche (automotive, healthcare, legal, etc.) includes small/independent operators
- Web research shows they have SMB clients even if the website is vague
- They serve franchisees (franchisees are owner-operators = SMB)
- They serve independent professionals (agents, advisors, doctors, lawyers in private practice)
- Their case studies show small companies even if they don't explicitly say "SMB"

FAIL — only if ALL of these point the same direction:
- Website AND web research both confirm exclusively large enterprise clients
- No mention of small businesses anywhere in either source
- Clearly positioned as enterprise-only with enterprise pricing/case studies

PASS-WORTHY EDGE CASES (always PASS these):
- Automotive agencies: independent dealerships (1-10 locations) = SMB. Only fail massive dealer groups
- MSP/IT marketing: small MSPs are SMBs. Only fail if exclusively enterprise IT departments
- Healthcare marketing: private practices, dental groups, med spas, chiropractors = PASS. Hospital systems = FAIL
- Legal marketing: small law firms, solo practitioners, personal injury, family law = PASS. BigLaw only = FAIL  
- Restaurant marketing: independent restaurants, local chains = PASS. National QSR only = FAIL
- Real estate: agents, teams, small brokerages = PASS. Large developers/REITs only = FAIL
- eCommerce: DTC brands, Shopify stores, small product companies = PASS. Large retailers/enterprise = FAIL
- Mixed portfolios: if they serve ANY small businesses alongside larger clients = PASS

IMPORTANT: Many agencies show off big-name clients for credibility but their real bread-and-butter is SMB. 
If web research shows ANY small business clients, lean PASS.

Return ONLY this JSON, no backticks:
{
  "result": "PASS" | "FAIL" | "MAYBE",
  "services_detected": "comprehensive comma-separated list of all services identified from both sources",
  "clients_served": "detailed description of client types from both website and web research",
  "employee_estimate": "Solo / 2-10 / 11-50 / 51-100 / 100+ / Unknown",
  "reason": "One punchy sentence. What specifically from the web research changed or confirmed the verdict?",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "second_pass_used": true
}

When genuinely unclear after both sources: MAYBE. But if web research shows ANY SMB presence: PASS.`;

// Keywords that force second pass regardless of Pass 1 confidence
export const FORCE_SECOND_PASS_KEYWORDS = [
  'automotive', 'dealership', 'dealer', 'car dealer', 'auto dealer',
  'msp', 'managed service', 'managed it', 'it services', 'it company',
  'enterprise', 'fortune', 'corporate',
  'franchise', 'franchis',
  'restaurant', 'hospitality', 'food service',
  'healthcare', 'medical', 'dental', 'health system',
  'legal', 'law firm', 'attorney',
  'real estate', 'realtor', 'property',
  'ecommerce', 'e-commerce', 'shopify', 'dtc',
  'mixed', 'various industries', 'all industries', 'diverse',
];

export async function scrapeWebsite(url: string): Promise<string> {
  let normalizedUrl = url.trim();
  if (!normalizedUrl.startsWith('http')) {
    normalizedUrl = 'https://' + normalizedUrl;
  }

  const base = normalizedUrl.replace(/\/$/, '');
  const pagesToTry = [base, `${base}/about`, `${base}/services`];
  let combinedText = '';

  for (const pageUrl of pagesToTry) {
    try {
      const response = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) continue;
      const html = await response.text();
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 2500);
      if (text.length > 100) combinedText += `\n\n[PAGE: ${pageUrl}]\n${text}`;
    } catch { }
  }
  return combinedText.slice(0, 6000) || 'Could not fetch website content';
}

export function shouldForceSecondPass(pass1Result: Record<string, unknown>): boolean {
  const textToCheck = [
    String(pass1Result.reason || ''),
    String(pass1Result.clients_served || ''),
    String(pass1Result.services_detected || ''),
  ].join(' ').toLowerCase();

  return FORCE_SECOND_PASS_KEYWORDS.some(keyword => textToCheck.includes(keyword));
}

export async function searchPerplexity(
  company: string,
  domain: string,
  perplexityKey: string
): Promise<string> {
  try {
    const query = `Research the marketing agency "${company}" (website: ${domain}). Please tell me:
1. Do they work with small businesses, local businesses, or SMB clients? Even if they also have larger clients, do small businesses make up ANY part of their client base?
2. What specific industries or niches do their clients come from? (e.g. roofing, dental, automotive dealers, restaurants, etc.)
3. What marketing services do they provide? (SEO, PPC, Meta Ads, lead generation, etc.)
4. Are their clients typically independent small business owners, or large corporations?
5. Any specific client examples or case studies that reveal the size of their typical client?

Be specific and factual. If they serve a mix of client sizes, say so clearly.`;

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: query }],
        max_tokens: 500,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Perplexity error:', error);
      return 'Perplexity search unavailable';
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'No results from web search';
  } catch (err) {
    console.error('Perplexity fetch error:', err);
    return 'Perplexity search failed';
  }
}