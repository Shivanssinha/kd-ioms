/**
 * Client-Side Packaging OCR Text Parsing Heuristics
 *
 * Extracts batch number, expiry date, and MRP candidates from OCR output
 * on Indian pharmaceutical packaging cartons, blister foils, and strips.
 * Handles common OCR misreads, spacing artifacts, and varied pharma formats.
 */

export interface ParsedPackTextResult {
  batchNumber?: string;
  expiryDate?: string;
  mrp?: string;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function getLastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Normalizes raw OCR text to fix common character substitutions,
 * spacing glitches around delimiters, and punctuation drift.
 */
function normalizeOcrArtifacts(rawText: string): string {
  return rawText
    // Standardize unicode dashes and hyphens
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
    // Replace pipe and backslash dividers with spaces
    .replace(/[|\\]/g, ' ')
    // Fix spaced dots: "B . N o ." -> "B.No."
    .replace(/B\s*\.\s*N\s*o\s*\.?/gi, 'B.No. ')
    // Fix common OCR '8' instead of 'B' in B.No
    .replace(/\b8\s*\.\s*No\.?/gi, 'B.No. ')
    // Fix "B N O" or "B NO"
    .replace(/\bB\s+NO\b/gi, 'B.No. ')
    // Fix spaced EXP: "E X P" -> "EXP"
    .replace(/\bE\s+X\s+P\b/gi, 'EXP ')
    // Fix common OCR "EXR" or "EXF" before dates
    .replace(/\bEX[RF]\b/gi, 'EXP')
    // Fix spaced MRP: "M R P" or "M . R . P" -> "MRP"
    .replace(/\bM\s*\.?\s*R\s*\.?\s*P\s*\.?/gi, 'MRP ')
    // Fix OCR reading "Rs." as "Ps." or "Bs." or "R5."
    .replace(/\b[PB]s\.\s*(?=\d)/gi, 'Rs. ')
    .replace(/\bR5\.\s*(?=\d)/gi, 'Rs. ')
    // Fix comma decimals in currency/rates: "145,50" or "145 , 50" -> "145.50"
    .replace(/(\d+)\s*,\s*(\d{2})\b/g, '$1.$2')
    // Fix spaces around date slashes/dashes: "08 / 2027" -> "08/2027"
    .replace(/(\d{1,2})\s*[\/]\s*(\d{2,4})/g, '$1/$2')
    // Fix spaces around decimals: "145 . 50" -> "145.50"
    .replace(/(\d+)\s*\.\s*(\d{2})\b/g, '$1.$2')
    // Normalize spaces around "/-" suffix in MRP: "145 / -" -> "145/-"
    .replace(/(\d+)\s*\/\s*[-–]/g, '$1/-');
}

/**
 * Parses a date string into an ISO YYYY-MM-DD date.
 * Returns null if string does not represent a valid calendar date.
 */
function parseDateCandidate(candidate: string): string | null {
  if (!candidate) return null;

  // 1. DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = candidate.match(/\b([0-3]?\d)[\/\.-]([0-1]?\d)[\/\.-](20\d{2}|\d{2})\b/);
  if (dmyMatch && dmyMatch[1] && dmyMatch[2] && dmyMatch[3]) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    let year = parseInt(dmyMatch[3], 10);
    if (year < 100) year += 2000;

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }

