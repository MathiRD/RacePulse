import { createHash } from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { cache } from '@/lib/cache';

const EVENT_KIND = ['REAL', 'ESPORT'] as const;
const STANDING_KIND = ['ENTRY_LIST', 'STANDINGS'] as const;

const EventInput = z.object({
  title: z.string().min(2),
  series: z.string().min(2),
  category: z.string().min(1),
  eventKind: z.enum(EVENT_KIND).default('REAL'),
  circuit: z.string().min(1),
  country: z.string().optional().nullable(),
  startsAt: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  endsAt: z.string().optional().nullable(),
  priority: z.number().int().min(1).max(3).default(3),
  hasBrazilian: z.boolean().default(false),
  hasVerstappen: z.boolean().default(false),
  sourceUrl: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const StandingInput = z.object({
  eventTitle: z.string().optional().nullable(),
  eventCircuit: z.string().optional().nullable(),
  eventDate: z.string().optional().nullable(),
  series: z.string().min(2),
  category: z.string().min(1),
  kind: z.enum(STANDING_KIND).default('ENTRY_LIST'),
  eventKind: z.enum(EVENT_KIND).default('REAL'),
  position: z.number().int().positive().default(1),
  carNumber: z.string().optional().nullable(),
  driver: z.string().min(1),
  team: z.string().optional().nullable(),
  car: z.string().optional().nullable(),
  points: z.number().optional().nullable(),
  gap: z.string().optional().nullable(),
  sourceUrl: z.string().optional().nullable(),
});

const ImportPayload = z.object({
  events: z.array(EventInput).default([]),
  standings: z.array(StandingInput).default([]),
  summary: z.string().default(''),
});

type ImportPayloadType = z.infer<typeof ImportPayload>;
type SearchEvidence = {
  task: string;
  provider: string;
  query: string;
  rawText: string;
  rawJson?: unknown;
  status?: number;
};

type EventInputType = z.infer<typeof EventInput>;
type StandingInputType = z.infer<typeof StandingInput>;

export type ImportDebugResult = {
  ok: boolean;
  logId: string;
  status: 'SUCCESS' | 'FAILED';
  message: string;
  eventsCreated: number;
  eventsUpdated: number;
  standingsCreated: number;
  standingsUpdated: number;
  diagnostics: Record<string, unknown>;
};

const EVENT_BLACKLIST = [
  'trial',
  'test day',
  'test days',
  'testing',
  'official test',
  'prologue',
  'practice',
  'free practice',
  'media day',
  'track day',
  'trackday',
  'pre-event',
  'pre event',
  'qualifying',
  'warm up',
  'warm-up',
];

const ESPORT_TERMS = [
  'esport',
  'e-sport',
  'virtual',
  'sim racing',
  'simracing',
  'iracing',
  'assetto corsa',
  'racing game',
  'renn esport',
];

const OFFICIAL_DOMAINS = [
  'fiawec.com',
  '24h-lemans.com',
  'europeanlemansseries.com',
  'asianlemansseries.com',
  'lemanscup.com',
  'gt-world-challenge-europe.com',
  'gt-world-challenge-america.com',
  'gt-world-challenge-asia.com',
  'intercontinentalgtchallenge.com',
  'sro-motorsports.com',
  'britishgt.com',
  'imsa.com',
  'nuerburgring-langstrecken-serie.de',
  '24h-rennen.de',
  '24hseries.com',
  'dtm.com',
  'gtopen.net',
  'supertaikyu.com',
  'bathurst12hour.com.au',
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMinImportDate() {
  if (process.env.IMPORT_MIN_DATE) {
    const date = safeDate(process.env.IMPORT_MIN_DATE);
    if (date) return date;
  }

  // RacePulse works as an annual/static calendar importer. If IMPORT_MIN_DATE is not set,
  // use the beginning of IMPORT_YEAR instead of today; otherwise races that already happened
  // in the target season, like Nürburgring 24h, can be returned by the LLM but filtered out
  // before persisting.
  const year = Number(process.env.IMPORT_YEAR || new Date().getUTCFullYear());
  return new Date(Date.UTC(Number.isFinite(year) ? year : new Date().getUTCFullYear(), 0, 1, 0, 0, 0, 0));
}

function safeDate(value: string | null | undefined) {
  const date = value ? new Date(value) : null;

  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getErrorDetail(error: unknown) {
  return error instanceof Error ? error.stack || error.message : String(error);
}

function stableKey(parts: Array<string | number | null | undefined>) {
  return createHash('sha256')
    .update(parts.map((part) => String(part ?? '').trim().toLowerCase()).join('|'))
    .digest('hex');
}

function cleanText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function slug(value: unknown) {
  return cleanText(value).replace(/\s+/g, '-');
}

function compactDateKey(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : '';
}

function canonicalSeriesGroup(series: string) {
  const text = cleanText(series);

  if (/gt world challenge|sro|intercontinental gt challenge|igtc|british gt|gt2 european|gt4 european/.test(text)) return 'sro-gt';
  if (/fia world endurance|\bwec\b|le mans/.test(text)) return 'fia-wec-le-mans';
  if (/imsa|weathertech|michelin endurance cup/.test(text)) return 'imsa';
  if (/european le mans|\belms\b/.test(text)) return 'elms';
  if (/asian le mans|\balms\b/.test(text)) return 'alms';
  if (/24h series|creventic/.test(text)) return '24h-series';
  if (/nls|nurburgring langstrecken|nu?rburgring langstrecken/.test(text)) return 'nls';
  if (/dtm/.test(text)) return 'dtm';
  if (/gt open/.test(text)) return 'gt-open';

  return slug(series || 'unknown-series');
}

function canonicalEventTitle(title: string) {
  const t = cleanText(title);

  if (/(spa|francorchamps).*(24|twenty four)|24.*(spa|francorchamps)/.test(t)) return '24-hours-of-spa';
  if (/(n24|24h rennen|24 h rennen|24h race|24 hour race|24 hours of n|nurburgring|nuerburgring|nordschleife).*(24|twenty four|rennen|race)|24.*(n24|nurburgring|nuerburgring|nordschleife)|\bn24\b/.test(t)) return '24-hours-of-nurburgring';
  if (/(le mans).*(24|twenty four)|24.*le mans/.test(t)) return '24-hours-of-le-mans';
  if (/(daytona).*(24|twenty four)|24.*daytona/.test(t)) return '24-hours-of-daytona';
  if (/(dubai).*(24|twenty four)|24.*dubai/.test(t)) return '24-hours-of-dubai';
  if (/(bathurst).*(12|twelve)|12.*bathurst/.test(t)) return 'bathurst-12-hour';
  if (/(sebring).*(12|twelve)|12.*sebring/.test(t)) return '12-hours-of-sebring';
  if (/petit.*le.*mans/.test(t)) return 'petit-le-mans';
  if (/watkins.*glen/.test(t)) return '6-hours-of-watkins-glen';

  const hourRace = t.match(/(?:^|\b)(\d{1,2})\s*(?:h|hour|hours|hrs)\b.*(?:of\s+)?([a-z0-9 ]{3,60})/);
  if (hourRace?.[1] && hourRace?.[2]) {
    return `${hourRace[1]}-hours-${slug(hourRace[2])}`;
  }

  return slug(title.replace(/entry list|calendar|schedule|round \d+|race week|official|provisional/gi, '')) || 'unknown-event';
}

function canonicalCircuit(circuit: string) {
  const c = cleanText(circuit);

  if (/spa|francorchamps/.test(c)) return 'circuit-de-spa-francorchamps';
  if (/nurburgring|nuerburgring|nordschleife|green hell|24h rennen|n24/.test(c)) return 'nurburgring-nordschleife';
  if (/le mans|sarthe/.test(c)) return 'circuit-de-la-sarthe';
  if (/daytona/.test(c)) return 'daytona-international-speedway';
  if (/sebring/.test(c)) return 'sebring-international-raceway';
  if (/bathurst|mount panorama/.test(c)) return 'mount-panorama-circuit';
  if (/paul ricard/.test(c)) return 'circuit-paul-ricard';
  if (/monza/.test(c)) return 'autodromo-nazionale-monza';
  if (/silverstone/.test(c)) return 'silverstone-circuit';
  if (/suzuka/.test(c)) return 'suzuka-circuit';
  if (/interlagos|jose carlos pace|sao paulo/.test(c)) return 'interlagos';
  if (/road america/.test(c)) return 'road-america';
  if (/indianapolis|indy/.test(c)) return 'indianapolis-motor-speedway';
  if (/vir|virginia/.test(c)) return 'virginia-international-raceway';
  if (/watkins glen/.test(c)) return 'watkins-glen-international';
  if (/laguna seca/.test(c)) return 'weathertech-raceway-laguna-seca';
  if (/road atlanta/.test(c)) return 'road-atlanta';

  return slug(circuit) || 'unknown-circuit';
}

function isMajorEnduranceEvent(title: string, circuit = '') {
  const eventKey = canonicalEventTitle(title);
  const text = cleanText(`${title} ${circuit}`);

  return (
    /^(24-hours-of-spa|24-hours-of-nurburgring|24-hours-of-le-mans|24-hours-of-daytona|24-hours-of-dubai|bathurst-12-hour|12-hours-of-sebring|petit-le-mans|6-hours-of-watkins-glen)$/.test(eventKey) ||
    /(spa|nurburgring|nuerburgring|nordschleife|le mans|daytona|dubai|bathurst|sebring|petit le mans|watkins glen).*(24|12|6|hour|hours|h)/.test(text)
  );
}

function canonicalEventIdentity({
  eventKind,
  title,
  circuit,
  startsAt,
  series,
}: {
  eventKind: string;
  title: string;
  circuit: string;
  startsAt?: Date | null;
  series?: string | null;
}) {
  const year = startsAt?.getUTCFullYear() || Number(process.env.IMPORT_YEAR || new Date().getUTCFullYear());
  const eventTitle = canonicalEventTitle(title);
  const eventCircuit = canonicalCircuit(circuit);

  // Major standalone endurance races are shared across series labels (GTWC/IGTC/etc.).
  // Do not include series/date in the primary key so Spa/N24/Le Mans do not duplicate just
  // because one source labels the same race differently.
  if (isMajorEnduranceEvent(title, circuit)) {
    return ['event', eventKind, year, eventTitle, eventCircuit];
  }

  // Generic rounds at the same track must include series + date, otherwise Monza/Spa/Paul
  // Ricard rounds from different championships can collide and one event silently disappears.
  return ['event', eventKind, year, canonicalSeriesGroup(series || ''), eventTitle, eventCircuit, compactDateKey(startsAt || null)];
}

function canonicalCategory(value: string, series = '') {
  const text = cleanText(`${series} ${value}`);

  if (/lmgt3/.test(text)) return 'LMGT3';
  if (/gtd pro/.test(text)) return 'GTD Pro';
  if (/gtd/.test(text)) return 'GTD';
  if (/sp9/.test(text)) return 'SP9 GT3';
  if (/gt world challenge.*endurance|endurance cup/.test(text)) return 'GT3 Endurance';
  if (/gt world challenge.*sprint|sprint cup/.test(text)) return 'GT3 Sprint';
  if (/gt3/.test(text)) return 'GT3';
  if (/endurance/.test(text)) return 'Endurance';

  return value.trim() || 'GT3 / Endurance';
}

function detectEventKind(value: string, sourceUrl?: string | null) {
  const text = cleanText(`${value} ${sourceUrl || ''}`);
  return ESPORT_TERMS.some((term) => text.includes(term)) ? 'ESPORT' : 'REAL';
}

function hasBlacklistedSessionName(value: string) {
  const text = cleanText(value);
  return EVENT_BLACKLIST.some((term) => text.includes(cleanText(term)));
}

function isOfficialSource(url?: string | null) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    return OFFICIAL_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function sourceScore(url?: string | null) {
  if (!url) return 0;
  return isOfficialSource(url) ? 50 : 10;
}

function normalizePriority(value: unknown) {
  const priority = Number(value || 3);

  if (priority <= 1) return 1;
  if (priority === 2) return 2;

  return 3;
}

function stripJsonFence(text: string) {
  return text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function extractJsonCandidate(text: string) {
  const cleaned = stripJsonFence(text);

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return cleaned.slice(firstBrace, lastBrace + 1);
  }

  return cleaned;
}

function repairCommonJsonIssues(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .replace(/[\u0000-\u001F\u007F]/g, (char) => {
      if (char === '\n' || char === '\r' || char === '\t') return char;
      return '';
    })
    .replace(/,\s*([}\]])/g, '$1')
    .trim();
}

function getJsonErrorContext(json: string, error: unknown) {
  const message = getErrorMessage(error);
  const positionMatch = message.match(/position\s+(\d+)/i);
  const position = positionMatch ? Number(positionMatch[1]) : -1;

  if (!Number.isFinite(position) || position < 0) {
    return `${message}\nTrecho inicial: ${json.slice(0, 1200)}`;
  }

  const start = Math.max(0, position - 500);
  const end = Math.min(json.length, position + 500);

  return `${message}\nContexto próximo do erro:\n${json.slice(start, end)}`;
}

function parseJsonFromText(text: string) {
  const candidate = repairCommonJsonIssues(extractJsonCandidate(text));

  try {
    return JSON.parse(candidate);
  } catch (firstError) {
    const withoutTrailingCommas = repairCommonJsonIssues(candidate);

    try {
      return JSON.parse(withoutTrailingCommas);
    } catch {
      throw new Error(`Gemini retornou JSON inválido. ${getJsonErrorContext(candidate, firstError)}`);
    }
  }
}

async function parseJsonFromTextWithRepair(rawText: string, ai: GoogleGenAI, model: string) {
  try {
    return {
      json: parseJsonFromText(rawText),
      repaired: false,
      repairedText: null as string | null,
    };
  } catch (error) {
    if (!envFlag('IMPORT_ENABLE_JSON_REPAIR', false)) {
      const invalidJson = extractJsonCandidate(rawText);
      throw new Error(`Gemini retornou JSON inválido e o reparo está desativado. ${getJsonErrorContext(invalidJson, error)}`);
    }

    const invalidJson = extractJsonCandidate(rawText);
    const context = getJsonErrorContext(invalidJson, error);
    const repairModel = process.env.GEMINI_REPAIR_MODEL || model;

    const repairPrompt = `
Repair this invalid JSON and return ONLY valid JSON.

Rules:
- Do not add facts.
- Do not remove valid objects unless required to make JSON syntactically valid.
- Do not use markdown.
- Keep exactly these top-level keys when present: summary, events, standings.
- Ensure arrays and objects have commas in the correct places.
- Ensure all strings are quoted and escaped correctly.
- Ensure null is used instead of undefined/empty non-JSON values.

Parser error/context:
${context}

Invalid JSON:
${invalidJson.slice(0, Number(process.env.IMPORT_JSON_REPAIR_MAX_CHARS || '70000'))}
`;

    const repairResponse = await generateGeminiWithRetry(ai, {
      model: repairModel,
      contents: repairPrompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0,
      },
    });

    const repairedText = String((repairResponse as any).text || '');

    try {
      return {
        json: parseJsonFromText(repairedText),
        repaired: true,
        repairedText,
      };
    } catch (repairError) {
      throw new Error(
        `Gemini retornou JSON inválido e a tentativa de reparo também falhou. ${getJsonErrorContext(
          extractJsonCandidate(repairedText || invalidJson),
          repairError,
        )}`,
      );
    }
  }
}

function parseNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;

  const normalized = String(value)
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');

  if (!normalized) return null;

  const number = Number(normalized);

  return Number.isFinite(number) ? number : null;
}

