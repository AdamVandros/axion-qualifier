import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import {
  ICP_PROMPT,
  SECOND_PASS_PROMPT,
  scrapeWebsite,
  searchOwner,
  searchPerplexity,
  shouldForceSecondPass,
} from '@/lib/qualifier';

export const maxDuration = 45;

export async function POST(req: NextRequest) {
  try {
    const { company, website, apiKey, perplexityKey } = await req.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'No OpenAI API key provided' }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey });

    // PASS 1 — scrape website and get initial verdict
    let websiteContent = 'No website provided';
    if (website) {
      websiteContent = await scrapeWebsite(website);
    }

    const pass1Message = `Company: ${company}
Website: ${website || 'Not provided'}
Website Content:
${websiteContent}

Pre-screen this company.`;

    const pass1 = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: ICP_PROMPT },
        { role: 'user', content: pass1Message },
      ],
      temperature: 0.1,
      max_tokens: 350,
    });

    const pass1Text = pass1.choices[0]?.message?.content || '{}';

    let pass1Result: Record<string, unknown>;
    try {
      pass1Result = JSON.parse(pass1Text);
    } catch {
      pass1Result = {
        result: 'MAYBE',
        services_detected: 'Unknown',
        clients_served: 'Unknown',
        reason: 'Could not parse initial response',
        confidence: 'LOW',
        needs_second_pass: true,
      };
    }

    // Determine if second pass needed
    // Force second pass on: explicit flag, MAYBE, LOW confidence, OR keyword match in results
    const forceByKeyword = shouldForceSecondPass(pass1Result);
    const needsSecondPass =
      perplexityKey &&
      (pass1Result.needs_second_pass === true ||
        pass1Result.result === 'MAYBE' ||
        pass1Result.confidence === 'LOW' ||
        forceByKeyword);

    if (!needsSecondPass) {
      const ownerName = perplexityKey
        ? await searchOwner(company, website || company, perplexityKey as string)
        : '';
      return NextResponse.json({
        company,
        website,
        ...pass1Result,
        owner_name: ownerName,
        second_pass_used: false,
      });
    }

    // PASS 2 — Perplexity web research + definitive GPT verdict
    // Owner info is now included in Perplexity's 8th question, extracted by GPT into owner_name
    const perplexityAnswer = await searchPerplexity(company, website || company, perplexityKey as string);

    const pass2Message = `Company: ${company}
Website: ${website || 'Not provided'}

WEBSITE CONTENT:
${websiteContent}

WEB RESEARCH (fresh search results about this company):
${perplexityAnswer}

Pass 1 initial assessment: ${pass1Result.result} (${pass1Result.confidence} confidence)
Pass 1 reasoning: ${pass1Result.reason}

Now make the FINAL definitive qualification decision using all available information.`;

    const pass2 = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SECOND_PASS_PROMPT },
        { role: 'user', content: pass2Message },
      ],
      temperature: 0.1,
      max_tokens: 400,
    });

    const pass2Text = pass2.choices[0]?.message?.content || '{}';

    let pass2Result: Record<string, unknown>;
    try {
      pass2Result = JSON.parse(pass2Text);
    } catch {
      pass2Result = { ...pass1Result, second_pass_used: true };
    }

    return NextResponse.json({
      company,
      website,
      ...pass2Result,
      owner_name: pass2Result.owner_name || 'Unknown',
      second_pass_used: true,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
