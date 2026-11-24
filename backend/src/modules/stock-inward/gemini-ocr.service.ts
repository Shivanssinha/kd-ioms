import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export interface GeminiOcrResult {
  source: 'gemini' | 'none';
  batchNumber: string | null;
  expiryDate: string | null;
  mrp: number | null;
  rawText: string;
  error?: string;
}

export async function extractPackagingWithGemini(
  imageBase64: string,
  mimeType: string = 'image/jpeg'
): Promise<GeminiOcrResult> {
  const rawKey =
    process.env.GEMINI_API_KEY !== undefined
      ? process.env.GEMINI_API_KEY
      : env.GEMINI_API_KEY || '';
  const apiKey = rawKey.trim();

  if (!apiKey) {
    return {
      source: 'none',
      batchNumber: null,
      expiryDate: null,
      mrp: null,
      rawText: '',
      error: 'GEMINI_API_KEY_NOT_CONFIGURED',
    };
  }

  // Clean data URL prefix if present (e.g. data:image/jpeg;base64,...)
  let cleanBase64 = imageBase64;
  let detectedMime = mimeType;
  const match = imageBase64.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/);
  if (match) {
    detectedMime = match[1];
    cleanBase64 = match[2];
  }

  const prompt = `You are an expert pharmaceutical packaging OCR extractor. Inspect this medicine packaging image (carton box or foil blister pack strip).
Extract the following information:
1. batchNumber: The batch or lot number (e.g. labeled as B.No, Batch No, Lot, BN). Output the cleaned batch number only without label prefixes.
2. expiryDate: The expiration date (e.g. labeled as EXP, EXP. DATE, USE BEFORE, ED). Normalize strictly to YYYY-MM-DD format. If only month and year are provided (e.g., 08/2027 or 08/27), calculate the last calendar day of that month (e.g., 2027-08-31). CAUTION: Do NOT confuse manufacturing date (MFG, MFD, MD) with expiry date!
3. mrp: Maximum Retail Price in Indian Rupees. Numeric value only (e.g., 145.50), without currency symbols like Rs, ₹, or '/-'. If multiple pack sizes are listed, extract the single pack/strip MRP.
4. rawText: The verbatim transcription of visible packaging text related to batch, manufacturing, expiry, and price.

If a field is not visible or cannot be determined with confidence, return null for that field.`;

  const candidateModels = [
    'gemini-3.1-flash-lite',
    'gemini-1.5-flash',
    'gemini-3.8-flash',
  ];

  let lastError = 'GEMINI_EXTRACTION_ERROR';

  for (const model of candidateModels) {
    try {
      const response = await globalThis.fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: detectedMime,
                      data: cleanBase64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'OBJECT',
                properties: {
                  batchNumber: { type: 'STRING', nullable: true },
                  expiryDate: { type: 'STRING', nullable: true },
                  mrp: { type: 'NUMBER', nullable: true },
                  rawText: { type: 'STRING', nullable: true },
                },
                required: ['batchNumber', 'expiryDate', 'mrp', 'rawText'],
              },
            },
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        logger.warn({ model, status: response.status, err: errText }, 'Gemini OCR API request failed, trying next model');
        lastError = `GEMINI_HTTP_${response.status}`;
        continue;
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const textPart = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textPart) {
        lastError = 'EMPTY_GEMINI_RESPONSE';
        continue;
      }

      const parsed = JSON.parse(textPart);
      return {
        source: 'gemini',
        batchNumber: parsed.batchNumber ? String(parsed.batchNumber).trim() : null,
        expiryDate: parsed.expiryDate ? String(parsed.expiryDate).trim() : null,
        mrp: typeof parsed.mrp === 'number' ? parsed.mrp : parsed.mrp ? parseFloat(parsed.mrp) : null,
        rawText: parsed.rawText ? String(parsed.rawText).trim() : '',
      };
    } catch (error: unknown) {
      logger.error({ model, error }, 'Unexpected error during Gemini OCR packaging extraction');
      lastError = error instanceof Error ? error.message : 'GEMINI_EXTRACTION_ERROR';
    }
  }

  return {
    source: 'none',
    batchNumber: null,
    expiryDate: null,
    mrp: null,
    rawText: '',
    error: lastError,
  };
}