function parsePositivePosition(value: unknown, fallback: number) {
  const number = Number(value);

  if (Number.isInteger(number) && number > 0) {
    return number;
  }

  return fallback;
}

function normalizeDriverGroup(value: string) {
  return value
    .split(/\s*(?:\/|,|;|\+| and | & )\s*/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .sort((a, b) => cleanText(a).localeCompare(cleanText(b)))
    .join(' / ');
}

function isRetryableGeminiError(error: unknown) {
  const message = getErrorMessage(error);

  return (
    message.includes('503') ||
    message.includes('UNAVAILABLE') ||
    message.includes('high demand') ||
    message.includes('temporarily unavailable') ||
    message.includes('429') ||
    message.toLowerCase().includes('rate limit')
  );
}

async function generateGeminiWithRetry(ai: GoogleGenAI, args: Record<string, unknown>) {
  const maxAttempts = Math.max(1, Number(process.env.GEMINI_RETRY_ATTEMPTS || '1'));
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await (ai.models.generateContent as any)(args);
    } catch (error) {
      lastError = error;

      if (!isRetryableGeminiError(error) || attempt === maxAttempts) {
        throw error;
      }

      await sleep(1500 * attempt);
    }
  }

  throw lastError;
}

function envFlag(name: string, defaultValue = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function compactImportEnabled() {
  return envFlag('IMPORT_COMPACT_MODE', true);
}

function buildImportTasks(query: string) {
  const autoExpand = envFlag('IMPORT_AUTO_EXPAND_TASKS', false);
  const maxTasks = Math.max(1, Number(process.env.IMPORT_MAX_TASKS || '1'));

  if (compactImportEnabled() || !autoExpand || maxTasks === 1) {
    return [query.trim()];
  }

  const year = process.env.IMPORT_YEAR || String(new Date().getUTCFullYear());
  const base = query.trim();
  const tasks = [
    `Official ${year} GT World Challenge Europe Endurance Cup and Sprint Cup GT3 race calendar, main race dates only, official entry lists, drivers, teams, car numbers and car models. Exclude prologue, tests, trials and esports. ${base}`,
    `Official ${year} FIA WEC calendar and LMGT3 entry list with events, race dates, circuits, drivers, teams, car numbers and car models. Exclude tests, prologue and esports. ${base}`,
    `Official ${year} IMSA WeatherTech SportsCar Championship GTD and GTD Pro calendar and entry lists with Daytona Sebring Watkins Glen Petit Le Mans drivers teams cars. Exclude tests and esports. ${base}`,
    `Official ${year} European Le Mans Series, Asian Le Mans Series and Le Mans Cup GT or LMGT3 calendar and entry lists with drivers teams cars. Exclude tests and esports. ${base}`,
    `Official ${year} Intercontinental GT Challenge, Bathurst 12 Hour, Spa 24 Hours, Nürburgring 24 Hours, Dubai 24H and Suzuka GT3 dates and entry lists. Main race dates only. Exclude virtual and test events. ${base}`,
    `Official ${year} Nürburgring Langstrecken-Serie NLS, Nürburgring 24h SP9 GT3, 24H Series GT3 race calendar and entry lists with drivers teams cars. Exclude tests and esports. ${base}`,
    `Official ${year} British GT, DTM GT3, International GT Open and Super Taikyu GT3 calendar and entry lists with drivers teams cars. Exclude tests and esports. ${base}`,
  ];

  return tasks.slice(0, maxTasks);
}

async function searchTavily(query: string): Promise<SearchEvidence> {
  if (!process.env.TAVILY_API_KEY) {
    throw new Error('TAVILY_API_KEY vazia. Configure a chave ou use IMPORT_SEARCH_PROVIDER=gemini.');
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: process.env.TAVILY_SEARCH_DEPTH || 'advanced',
      max_results: Number(process.env.TAVILY_MAX_RESULTS || '20'),
      include_answer: true,
      include_raw_content: true,
    }),
  });

  const text = await response.text();
  let json: unknown;

  try {
    json = JSON.parse(text);
  } catch {
    json = { rawText: text };
  }

  if (!response.ok) {
    throw new Error(`Tavily HTTP ${response.status}: ${text.slice(0, 1200)}`);
  }

  return {
    task: query,
    provider: 'tavily',
    query,
    rawText: JSON.stringify(json).slice(0, 24000),
    rawJson: json,
    status: response.status,
  };
}

