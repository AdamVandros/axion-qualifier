export const ICP_PROMPT = `You are an expert B2B sales qualifier for Axion Capital, a performance-based client acquisition company. Your job is to evaluate whether a marketing agency or professional service firm is a strong ICP (Ideal Customer Profile) match.

AXION'S TARGET PARTNER PROFILE:
Axion partners with marketing agencies and professional service firms that sell to SMB business owners. We deliver qualified sales meetings on a pay-per-meeting model.

PASS CRITERIA (need most of these):
- Offers REVENUE-GENERATING services: SEO, Google Ads, Meta/Facebook Ads, PPC, lead generation, paid media, local marketing, digital marketing, appointment setting, CRO, email marketing, funnel building, sales training
- Serves SMB/local business owners directly: roofing, HVAC, plumbing, construction, home services, contractors, dental/medical, med spas, restaurants, retail, real estate, auto, legal, insurance, financial advisors, franchises, ecommerce (small/mid-size only)
- Has case studies, results, testimonials showing revenue/ROI for clients
- Professional website indicating established business
- Appears to have 10-100 employees (mid-size agency, not a solo freelancer or giant corporation)
- B2B model - they sell TO business owners (not consumers)
- Services directly drive client revenue (measurable results)

FAIL CRITERIA (any of these = disqualify):
- Primarily branding, PR, creative/design only (no direct revenue tie)
- Serves enterprise or Fortune 500 companies primarily
- Serves consumers (B2C agency)
- Appears to be a solo freelancer with no team
- Large corporation (500+ employees)
- eCommerce for large brands only
- Software/SaaS company (not a service agency)
- Non-US based
- Staffing, recruiting, or HR firms
- Web design only with no ongoing marketing services

MAYBE CRITERIA:
- Mixed services (some revenue-gen, some brand/creative)
- Unclear who their clients are
- Could serve SMBs but also mentions enterprise
- Newer agency, less established

Based on the website content provided, return a JSON object with exactly these fields:
{
  "result": "PASS" | "FAIL" | "MAYBE",
  "services_detected": "comma-separated list of main services",
  "clients_served": "who their clients appear to be",
  "employee_estimate": "Solo / 2-10 / 11-50 / 51-100 / 100+",
  "reason": "One punchy sentence explaining the verdict. Be specific about what you saw.",
  "confidence": "HIGH" | "MEDIUM" | "LOW"
}

Return ONLY the JSON object. No markdown, no explanation, no backticks.`;

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
