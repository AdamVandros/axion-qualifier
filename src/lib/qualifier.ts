export const ICP_PROMPT = `You are a lead pre-screener for Axion Capital. Your job is to quickly determine if a marketing agency is an OBVIOUS disqualify, an OBVIOUS pass, or needs deeper research.

Axion delivers qualified sales meetings to marketing agencies. We need agency partners that:
1. Serve small/local business owners (SMBs)
2. Offer retainer-based, revenue-driving services (paid ads, SEO, PPC, lead gen) as their PRIMARY service
3. Have high enough ticket size to justify our partnership (ACV $20k+, typically $2k+/mo retainers)

ONLY mark as HIGH confidence PASS if the website clearly shows ALL of these:
- Primary services are revenue-driving: paid social/Meta Ads, Google Ads/PPC, SEO, lead generation
- Clear focus on small/local business owners as primary clients
- Professional site with team and results/case studies showing revenue growth (leads generated, sales increased, conversions improved)

ONLY mark as HIGH confidence FAIL (skip second pass) if the website clearly shows ONE of these:
- Exclusively serves Fortune 500 / large national enterprises with ZERO mention of small businesses
- Staffing, recruiting, or HR firm (not a marketing agency at all)
- B2C company serving consumers directly
- Solo freelancer portfolio site with no team
- Non-US based with no US operations
- PRIMARY service is web design/development (they lead with it, portfolio shows websites they built, case studies showcase site launches — not revenue results)
- PRIMARY service is branding, creative, photography, or video production (not performance marketing)
- PR agency (case studies about press coverage and media placements, not revenue growth)
- Direct mail, signage, print, or referral marketing company
- Agency has NO mention of paid ads, SEO, PPC, or lead generation anywhere on the site
- Clearly low-ticket/project-based: advertises month-to-month, one-time projects, or pricing under $1k/mo

For EVERYTHING ELSE → set needs_second_pass: true. This includes:
- Agency offers web design AND paid ads/SEO (need to determine which is primary)
- Any mention of automotive, dealerships, or car-related clients
- Any mention of MSP, managed services, or IT companies as clients
- Any agency with mixed client types (some big, some small)
- Any agency where client size is unclear
- Any agency serving healthcare, legal, real estate, or financial services (could be large or small)
- Any agency with "enterprise" anywhere on their site even if they also mention small business
- Any franchise-related marketing
- Any eCommerce agency (need to verify if small DTC or large brands)
- Any restaurant, hospitality, or food industry agency
- Case studies that are ambiguous (could be portfolios or could be results)
- Any pricing signals on the website that need closer evaluation
- Anything where you're not 100% certain on client size OR service type

Be LIBERAL about triggering second pass. It costs almost nothing and prevents false negatives.

Return ONLY this JSON, no backticks, no explanation:
{
  "result": "PASS" | "FAIL" | "MAYBE",
  "services_detected": "comma-separated list of main services you can identify",
  "clients_served": "your best read on who their clients are",
  "reason": "One sentence. What specifically did you see that drove this verdict?",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "needs_second_pass": true | false
}

When in doubt: needs_second_pass: true. Always.`;