async function searchGeminiGrounded(query: string): Promise<SearchEvidence> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY vazia. Configure a chave antes de executar importação real.');
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = process.env.GEMINI_SEARCH_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  const prompt = `
Search the web with grounding and collect factual motorsport data.
Return a compact but detailed evidence report, not final JSON.

Rules:
- Prioritize official championship/event pages.
- Current/future year only: ${process.env.IMPORT_YEAR || new Date().getUTCFullYear()} and later.
- Main race calendar dates only for events.
- Do not use test, prologue, trial, practice, media day or pre-event dates as race dates.
- Separate real racing from esports/virtual racing.
- For entry lists, include driver lineup, team, car number, car model, class, event/series and source URL.
- If the source contains Spa 24h test days and the actual Spa 24h race, clearly distinguish them.

Query:
${query}
`;

  const response = await generateGeminiWithRetry(ai, {
    model,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const rawText = String((response as any).text || '').trim();
  const metadata = (response as any).candidates?.[0]?.groundingMetadata || null;

  return {
    task: query,
    provider: `gemini-grounded:${model}`,
    query,
    rawText: JSON.stringify({ text: rawText, groundingMetadata: metadata }).slice(0, 30000),
  };
}

async function collectEvidence(query: string, force = false) {
  const provider = process.env.IMPORT_SEARCH_PROVIDER || 'gemini';
  const tasks = buildImportTasks(query);
  const ttl = Number(process.env.IMPORT_CACHE_TTL_SECONDS || '86400');
  const cacheClient = await cache();
  const evidences: SearchEvidence[] = [];
  const failures: Array<{ task: string; error: string }> = [];

  for (const task of tasks) {
    const cacheKey = `import:evidence:${provider}:${stableKey([task])}`;
    const cached = !force ? await cacheClient.get<SearchEvidence>(cacheKey) : null;

    if (cached) {
      evidences.push(cached);
      continue;
    }

    try {
      let evidence: SearchEvidence;

      if (provider === 'tavily') {
        evidence = await searchTavily(task);
      } else if (provider === 'hybrid') {
        try {
          evidence = await searchGeminiGrounded(task);
        } catch (error) {
          failures.push({ task, error: `Gemini grounded falhou; tentando Tavily: ${getErrorMessage(error)}` });
          evidence = await searchTavily(task);
        }
      } else {
        evidence = await searchGeminiGrounded(task);
      }

      evidences.push(evidence);
      await cacheClient.set(cacheKey, evidence, ttl);
    } catch (error) {
      failures.push({ task, error: getErrorMessage(error) });
    }
  }

  if (evidences.length === 0) {
    throw new Error(`Nenhuma evidência coletada. Falhas: ${JSON.stringify(failures).slice(0, 1800)}`);
  }

  return { evidences, failures, tasks };
}

function sanitizeImportPayload(input: any): ImportPayloadType {
  const minDate = getMinImportDate();

  const events = Array.isArray(input?.events)
    ? input.events
        .filter((event: any) => {
          if (!event?.title || !event?.series || !event?.category || !event?.circuit || !event?.startsAt) return false;

          const startsAt = safeDate(event.startsAt);
          if (!startsAt || startsAt < minDate) return false;

          const eventKind = event.eventKind || detectEventKind(`${event.title} ${event.series} ${event.category}`, event.sourceUrl);
          if (eventKind === 'REAL' && hasBlacklistedSessionName(`${event.title} ${event.category} ${event.notes || ''}`)) return false;

          return true;
        })
        .map((event: any) => {
          const eventKind = event.eventKind || detectEventKind(`${event.title} ${event.series} ${event.category}`, event.sourceUrl);
          return {
            title: String(event.title).trim(),
            series: String(event.series).trim(),
            category: canonicalCategory(String(event.category || ''), String(event.series || '')),
            eventKind: eventKind === 'ESPORT' ? 'ESPORT' : 'REAL',
            circuit: String(event.circuit).trim(),
            country: event.country ? String(event.country).trim() : null,
            startsAt: String(event.startsAt).trim(),
            endsAt: event.endsAt ? String(event.endsAt).trim() : null,
            priority: normalizePriority(event.priority),
            hasBrazilian: Boolean(event.hasBrazilian),
            hasVerstappen: Boolean(event.hasVerstappen),
            sourceUrl: event.sourceUrl ? String(event.sourceUrl).trim() : null,
            notes: event.notes ? String(event.notes).trim() : null,
          } satisfies EventInputType;
        })
    : [];

  const standings = Array.isArray(input?.standings)
    ? input.standings
        .filter((standing: any) => {
          if (!standing?.driver || !standing?.series || !standing?.category) return false;
          const category = cleanText(standing.category);
          if (/constructor|manufacturer|team standings|teams championship|fabricante|construtor/.test(category)) return false;

          return true;
        })
        .map((standing: any, index: number) => {
          const kind = standing.kind === 'STANDINGS' ? 'STANDINGS' : 'ENTRY_LIST';
          const eventKind = standing.eventKind || detectEventKind(`${standing.eventTitle || ''} ${standing.series} ${standing.category}`, standing.sourceUrl);
          return {
            eventTitle: standing.eventTitle ? String(standing.eventTitle).trim() : null,
            eventCircuit: standing.eventCircuit ? String(standing.eventCircuit).trim() : null,
            eventDate: standing.eventDate ? String(standing.eventDate).trim() : null,
            series: String(standing.series).trim(),
            category: canonicalCategory(String(standing.category || ''), String(standing.series || '')),
            kind,
            eventKind: eventKind === 'ESPORT' ? 'ESPORT' : 'REAL',
            position: parsePositivePosition(standing.position, index + 1),
            carNumber: standing.carNumber ? String(standing.carNumber).replace(/^#/, '').trim() : null,
            driver: normalizeDriverGroup(String(standing.driver).trim()),
            team: standing.team ? String(standing.team).trim() : null,
            car: standing.car ? String(standing.car).trim() : null,
            points: null,
            gap: null,
            sourceUrl: standing.sourceUrl ? String(standing.sourceUrl).trim() : null,
          } satisfies StandingInputType;
        })
    : [];

  return {
    summary: input?.summary ? String(input.summary).trim() : '',
    events,
    standings,
  };
}


async function importCompactWithGemini(query: string) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY vazia. Configure a chave antes de executar importação real.');
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = process.env.GEMINI_SEARCH_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
  const minDate = getMinImportDate().toISOString().slice(0, 10);
  const year = process.env.IMPORT_YEAR || String(new Date().getUTCFullYear());

  const prompt = `
You are a grounded motorsport data importer for RacePulse.
Use Google Search grounding and return ONLY valid JSON matching the requested schema.

Goal:
Collect the maximum reliable ${year}+ GT3/endurance racing data in ONE response, minimizing API requests.

User query:
${query}

Minimum date:
${minDate}
Ignore events before this date.

Hard rules:
- Return only valid JSON. No markdown, no commentary.
- Use only grounded/search-supported facts. Do not invent dates, drivers, teams, cars or URLs.
- Prefer official sources: FIA WEC, Le Mans, SRO/GTWC, IGTC, IMSA, ELMS, ALMS, 24H Series, NLS/N24, British GT, DTM, GT Open and official event/circuit pages.
- Events must be main race events. Never use trial, test day, testing, official test, prologue, practice, media day, qualifying-only, warm-up or pre-event dates as race dates.
- If a page contains both test/prologue dates and the real race date, return only the real main race date.
- Separate esports/virtual events with eventKind:"ESPORT". Real racing must be eventKind:"REAL".
- For drivers/teams/cars, return as standings with kind:"ENTRY_LIST".
- carNumber is the car number, not a race position.
- position is only display order for ENTRY_LIST when no real result exists.
- For now, always set points:null and gap:null.
- Do not mix Formula 1, Stock Car, NASCAR or unrelated categories unless the driver/team is explicitly listed in a GT3/endurance entry list.
- Keep category standardized: GT3, GT3 Endurance, GT3 Sprint, LMGT3, GTD, GTD Pro, SP9 GT3, Endurance.
- If an entry list has eventTitle + eventCircuit + eventDate, include all three so the system can create/link the parent event.
- For major races such as Spa 24h, Nürburgring 24h, Le Mans 24h, Daytona 24h, Sebring 12h, Bathurst 12h, Dubai 24H and Petit Le Mans, always prefer the official main race event date.

Required JSON shape:
{
  "summary": "string",
  "events": [
    {
      "title": "official event name",
      "series": "official series name",
      "category": "GT3 | GT3 Endurance | GT3 Sprint | LMGT3 | GTD | GTD Pro | SP9 GT3 | Endurance",
      "eventKind": "REAL or ESPORT",
      "circuit": "official circuit name",
      "country": "country or null",
      "startsAt": "YYYY-MM-DDT12:00:00.000Z",
      "endsAt": "YYYY-MM-DDT12:00:00.000Z or null",
      "priority": 1,
      "hasBrazilian": false,
      "hasVerstappen": false,
      "sourceUrl": "official/source URL or null",
      "notes": "short evidence-based note or null"
    }
  ],
  "standings": [
    {
      "eventTitle": "related event title or null",
      "eventCircuit": "related circuit or null",
      "eventDate": "YYYY-MM-DD or null",
      "series": "series",
      "category": "class/category",
      "kind": "ENTRY_LIST",
      "eventKind": "REAL or ESPORT",
      "position": 1,
      "carNumber": "number without # or null",
      "driver": "driver names separated by /",
      "team": "team or null",
      "car": "car model or null",
      "points": null,
      "gap": null,
      "sourceUrl": "source URL or null"
    }
  ]
}
`;

  const response = await generateGeminiWithRetry(ai, {
    model,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: 'application/json',
      temperature: 0,
    },
  });

  const rawText = String((response as any).text || '');
  const parsedJsonResult = await parseJsonFromTextWithRepair(rawText, ai, model);
  const sanitized = sanitizeImportPayload(parsedJsonResult.json);
  const parsed = ImportPayload.parse(sanitized);

  if (!(parsed.events.length > 0) && !(parsed.standings.length > 0)) {
    throw new Error('Gemini não retornou eventos ou entry lists validáveis no modo compacto. Nada foi salvo.');
  }

  return {
    json: parsed,
    rawText: parsedJsonResult.repaired
      ? `${rawText}\n\n--- JSON REPAIRED BY GEMINI ---\n${parsedJsonResult.repairedText}`
      : rawText,
    model,
  };
}

