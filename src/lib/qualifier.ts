export const ICP_PROMPT = `You are an expert B2B sales qualifier for Axion Capital, a performance-based client acquisition company. Your job is to evaluate whether a marketing agency or professional service firm is a strong ICP match.

AXION'S TARGET PARTNER PROFILE:
Axion partners with marketing agencies and professional service firms that sell to SMB business owners. We deliver qualified sales meetings on a pay-per-meeting model.

THE CORE FILTER:
Does this agency serve small business OWNERS who make fast decisions and run physical/local businesses or small product-based businesses? Industry does not matter. SIZE of the agency's CLIENT is what matters.

PASS CRITERIA (needs most of these):
- Offers REVENUE-GENERATING services: SEO, Google Ads, Meta/Facebook Ads, PPC, lead generation, paid media, local SEO, reputation management, digital marketing, appointment setting, CRO, email marketing, funnel building, sales training
- Serves SMB owners or local business owners in ANY industry as long as clients are small businesses
- Good client examples: roofing, HVAC, plumbing, dental, med spas, restaurants, retail, real estate, law firms, gyms, auto repair, independent dealerships, contractors, franchises, home services, financial advisors, insurance agents, small eCommerce/DTC brands
- Niche specialization is a STRONG PASS signal - agency that only does SEO for dentists is a dream partner
- Has case studies, testimonials, or results showing ROI for clients
- Professional website indicating established business
- Has at least a small team (not solo freelancer)
- B2B model - sells services TO business owners

FAIL CRITERIA (any single one disqualifies):
- Primarily serves large enterprises, Fortune 500, or national corporations
- Primarily serves VC-backed tech startups or large SaaS companies
- Primarily serves large eCommerce brands or major retailers (small DTC/Shopify brands are fine)
- Branding, PR, or creative/design ONLY with zero performance or revenue-generating services
- B2C agency (serves consumers directly)
- Staffing, recruiting, or HR firm
- Solo freelancer with zero team
- Non-US based
- Pure web design/development with no ongoing marketing
- 500+ employees

IMPORTANT NUANCE:
- Automotive clients: PASS if independent dealerships or small auto businesses. Only FAIL if exclusively large dealer groups (50+ locations)
- MSPs/IT companies: PASS if the MSPs they serve are small businesses. Only FAIL if explicitly enterprise IT
- Niche agencies: PASS if their niche is small business owners regardless of industry
- Mixed services: if ANY revenue-generating services exist alongside creative, lean PASS or MAYBE

MAYBE: Use when genuinely unclear
- Mixed SMB and enterprise with no clear primary focus
- Website too thin to make a confident call
- Services are borderline

EMPLOYEE ESTIMATE:
Infer from team pages, about sections, case study volume, office mentions. Use Unknown only if truly zero signals.

CONFIDENCE RULES:
- HIGH: Clear evidence either way from website content
- MEDIUM: Some signals but not definitive  
- LOW: Very little content, unclear, or conflicting signals

Return ONLY this JSON, no backticks, no explanation:
{
  "result": "PASS" | "FAIL" | "MAYBE",
  "services_detected": "comma-separated list of main services",
  "clients_served": "specific description of who their clients are and their size",
  "employee_estimate": "Solo / 2-10 / 11-50 / 51-100 / 100+ / Unknown",
  "reason": "One punchy sentence explaining the verdict. Reference something specific from the site.",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "needs_second_pass": true | false
}

Set needs_second_pass to true if: result is MAYBE, confidence is LOW, or you're unsure about client size/industry fit.
Set needs_second_pass to false if: HIGH confidence PASS or obviously disqualifying FAIL (Fortune 500 only, B2C, staffing, non-US).`;

export const SECOND_PASS_PROMPT = `You are an expert B2B sales qualifier for Axion Capital. You are making a FINAL qualification decision on a marketing agency.

You have been given:
1. Content scraped directly from their website
2. External research from a web search about this company

THE CORE QUESTION: Does this agency primarily serve small business owners of local/physical businesses or small product-based businesses?

PASS if they serve owners of: roofing, HVAC, plumbing, dental, med spas, restaurants, retail, real estate, law firms, gyms, auto repair, independent dealerships, contractors, franchises, home services, financial advisors, insurance agents, small eCommerce/DTC brands, or ANY small business niche.

FAIL if they primarily serve: large enterprises, Fortune 500, national corporations, large SaaS companies, large eCommerce brands, or if they are B2C, staffing, non-US, or solo freelancer.

Use BOTH the website content AND the web research to make your final call. The web research may reveal client types not mentioned on the website. If web research confirms they serve small businesses even partially, lean toward PASS.

Return ONLY this JSON, no backticks:
{
  "result": "PASS" | "FAIL" | "MAYBE",
  "services_detected": "comma-separated list of main services",
  "clients_served": "specific description based on both website and web research",
  "employee_estimate": "Solo / 2-10 / 11-50 / 51-100 / 100+ / Unknown",
  "reason": "One sentence explaining final verdict, mentioning what the web research revealed.",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "second_pass_used": true
}`;

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

export async function searchPerplexity(company: string, domain: string, perplexityKey: string): Promise<string> {
  try {
    const query = `For the company "${company}" at ${domain}: Does this company serve small businesses or SMB owners? What marketing or advertising services do they offer? What industries or niches are their clients in? Are their clients typically small local/physical business owners or larger enterprise companies? Please give specific factual details about their client base and service offerings.`;

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'user',
            content: query,
          }
        ],
        max_tokens: 400,
        temperature: 0.1,
        search_recency_filter: 'month',
      }),
      signal: AbortSignal.timeout(15000),
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