export const SECOND_PASS_PROMPT = `You are the FINAL qualifier for Axion Capital's partner pipeline. You are making the definitive pass/fail decision on a marketing agency.

AXION'S BUSINESS: We deliver qualified sales meetings to marketing agencies. Our SMS and outbound system works best reaching small business owners — local, physical businesses or small product-based businesses. We need agency partners whose clients ARE these kinds of business owners AND who sell high-ticket retainer services that drive revenue.

EVALUATE THESE THREE DIMENSIONS — ALL must be true for PASS:

1. WHO THEY SERVE: Do they work with SMBs / small business owners?
   - Local businesses, independent operators, small companies (sub $10M revenue)
   - B2B agencies are fine IF their clients are small (commercial landscaping, cleaning, commercial roofing, etc.)

2. WHAT THEY SELL: Is their PRIMARY service retainer-based and revenue-driving?
   - GOOD primary services: Paid social/Meta Ads, Google Ads/PPC, SEO, lead generation, digital marketing retainers
   - BAD primary services: Web design/development, branding, creative, photography, video production, PR, direct mail, signage, referral marketing
   - KEY TEST: What does the agency LEAD with on their homepage and LinkedIn? What do they talk about first? If they lead with web design or branding but also mention ads — that's a red flag that the revenue-driving services are secondary.
   - ACV CHECK: Their average contract value should be at least $20-25k/year ($2k+/mo retainers). Signs of low-ticket: month-to-month, one-time projects, pricing under $1k/mo, project-based work.

3. HOW THEY PROVE IT: What do their case studies and results showcase?
   - GOOD case studies: "Increased leads by 300%", "Generated 50 appointments/month", "Grew revenue by $2M", "Reduced cost per lead to $15" — concrete revenue/lead/conversion metrics
   - BAD case studies: Portfolio of websites they designed, brand identity work they did, commercials they produced, PR press hits — these are creative showcases, not revenue results
   - If they call their results page a "portfolio" and it shows websites/creative work → likely a design-first agency
   - No case studies at all → note as a concern but don't auto-fail

You have website content AND fresh web research. Use both. The web research is often more revealing than the website.

PASS — ALL of these must be true:
- They serve SMBs / small business owners (even if mixed with some larger clients)
- Their PRIMARY service is retainer-based and directly drives revenue (paid ads, SEO, PPC, lead gen)
- Their case studies (if present) showcase revenue/lead/growth results, not just creative work
- They appear to have a reasonable ticket size (not clearly low-cost or month-to-month)

FAIL — if ANY of these are true:
- Exclusively serves large enterprise / Fortune 500 with no SMB clients
- PRIMARY service is web design/development (they lead with it, portfolio shows websites)
- PRIMARY service is branding, creative, photography, or video production
- PR agency (case studies about press coverage, not revenue growth)
- Direct mail, signage, print, or referral marketing company
- Clearly low-ticket: month-to-month, very low pricing, one-off project work
- No mention of paid ads, SEO, PPC, or lead generation anywhere

NUANCED EDGE CASES:
- Agency does web design AND paid ads/SEO: lean PASS if they meaningfully offer paid ads/SEO/lead gen AND their case studies show revenue/lead/conversion results. Case studies are the override — strong revenue results = PASS even if web design is also prominently featured. Only FAIL if web design is clearly primary AND case studies are a creative portfolio AND there is no meaningful paid ads/SEO/lead gen presence.
- Automotive agencies: independent dealerships (1-10 locations) = SMB. Only fail massive dealer groups
- MSP/IT marketing: small MSPs are SMBs. Only fail if exclusively enterprise IT
- Healthcare marketing: private practices, dental, med spas = PASS. Hospital systems = FAIL
- Legal marketing: small firms, solo practitioners = PASS. BigLaw only = FAIL
- Restaurant marketing: independent restaurants, local chains = PASS. National QSR only = FAIL
- Real estate: agents, teams, small brokerages = PASS. Large developers/REITs only = FAIL
- eCommerce: small DTC brands, Shopify stores = PASS. Large retailers = FAIL
- Franchisees: individual franchise owners are SMBs = PASS

IMPORTANT: Many agencies show off big-name clients for credibility but their real bread-and-butter is SMB. That's fine — evaluate based on the bulk of their client base, not just their trophy logos.

Return ONLY this JSON, no backticks:
{
  "result": "PASS" | "FAIL" | "MAYBE",
  "services_detected": "comprehensive comma-separated list of all services identified from both sources",
  "clients_served": "detailed description of client types from both website and web research",
  "reason": "One punchy sentence. What specifically made this a pass or fail? Reference the three dimensions.",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "owner_name": "Full name and title of the agency owner/CEO/founder if found in research, or 'Unknown'",
  "second_pass_used": true
}

When genuinely unclear after both sources: MAYBE. But require evidence across all three dimensions to PASS.`;

// Keywords that force second pass regardless of Pass 1 confidence
export const FORCE_SECOND_PASS_KEYWORDS = [
  // Industry verticals that need deeper evaluation
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
  // Service types that may disqualify — need second pass to confirm if primary
  'web design', 'website design', 'web development',
  'branding', 'brand identity', 'brand strategy',
  'creative agency', 'creative studio',
  'photography', 'video production', 'videography',
  'direct mail', 'signage', 'print',
  'public relations', 'pr agency', 'media relations',
  'referral marketing', 'referral program',
];

export async function scrapeWebsite(url: string): Promise<string> {
  let normalizedUrl = url.trim();
  if (!normalizedUrl.startsWith('http')) {
    normalizedUrl = 'https://' + normalizedUrl;
  }

  const base = normalizedUrl.replace(/\/$/, '');
  const pagesToTry = [
    base,
    `${base}/about`,
    `${base}/services`,
    `${base}/case-studies`,
    `${base}/portfolio`,
    `${base}/work`,
    `${base}/results`,
    `${base}/pricing`,
  ];
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
  return combinedText.slice(0, 10000) || 'Could not fetch website content';
}

export function shouldForceSecondPass(pass1Result: Record<string, unknown>): boolean {
  const textToCheck = [
    String(pass1Result.reason || ''),
    String(pass1Result.clients_served || ''),
    String(pass1Result.services_detected || ''),
  ].join(' ').toLowerCase();

  return FORCE_SECOND_PASS_KEYWORDS.some(keyword => textToCheck.includes(keyword));
}

export async function searchOwner(
  company: string,
  domain: string,
  perplexityKey: string
): Promise<string> {
  try {
    const query = `Who is the founder, CEO, or owner of the marketing agency "${company}" (website: ${domain})? Return just the person's name and title if found. If multiple owners/founders, list them. If unknown, say "Unknown".`;

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: query }],
        max_tokens: 100,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return 'Unknown';
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || 'Unknown';
  } catch {
    return 'Unknown';
  }
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
3. What marketing services do they provide? What is their PRIMARY service — what do they lead with? (SEO, PPC, Meta Ads, lead generation, web design, branding, PR, etc.)
4. Are their clients typically independent small business owners, or large corporations?
5. Any specific client examples or case studies? Do their case studies showcase revenue/lead/conversion results, or do they showcase creative work like websites, logos, and brand identity?
6. Is their business model retainer-based (monthly contracts, ongoing services) or project-based (one-time website builds, campaigns)?
7. Any pricing information available? What are their typical price points or retainer fees?
8. Who is the founder, CEO, or owner of this agency? Full name and title if known.

Be specific and factual. If they serve a mix of client sizes, say so clearly. Focus especially on what their PRIMARY service is and whether it directly drives revenue for their clients.`;

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: query }],
        max_tokens: 600,
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