async function normalizeEvidenceWithGemini(evidences: SearchEvidence[], query: string) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY vazia. Configure a chave antes de executar importação real.');
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = process.env.GEMINI_NORMALIZER_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const minDate = getMinImportDate().toISOString().slice(0, 10);

  const evidenceText = evidences
    .map((evidence, index) => `### Evidence ${index + 1}\nProvider: ${evidence.provider}\nTask: ${evidence.task}\n${evidence.rawText}`)
    .join('\n\n')
    .slice(0, Number(process.env.IMPORT_EVIDENCE_MAX_CHARS || '90000'));

  const prompt = `
You normalize grounded motorsport evidence into strict JSON for a production website.

Core goal:
Extract the maximum reliable GT3/endurance data, but never invent facts.

Current minimum date:
${minDate}
Ignore events before this date.

Hard rules:
- Return only valid JSON. No markdown.
- Use evidence only. Do not invent event dates, drivers, teams, cars or URLs.
- Prefer official source URLs when available.
- Events must be main race events. Never use trial, test day, testing, prologue, practice, media day, qualifying, warm-up or pre-event dates as race dates.
- If a page contains both test/prologue dates and the real race date, return only the real race event date.
- Separate esports/virtual events using eventKind: "ESPORT". Real racing must use eventKind: "REAL".
- For standings for now, ignore championship points and gaps. Set points:null and gap:null.
- Use standings mainly as ENTRY_LIST for drivers/teams/cars.
- carNumber is the car number, not position.
- position is only display order for ENTRY_LIST if no real result is present.
- Do not return Formula 1 drivers unless the evidence clearly says they are in GT3/endurance entry list.
- Do not mix Stock Car, F1, NASCAR or unrelated categories.
- Normalize categories: GT3, GT3 Endurance, GT3 Sprint, LMGT3, GTD, GTD Pro, SP9 GT3, Endurance.
- For Spa 24 Hours, the real event is not Spa test days, not prologue and not a trial.

Required JSON shape:
{
  "summary": "string",
  "events": [
    {
      "title": "official event name",
      "series": "official series name",
      "category": "GT3 | GT3 Endurance | GT3 Sprint | LMGT3 | GTD | GTD Pro | SP9 GT3 | Endurance",
      "eventKind": "REAL or ESPORT",
      "circuit": "official circuit name",
      "country": "country or null",
      "startsAt": "YYYY-MM-DDT12:00:00.000Z",
      "endsAt": "YYYY-MM-DDT12:00:00.000Z or null",
      "priority": 1,
      "hasBrazilian": false,
      "hasVerstappen": false,
      "sourceUrl": "official/source URL or null",
      "notes": "short evidence-based note or null"
    }
  ],
  "standings": [
    {
      "eventTitle": "related event title or null",
      "eventCircuit": "related circuit or null",
      "eventDate": "YYYY-MM-DD or null",
      "series": "series",
      "category": "class/category",
      "kind": "ENTRY_LIST",
      "eventKind": "REAL or ESPORT",
      "position": 1,
      "carNumber": "number without # or null",
      "driver": "driver, duo or trio names separated by /",
      "team": "team or null",
      "car": "car model or null",
      "points": null,
      "gap": null,
      "sourceUrl": "source URL or null"
    }
  ]
}

User query:
${query}

Evidence:
${evidenceText}
`;

  const response = await generateGeminiWithRetry(ai, {
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      temperature: 0,
    },
  });

  const rawText = String((response as any).text || '');
  const parsedJsonResult = await parseJsonFromTextWithRepair(rawText, ai, model);
  const sanitized = sanitizeImportPayload(parsedJsonResult.json);
  const parsed = ImportPayload.parse(sanitized);

  if (!(parsed.events.length > 0) && !(parsed.standings.length > 0)) {
    throw new Error('Gemini não retornou eventos ou entry lists validáveis com as evidências coletadas. Nada foi salvo.');
  }

  return {
    json: parsed,
    rawText: parsedJsonResult.repaired
      ? `${rawText}\n\n--- JSON REPAIRED BY GEMINI ---\n${parsedJsonResult.repairedText}`
      : rawText,
    model,
  };
}

