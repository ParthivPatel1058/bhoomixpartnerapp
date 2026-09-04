import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

/**
 * Vercel serverless version of the `/api/ai-advice` route that `server.ts`
 * serves locally. Vercel only deploys the Vite static build, so the Express
 * server never runs in production — this file is what answers there.
 *
 * Files under `api/` are matched before the SPA rewrite in vercel.json, so this
 * does not get swallowed by the catch-all to index.html.
 *
 * Note the (req, res) signature: Vercel's Node runtime never invokes a handler
 * written against the Web `Request`/`Response` types, so such a function just
 * hangs until the gateway times out.
 */

const FALLBACK_ADVICE =
  'Peak delivery hours are between 5 PM and 8 PM. Stay near high-demand hubs and keep your ' +
  'ratings high to unlock bonus multipliers.';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(200).json({ advice: FALLBACK_ADVICE });

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents:
        'Give a 2-sentence motivating and practical tip for an on-demand delivery partner ' +
        'in India (BhoomiX Partner) looking to maximize earnings and maintain high ratings ' +
        'during peak hours.',
    });
    return res.status(200).json({ advice: response.text || FALLBACK_ADVICE });
  } catch (error) {
    console.error('ai-advice error:', error);
    // Never fail the request — the Profile screen treats this as optional flavour.
    return res.status(200).json({ advice: FALLBACK_ADVICE });
  }
}