  // 2. Month Name with Year: e.g. "AUG 2027", "AUG/27", "AUG-27", "AUGUST 2027"
  const monthNameMatch = candidate.match(
    /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC|JANUARY|FEBRUARY|MARCH|APRIL|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)[\s\/\.-]+(20\d{2}|\d{2})\b/i
  );
  if (monthNameMatch && monthNameMatch[1] && monthNameMatch[2]) {
    const mKey = monthNameMatch[1].toLowerCase();
    const month = MONTH_NAMES[mKey];
    if (month) {
      let year = parseInt(monthNameMatch[2], 10);
      if (year < 100) year += 2000;
      const lastDay = getLastDayOfMonth(year, month);
      return `${year}-${pad2(month)}-${pad2(lastDay)}`;
    }
  }

  // 3. Month Name following year or vice versa: e.g. "2027 AUG"
  const reverseMonthMatch = candidate.match(
    /\b(20\d{2})[\s\/\.-]+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/i
  );
  if (reverseMonthMatch && reverseMonthMatch[1] && reverseMonthMatch[2]) {
    const year = parseInt(reverseMonthMatch[1], 10);
    const mKey = reverseMonthMatch[2].toLowerCase();
    const month = MONTH_NAMES[mKey];
    if (month) {
      const lastDay = getLastDayOfMonth(year, month);
      return `${year}-${pad2(month)}-${pad2(lastDay)}`;
    }
  }

  // 4. MM/YYYY or MM-YYYY or MM.YYYY (4-digit year)
  const myMatch = candidate.match(/\b([0-1]?\d)[\/\.-](20\d{2})\b/);
  if (myMatch && myMatch[1] && myMatch[2]) {
    const month = parseInt(myMatch[1], 10);
    const year = parseInt(myMatch[2], 10);
    if (month >= 1 && month <= 12) {
      const lastDay = getLastDayOfMonth(year, month);
      return `${year}-${pad2(month)}-${pad2(lastDay)}`;
    }
  }

  // 5. MM/YY or MM-YY or MM.YY (2-digit year)
  const myShortMatch = candidate.match(/\b([0-1]?\d)[\/\.-](\d{2})\b/);
  if (myShortMatch && myShortMatch[1] && myShortMatch[2]) {
    const month = parseInt(myShortMatch[1], 10);
    const yearNum = parseInt(myShortMatch[2], 10);
    // Plausibility check: Indian pharma expiry is typically 2024–2038
    if (month >= 1 && month <= 12 && yearNum >= 20 && yearNum <= 45) {
      const year = 2000 + yearNum;
      const lastDay = getLastDayOfMonth(year, month);
      return `${year}-${pad2(month)}-${pad2(lastDay)}`;
    }
  }

  // 6. YYYY/MM or YYYY-MM
  const yyyyMmMatch = candidate.match(/\b(20\d{2})[\/\.-]([0-1]?\d)\b/);
  if (yyyyMmMatch && yyyyMmMatch[1] && yyyyMmMatch[2]) {
    const year = parseInt(yyyyMmMatch[1], 10);
    const month = parseInt(yyyyMmMatch[2], 10);
    if (month >= 1 && month <= 12) {
      const lastDay = getLastDayOfMonth(year, month);
      return `${year}-${pad2(month)}-${pad2(lastDay)}`;
    }
  }

  return null;
}