function eventSourceKey(event: EventInputType) {
  const startsAt = safeDate(event.startsAt);
  return stableKey(canonicalEventIdentity({
    eventKind: event.eventKind,
    title: event.title,
    circuit: event.circuit,
    startsAt,
    series: event.series,
  }));
}

async function findRelatedEvent(standing: StandingInputType) {
  if (!standing.eventTitle && !standing.eventCircuit && !standing.eventDate) return null;

  const eventDate = safeDate(standing.eventDate || undefined);
  const identity = canonicalEventIdentity({
    eventKind: standing.eventKind,
    title: standing.eventTitle || standing.series,
    circuit: standing.eventCircuit || '',
    startsAt: eventDate,
    series: standing.series,
  });
  const sourceKey = stableKey(identity);

  const direct = await prisma.event.findUnique({ where: { sourceKey } });
  if (direct) return direct;

  if (standing.eventTitle || standing.eventCircuit) {
    const year = eventDate?.getUTCFullYear() || Number(process.env.IMPORT_YEAR || new Date().getUTCFullYear());
    const canonicalTitle = canonicalEventTitle(standing.eventTitle || '');
    const canonicalCircuitKey = canonicalCircuit(standing.eventCircuit || '');
    const seriesGroup = canonicalSeriesGroup(standing.series || '');
    const candidates = await prisma.event.findMany({
      where: {
        eventKind: standing.eventKind as any,
        startsAt: {
          gte: new Date(Date.UTC(year, 0, 1)),
          lt: new Date(Date.UTC(year + 1, 0, 1)),
        },
      },
      take: 300,
    });

    return (
      candidates.find((event) => {
        const sameTitle = standing.eventTitle ? canonicalEventTitle(event.title) === canonicalTitle : true;
        const sameCircuit = standing.eventCircuit ? canonicalCircuit(event.circuit) === canonicalCircuitKey : true;
        const sameSeries = isMajorEnduranceEvent(standing.eventTitle || event.title, standing.eventCircuit || event.circuit)
          ? true
          : canonicalSeriesGroup(event.series || '') === seriesGroup;
        const sameDate = eventDate
          ? Math.abs(new Date(event.startsAt).getTime() - eventDate.getTime()) <= 1000 * 60 * 60 * 24 * 3
          : true;

        return sameTitle && sameCircuit && sameSeries && sameDate;
      }) || null
    );
  }

  return null;
}


