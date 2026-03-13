# Axion ICP Qualifier

Automated agency lead qualification tool. Upload a CSV/Excel of companies, it scrapes their websites and scores them PASS/FAIL/MAYBE against Axion's ICP criteria using GPT-4o-mini.

## What it checks
- Revenue-generating services (SEO, PPC, Meta Ads, lead gen, etc.)
- Serves SMB/local business owners (roofing, HVAC, dental, restaurants, etc.)
- Professional site with case studies/results
- Employee count signals (30-100 target)
- Disqualifies: branding-only, enterprise, B2C, solo freelancers, large corps

## Deploy to Vercel (5 minutes)

1. Push this repo to GitHub
2. Go to vercel.com → New Project → Import your GitHub repo
3. Click Deploy (no env vars needed)
4. Done — you'll get a URL like axion-qualifier.vercel.app

## Usage

1. Open the app
2. Paste your OpenAI API key (get one at platform.openai.com)
3. Export companies from Apollo as CSV with "Company Name" and "Website" columns
4. Drop the CSV into the app
5. Click Run
6. Export the scored Excel file when done
7. Pull phone numbers from Apollo/Lusha only for PASS results

## Cost
~$1-3 per 1,000 companies using gpt-4o-mini

## CSV Format
Your CSV needs at minimum:
- A column with "company" or "name" in the header
- A column with "website" or "url" or "domain" in the header

Apollo exports work perfectly out of the box.