export function parsePackText(rawText: string): ParsedPackTextResult {
  if (!rawText || typeof rawText !== 'string') {
    return {};
  }

  const result: ParsedPackTextResult = {};
  const normalized = normalizeOcrArtifacts(rawText);

  // Split into trimmed lines for context-aware extraction
  const lines = normalized
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Keywords to reject as false batch numbers
  const INVALID_BATCH_KEYWORDS = new Set([
    'MFG', 'MFD', 'EXP', 'EXPIRY', 'DATE', 'MRP', 'RS', 'INR', 'TAB', 'TABS',
    'TABLETS', 'CAP', 'CAPS', 'CAPSULES', 'PRICE', 'BATCH', 'LOT', 'INCL',
    'TAXES', 'ONLY', 'FOR', 'USE', 'IP', 'BP', 'USP', 'PHARMA', 'PVT', 'LTD'
  ]);

  // -------------------------------------------------------------
  // 1. EXTRACT BATCH NUMBER
  // -------------------------------------------------------------
  // Patterns like: "B.No. A23910", "B.No: B982-1", "Batch No: 99120", "BN: 8820", "Lot: 8820"
  const batchRegexes = [
    /(?:B\.?\s*No\.?|Batch(?:\s*No\.?)?|Lot(?:\s*No\.?)?|B\/N|BN)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\/\-_]{1,24})/i,
    /\bB\.?N\.?\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\/\-_]{1,24})/i,
  ];

  for (const line of lines) {
    for (const rgx of batchRegexes) {
      const match = line.match(rgx);
      if (match && match[1]) {
        const candidate = match[1].replace(/[\.\,\:\;\-\/]+$/, '').trim();
        if (candidate.length >= 2 && !INVALID_BATCH_KEYWORDS.has(candidate.toUpperCase())) {
          result.batchNumber = candidate;
          break;
        }
      }
    }
    if (result.batchNumber) break;
  }

  // Fallback: Global search across flattened text if line check didn't match
  if (!result.batchNumber) {
    const flattened = normalized.replace(/\s+/g, ' ');
    for (const rgx of batchRegexes) {
      const match = flattened.match(rgx);
      if (match && match[1]) {
        const candidate = match[1].replace(/[\.\,\:\;\-\/]+$/, '').trim();
        if (candidate.length >= 2 && !INVALID_BATCH_KEYWORDS.has(candidate.toUpperCase())) {
          result.batchNumber = candidate;
          break;
        }
      }
    }
  }

  // -------------------------------------------------------------
  // 2. EXTRACT EXPIRY DATE (Prioritizing explicit EXP prefixes over MFG)
  // -------------------------------------------------------------
  const expLineRegex =
    /(?:EXP(?:IRY)?\.?\s*(?:DT\.?|DATE)?|USE\s*BEFORE|BEST\s*BEFORE|EXP\.?|E\.D\.?|\bED\b)\s*[:\-]?\s*(.+)/i;

  for (const line of lines) {
    // Avoid accidentally grabbing manufacturing date line
    if (/^\s*(?:MFG|MFD|M\.D\.)/i.test(line) && !/EXP/i.test(line)) {
      continue;
    }

    const expMatch = line.match(expLineRegex);
    if (expMatch && expMatch[1]) {
      const parsed = parseDateCandidate(expMatch[1]);
      if (parsed) {
        result.expiryDate = parsed;
        break;
      }
    }
  }

  // Fallback: Check lines that contain EXP anywhere
  if (!result.expiryDate) {
    for (const line of lines) {
      if (/EXP/i.test(line) || /USE\s*BEFORE/i.test(line)) {
        const parsed = parseDateCandidate(line);
        if (parsed) {
          result.expiryDate = parsed;
          break;
        }
      }
    }
  }

  // Fallback: If no explicit EXP found, find any valid future date candidate
  if (!result.expiryDate) {
    const allDates: string[] = [];
    for (const line of lines) {
      // Skip obvious manufacturing lines
      if (/^\s*(?:MFG|MFD|M\.D\.)/i.test(line)) continue;
      const parsed = parseDateCandidate(line);
      if (parsed) {
        allDates.push(parsed);
      }
    }
    if (allDates.length > 0) {
      // Pick the latest date (expiry is always after manufacturing)
      allDates.sort();
      result.expiryDate = allDates[allDates.length - 1];
    }
  }

  // -------------------------------------------------------------
  // 3. EXTRACT MAXIMUM RETAIL PRICE (M.R.P.)
  // -------------------------------------------------------------
  // Handles:
  // "M.R.P. Rs. 145.50", "MRP ₹ 89.00", "M.R.P. INCL. OF ALL TAXES Rs. 210.00"
  // "MRP Rs. 145/-", "MRP: 145.00", "Rs. 145.50"
  const mrpRegexes = [
    // 1. Explicit MRP prefix followed by currency and amount
    /(?:M\.?\s*R\.?\s*P\.?|MRP|MAX\.?\s*RETAIL\s*PRICE)\b.*?(?:Rs\.?|₹|INR)?\s*[:\-]?\s*(\d+(?:\.\d{1,2})?|\d+)\s*(?:\/-)?/i,
    // 2. Currency symbol followed by amount: "Rs. 145.50" or "₹ 89.00" or "Rs. 145/-"
    /(?:Rs\.?|₹)\s*[:\-]?\s*(\d+(?:\.\d{1,2})?|\d+)\s*(?:\/-)?/i,
    // 3. Number followed by "/-" (e.g. "145/-")
    /\b(\d+(?:\.\d{2})?)\s*\/-/,
  ];

  for (const line of lines) {
    // Look for lines containing MRP or currency
    if (/MRP|RETAIL|Rs|₹/i.test(line)) {
      for (const rgx of mrpRegexes) {
        const match = line.match(rgx);
        if (match && match[1]) {
          const val = parseFloat(match[1]);
          // Plausibility check: Exclude unrealistic medicine unit prices (e.g. year 2026 or 0)
          if (!isNaN(val) && val > 0 && val < 50000 && val !== 2024 && val !== 2025 && val !== 2026 && val !== 2027 && val !== 2028) {
            result.mrp = val.toFixed(2);
            break;
          }
        }
      }
    }
    if (result.mrp) break;
  }

  // Fallback: Global search across flattened string
  if (!result.mrp) {
    const flattened = normalized.replace(/\s+/g, ' ');
    for (const rgx of mrpRegexes) {
      const match = flattened.match(rgx);
      if (match && match[1]) {
        const val = parseFloat(match[1]);
        if (!isNaN(val) && val > 0 && val < 50000 && val !== 2024 && val !== 2025 && val !== 2026 && val !== 2027 && val !== 2028) {
          result.mrp = val.toFixed(2);
          break;
        }
      }
    }
  }

  return result;
}