async function ensureRelatedEventFromStanding(standing: StandingInputType, provider: string) {
  const existing = await findRelatedEvent(standing);
  if (existing) return { event: existing, created: false, updated: false };

  if (!standing.eventTitle || !standing.eventCircuit || !standing.eventDate) {
    return { event: null, created: false, updated: false };
  }

  const startsAt = safeDate(standing.eventDate);
  if (!startsAt || startsAt < getMinImportDate()) {
    return { event: null, created: false, updated: false };
  }

  if (standing.eventKind === 'REAL' && hasBlacklistedSessionName(`${standing.eventTitle} ${standing.category}`)) {
    return { event: null, created: false, updated: false };
  }

  const sourceKey = stableKey(canonicalEventIdentity({
    eventKind: standing.eventKind,
    title: standing.eventTitle,
    circuit: standing.eventCircuit,
    startsAt,
    series: standing.series,
  }));

  const data = {
    sourceKey,
    title: standing.eventTitle,
    series: standing.series,
    category: standing.category,
    eventKind: standing.eventKind as any,
    circuit: standing.eventCircuit,
    country: null,
    startsAt,
    endsAt: null,
    priority: 1,
    hasBrazilian: /(farfus|bortolotti|drudi|brazil|brasil|brasileir)/i.test(`${standing.driver} ${standing.team || ''}`),
    hasVerstappen: /verstappen/i.test(`${standing.driver} ${standing.team || ''}`),
    sourceUrl: standing.sourceUrl || provider,
    notes: 'Evento criado automaticamente a partir de entry list validada.',
  };

  const created = await prisma.event.upsert({
    where: { sourceKey },
    create: data,
    update: {
      hasBrazilian: data.hasBrazilian,
      hasVerstappen: data.hasVerstappen,
      sourceUrl: data.sourceUrl,
      notes: data.notes,
    },
  });

  return { event: created, created: true, updated: false };
}

