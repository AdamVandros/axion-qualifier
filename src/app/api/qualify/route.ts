import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { ICP_PROMPT, scrapeWebsite } from '@/lib/qualifier';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { company, website, apiKey } = await req.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'No API key provided' }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey });

    // Scrape website
    let websiteContent = 'No website provided';
    if (website) {
      websiteContent = await scrapeWebsite(website);
    }

    const userMessage = `Company: ${company}
Website: ${website || 'Not provided'}
Website Content:
${websiteContent}

Evaluate this company against the Axion ICP criteria.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: ICP_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: 300,
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    
    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      parsed = {
        result: 'MAYBE',
        services_detected: 'Parse error',
        clients_served: 'Unknown',
        employee_estimate: 'Unknown',
        reason: 'Could not parse AI response',
        confidence: 'LOW',
      };
    }

    return NextResponse.json({
      company,
      website,
      ...parsed,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
