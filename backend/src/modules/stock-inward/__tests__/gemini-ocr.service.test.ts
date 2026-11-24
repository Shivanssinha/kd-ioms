import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as geminiOcrService from '../gemini-ocr.service.js';

describe('Gemini Packaging OCR Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns source: none if GEMINI_API_KEY is not configured', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const result = await geminiOcrService.extractPackagingWithGemini('fake-base64');
    expect(result.source).toBe('none');
    expect(result.error).toBe('GEMINI_API_KEY_NOT_CONFIGURED');
    vi.unstubAllEnvs();
  });

  it('parses valid structured candidate JSON from Gemini API response', async () => {
    const mockApiResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  batchNumber: 'CIP9921',
                  expiryDate: '2027-08-31',
                  mrp: 145.5,
                  rawText: 'B.No. CIP9921 MFG. 09/2024 EXP. 08/2027 M.R.P. Rs. 145.50',
                }),
              },
            ],
          },
        },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    });
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('GEMINI_API_KEY', 'test-key-123');

    const result = await geminiOcrService.extractPackagingWithGemini(
      'data:image/jpeg;base64,aGVsbG8=',
      'image/jpeg'
    );

    expect(result.batchNumber).toBe('CIP9921');
    expect(result.expiryDate).toBe('2027-08-31');
    expect(result.mrp).toBe(145.5);
    expect(result.source).toBe('gemini');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('handles API errors without crashing', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    });
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('GEMINI_API_KEY', 'test-key-123');

    const result = await geminiOcrService.extractPackagingWithGemini('aGVsbG8=');
    expect(result.source).toBe('none');
    expect(result.error).toBe('GEMINI_HTTP_429');
    expect(mockFetch).toHaveBeenCalled();

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});