function shouldUpdateEvent(existing: any, incoming: EventInputType) {
  const existingScore = sourceScore(existing.sourceUrl) + (existing.circuit ? 5 : 0) + (existing.country ? 2 : 0);
  const incomingScore = sourceScore(incoming.sourceUrl) + (incoming.circuit ? 5 : 0) + (incoming.country ? 2 : 0);
  return incomingScore >= existingScore;
}

async function persistPayload(payloadUnknown: unknown, provider: string) {
  const payload = ImportPayload.parse(payloadUnknown);

  let eventsCreated = 0;
  let eventsUpdated = 0;
  let standingsCreated = 0;
  let standingsUpdated = 0;

  for (const event of payload.events) {
    const startsAt = safeDate(event.startsAt);
    if (!startsAt || startsAt < getMinImportDate()) continue;
    if (event.eventKind === 'REAL' && hasBlacklistedSessionName(`${event.title} ${event.category} ${event.notes || ''}`)) continue;

    const sourceKey = eventSourceKey(event);
    const existing = await prisma.event.findUnique({ where: { sourceKey } });
    const data = {
      sourceKey,
      title: event.title,
      series: event.series,
      category: event.category,
      eventKind: event.eventKind as any,
      circuit: event.circuit,
      country: event.country || null,
      startsAt,
      endsAt: safeDate(event.endsAt),
      priority: event.priority,
      hasBrazilian: event.hasBrazilian,
      hasVerstappen: event.hasVerstappen,
      sourceUrl: event.sourceUrl || provider,
      notes: event.notes || payload.summary || null,
    };

    if (!existing) {
      await prisma.event.create({ data });
      eventsCreated++;
    } else if (shouldUpdateEvent(existing, event)) {
      await prisma.event.update({ where: { sourceKey }, data });
      eventsUpdated++;
    } else {
      await prisma.event.update({
        where: { sourceKey },
        data: {
          hasBrazilian: existing.hasBrazilian || event.hasBrazilian,
          hasVerstappen: existing.hasVerstappen || event.hasVerstappen,
          notes: existing.notes || event.notes || payload.summary || null,
          sourceUrl: existing.sourceUrl || event.sourceUrl || provider,
        },
      });
      eventsUpdated++;
    }
  }

  for (const standing of payload.standings) {
    const relatedEventResult = await ensureRelatedEventFromStanding(standing, provider);
    const relatedEvent = relatedEventResult.event;
    if (relatedEventResult.created) eventsCreated++;
    const driverKey = normalizeDriverGroup(standing.driver);
    const sourceKey = stableKey([
      'standing',
      standing.kind,
      standing.eventKind,
      standing.series,
      standing.category,
      standing.eventTitle ? canonicalEventTitle(standing.eventTitle) : '',
      driverKey,
      standing.team,
    ]);

    const existing = await prisma.standing.findUnique({ where: { sourceKey } });
    const data = {
      sourceKey,
      eventId: relatedEvent?.id || null,
      kind: standing.kind as any,
      eventKind: standing.eventKind as any,
      series: standing.series,
      category: standing.category,
      position: standing.position,
      carNumber: standing.carNumber || null,
      driver: driverKey,
      team: standing.team || null,
      car: standing.car || null,
      points: null,
      gap: null,
      sourceUrl: standing.sourceUrl || provider,
    };

    if (!existing) {
      await prisma.standing.create({ data });
      standingsCreated++;
    } else {
      await prisma.standing.update({
        where: { sourceKey },
        data: {
          ...data,
          carNumber: existing.carNumber || data.carNumber,
          car: existing.car || data.car,
          team: existing.team || data.team,
          eventId: existing.eventId || data.eventId,
          sourceUrl: existing.sourceUrl || data.sourceUrl,
        },
      });
      standingsUpdated++;
    }
  }

  return {
    eventsCreated,
    eventsUpdated,
    standingsCreated,
    standingsUpdated,
    payload,
  };
}

export async function runImport(
  options?: {
    force?: boolean;
    dryRun?: boolean;
    query?: string;
  },
): Promise<ImportDebugResult> {
  const query =
    options?.query ||
    process.env.IMPORT_QUERY ||
    '2026 GT3 and endurance real racing calendar and official entry lists drivers teams cars';

  const provider = process.env.IMPORT_SEARCH_PROVIDER || 'gemini';

  const log = await prisma.importLog.create({
    data: {
      status: 'FAILED',
      provider,
      query,
      message: 'Importação real iniciada',
    },
  });

  const diagnostics: Record<string, unknown> = {
    query,
    provider,
    stages: [],
    minDate: getMinImportDate().toISOString(),
    maxTasks: process.env.IMPORT_MAX_TASKS || '1',
    compactMode: compactImportEnabled(),
    autoExpandTasks: envFlag('IMPORT_AUTO_EXPAND_TASKS', false),
    jsonRepairEnabled: envFlag('IMPORT_ENABLE_JSON_REPAIR', false),
    pointsAndGapDisabled: true,
    searchArchitecture: compactImportEnabled()
      ? 'compact-grounded-json -> local-validator -> smart-merge'
      : 'grounded-search -> normalizer -> local-validator -> smart-merge',
  };

  try {
    let normalized: Awaited<ReturnType<typeof normalizeEvidenceWithGemini>>;
    let collected: Awaited<ReturnType<typeof collectEvidence>> | null = null;

    if (compactImportEnabled()) {
      (diagnostics.stages as string[]).push('compact_grounded_json');
      normalized = await importCompactWithGemini(query);
      diagnostics.tasks = [query];
      diagnostics.evidenceCount = 1;
      diagnostics.evidenceFailures = [];
    } else {
      (diagnostics.stages as string[]).push('collect_evidence');
      collected = await collectEvidence(query, Boolean(options?.force));
      diagnostics.tasks = collected.tasks;
      diagnostics.evidenceCount = collected.evidences.length;
      diagnostics.evidenceFailures = collected.failures;

      (diagnostics.stages as string[]).push('gemini_normalize');
      normalized = await normalizeEvidenceWithGemini(collected.evidences, query);
    }

    diagnostics.normalizedEvents = normalized.json.events.length;
    diagnostics.normalizedEntries = normalized.json.standings.length;

    (diagnostics.stages as string[]).push(options?.dryRun ? 'dry_run_validate' : 'persist');
    const parsed = ImportPayload.parse(normalized.json);

    let eventsCreated = 0;
    let eventsUpdated = 0;
    let standingsCreated = 0;
    let standingsUpdated = 0;

    if (!options?.dryRun) {
      const persisted = await persistPayload(parsed, provider);
      eventsCreated = persisted.eventsCreated;
      eventsUpdated = persisted.eventsUpdated;
      standingsCreated = persisted.standingsCreated;
      standingsUpdated = persisted.standingsUpdated;
    }

    const message = options?.dryRun
      ? 'Importação validada em dry-run. Nada foi salvo.'
      : `Importação concluída com ${provider}. Eventos e entry lists normalizados.`;

    await prisma.importLog.update({
      where: { id: log.id },
      data: {
        status: 'SUCCESS',
        message,
        llmModel: normalized.model,
        rawSearchJson: (collected || { compactMode: true, query }) as any,
        llmRawText: normalized.rawText,
        parsedJson: parsed as any,
        eventsCreated,
        eventsUpdated,
        standingsCreated,
        standingsUpdated,
        finishedAt: new Date(),
      },
    });

    return {
      ok: true,
      logId: log.id,
      status: 'SUCCESS',
      message,
      eventsCreated,
      eventsUpdated,
      standingsCreated,
      standingsUpdated,
      diagnostics,
    };
  } catch (error) {
    const detail = getErrorDetail(error);

    await prisma.importLog.update({
      where: { id: log.id },
      data: {
        status: 'FAILED',
        message: getErrorMessage(error),
        errorStage: Array.isArray(diagnostics.stages) ? diagnostics.stages.at(-1) : 'unknown',
        errorDetail: detail,
        finishedAt: new Date(),
      },
    });

    return {
      ok: false,
      logId: log.id,
      status: 'FAILED',
      message: getErrorMessage(error),
      eventsCreated: 0,
      eventsUpdated: 0,
      standingsCreated: 0,
      standingsUpdated: 0,
      diagnostics: { ...diagnostics, errorDetail: detail },
    };
  }
}
