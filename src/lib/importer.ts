import { createHash } from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { cache } from '@/lib/cache';

const EventInput = z.object({
  title: z.string().min(2),
  series: z.string().min(2),
  category: z.string().min(1),
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
  series: z.string().min(2),
  category: z.string().min(1),
  position: z.number().int().positive(),
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

function parseJsonFromText(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }

    throw new Error(`Gemini retornou texto não-JSON: ${cleaned.slice(0, 800)}`);
  }
}

function normalizePriority(value: unknown) {
  const priority = Number(value || 3);

  if (priority <= 1) return 1;
  if (priority === 2) return 2;

  return 3;
}

function isStandingsQuery(query: string) {
  const q = query.toLowerCase();

  return [
    'standings',
    'standing',
    'classification',
    'championship',
    'points',
    'pts',
    'ranking',
    'rankings',
    'result',
    'results',
    'classificação',
    'classificacao',
    'pontuação',
    'pontuacao',
    'pontos',
    'resultado',
    'resultados',
  ].some((term) => q.includes(term));
}

function isCalendarQuery(query: string) {
  const q = query.toLowerCase();

  return [
    'calendar',
    'schedule',
    'dates',
    'races',
    'tracks',
    'calendário',
    'calendario',
    'corridas',
    'datas',
    'pistas',
  ].some((term) => q.includes(term));
}

function isEntryListQuery(query: string) {
  const q = query.toLowerCase();

  return [
    'entry list',
    'drivers',
    'teams',
    'cars',
    'lineup',
    'line-up',
    'entry',
    'entries',
    'inscritos',
    'pilotos',
    'equipes',
    'carros',
  ].some((term) => q.includes(term));
}

function isEntryListCategory(category: unknown) {
  const value = String(category || '').toLowerCase();

  return [
    'entry list',
    'lineup',
    'line-up',
    'drivers and teams',
    'teams and drivers',
    'race drivers',
    'grid',
    'entries',
    'entry',
    'inscritos',
    'lista de entrada',
  ].some((term) => value.includes(term));
}

function isTeamOnlyCategory(category: unknown) {
  const value = String(category || '').toLowerCase();

  return [
    'constructors championship',
    'constructor championship',
    'constructors standings',
    'constructor standings',
    'teams championship',
    'team championship',
    'teams standings',
    'team standings',
    'manufacturers championship',
    'manufacturer championship',
    'manufacturers standings',
    'manufacturer standings',
    'marques championship',
    'classificação de construtores',
    'classificacao de construtores',
    'classificação de equipes',
    'classificacao de equipes',
    'classificação de fabricantes',
    'classificacao de fabricantes',
  ].some((term) => value.includes(term));
}

function isDriverRelatedCategory(category: unknown) {
  const value = String(category || '').toLowerCase();

  return [
    'drivers championship',
    'driver championship',
    'drivers standings',
    'driver standings',
    'overall standings',
    'overall classification',
    'overall',
    'race result',
    'race results',
    'qualifying result',
    'qualifying results',
    'classification',
    'standings',
    'pro',
    'pro-am',
    'gold',
    'gold cup',
    'silver',
    'silver cup',
    'bronze',
    'bronze cup',
    'gt3',
    'lmgt3',
    'gtd',
    'gtd pro',
    'sp9',
    'classificação de pilotos',
    'classificacao de pilotos',
  ].some((term) => value.includes(term));
}

function looksLikeTeamOnlyStanding(standing: any) {
  const driver = String(standing?.driver || '').trim();
  const team = String(standing?.team || '').trim();
  const car = String(standing?.car || '').trim();

  if (isTeamOnlyCategory(standing?.category)) {
    return true;
  }

  // Exemplo ruim:
  // driver = "Mercedes"
  // team = null
  // car = null
  // category = "Constructors Championship"
  return driver !== '' && team === '' && car === '' && isTeamOnlyCategory(standing?.category);
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

function buildSearchQuery(query: string) {
  const q = query.trim();

  if (isStandingsQuery(q)) {
    return `${q} drivers championship standings classification points table -constructors -constructor -teams -manufacturers`;
  }

  if (isCalendarQuery(q)) {
    return `${q} calendar schedule date circuit race`;
  }

  if (isEntryListQuery(q)) {
    return `${q} entry list drivers teams cars lineup`;
  }

  return q;
}

function sanitizeImportPayload(input: any, query = ''): ImportPayloadType {
  const wantsStandings = isStandingsQuery(query);
  const wantsCalendar = isCalendarQuery(query);
  const wantsEntryList = isEntryListQuery(query) && !wantsStandings;

  const events = Array.isArray(input?.events)
    ? input.events
        .filter((event: any) => {
          return (
            event &&
            typeof event.title === 'string' &&
            typeof event.series === 'string' &&
            typeof event.category === 'string' &&
            typeof event.circuit === 'string' &&
            typeof event.startsAt === 'string'
          );
        })
        .map((event: any) => ({
          title: String(event.title).trim(),
          series: String(event.series).trim(),
          category: String(event.category).trim(),
          circuit: String(event.circuit).trim(),
          country: event.country ? String(event.country).trim() : null,
          startsAt: String(event.startsAt).trim(),
          endsAt: event.endsAt ? String(event.endsAt).trim() : null,
          priority: normalizePriority(event.priority),
          hasBrazilian: Boolean(event.hasBrazilian),
          hasVerstappen: Boolean(event.hasVerstappen),
          sourceUrl: event.sourceUrl ? String(event.sourceUrl).trim() : null,
          notes: event.notes ? String(event.notes).trim() : null,
        }))
    : [];

  const standings = Array.isArray(input?.standings)
    ? input.standings
        .filter((standing: any) => {
          if (
            !standing ||
            standing.driver === null ||
            standing.driver === undefined ||
            String(standing.driver).trim() === '' ||
            standing.series === null ||
            standing.series === undefined ||
            String(standing.series).trim() === '' ||
            standing.category === null ||
            standing.category === undefined ||
            String(standing.category).trim() === ''
          ) {
            return false;
          }

          if (looksLikeTeamOnlyStanding(standing)) {
            return false;
          }

          // Se a consulta for calendário puro, não salva standings perdidos.
          if (wantsCalendar && !wantsStandings && !wantsEntryList) {
            return false;
          }

          // Se pediu classificação/pontos, não deixa Entry List misturar.
          if (wantsStandings && isEntryListCategory(standing.category)) {
            return false;
          }

          // Se pediu classificação/pontos, bloqueia categorias de equipes/construtores.
          if (wantsStandings && isTeamOnlyCategory(standing.category)) {
            return false;
          }

          // Se pediu classificação/pontos, aceita apenas categoria relacionada a pilotos/resultados/classes.
          if (wantsStandings && !isDriverRelatedCategory(standing.category)) {
            return false;
          }

          // Se não pediu Entry List, evita salvar Entry List por acidente.
          if (!wantsEntryList && isEntryListCategory(standing.category)) {
            return false;
          }

          return true;
        })
        .map((standing: any, index: number) => ({
          series: String(standing.series).trim(),
          category: String(standing.category).trim(),
          position: parsePositivePosition(standing.position, index + 1),
          driver: String(standing.driver).trim(),
          team: standing.team ? String(standing.team).trim() : null,
          car: standing.car ? String(standing.car).trim() : null,
          points: parseNullableNumber(standing.points),
          gap: standing.gap ? String(standing.gap).trim() : null,
          sourceUrl: standing.sourceUrl ? String(standing.sourceUrl).trim() : null,
        }))
    : [];

  return {
    summary: input?.summary ? String(input.summary).trim() : '',
    events,
    standings,
  };
}

async function searchTavily(query: string) {
  if (!process.env.TAVILY_API_KEY) {
    throw new Error('TAVILY_API_KEY vazia. Configure a chave antes de executar importação real.');
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
      max_results: Number(process.env.TAVILY_MAX_RESULTS || '10'),
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
    status: response.status,
    json,
    rawText: text,
  };
}

async function normalizeWithGemini(raw: unknown, query: string) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY vazia. Configure a chave antes de executar importação real.');
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });

  const prompt = `
Você é um normalizador de dados reais de automobilismo.

Objetivo:
Transformar resultados de busca web sobre calendários, entry lists, lineups, pilotos, equipes, modelos de carros, classificações, standings, championship standings, points tables, race results e session results em JSON válido.

Contexto do sistema:
- O sistema acompanha PILOTOS, DUPLAS ou TRIOS.
- O sistema NÃO acompanha equipes, construtores ou fabricantes isolados neste momento.
- Portanto, nunca retorne linhas em que o "driver" seja apenas uma equipe, construtor ou fabricante.

Regras obrigatórias:
- Retorne SOMENTE JSON válido.
- Não use markdown.
- Não invente eventos, pilotos, equipes, carros, pontos, gaps ou datas.
- Use somente informações indicadas nos dados brutos.
- sourceUrl deve vir da URL da fonte quando disponível.
- Não traduza nomes oficiais de séries, equipes, pilotos, circuitos ou classes.
- Se não houver dados confiáveis, retorne arrays vazios.

Regras para EVENTS:
- Use events SOMENTE para calendário, schedule, dates, races, tracks ou calendário de corridas.
- Se não tiver certeza da hora do evento, use 12:00:00.000Z.
- Se não tiver data final, use null em endsAt.
- Não coloque corridas dentro de standings.

Regras para STANDINGS:
- Use standings para classificações de pilotos, championship standings de pilotos, race results, quali/session results e entry lists válidas.
- driver deve ser o piloto, dupla ou trio.
- team deve ser a equipe.
- car deve ser o modelo do carro quando a fonte informar.
- Se encontrar piloto/equipe mas não encontrar carro, use car: null.
- Não retorne standings com driver null.
- Não retorne standings onde driver seja Mercedes, Ferrari, McLaren, Red Bull, Alpine, Haas, Williams, Audi, Cadillac, Aston Martin ou qualquer equipe/construtor/fabricante sozinho.
- position deve ser numérico e representar a posição encontrada.
- points deve ser numérico quando houver PTS, Total, Points, Pontos ou pontuação equivalente.
- gap deve ser preenchido somente se a fonte trouxer gap, interval, behind ou diferença para o líder.
- Não preencha gap em standings de campeonato, salvo se a fonte trouxer gap explicitamente.

Regras para bloquear equipes/construtores:
- Nunca retorne Constructors Championship.
- Nunca retorne Teams Championship.
- Nunca retorne Manufacturers Championship.
- Nunca retorne Constructors Standings.
- Nunca retorne Teams Standings.
- Nunca retorne Manufacturers Standings.
- Se a tabela tiver apenas equipes/construtores/fabricantes, ignore.
- Para Formula 1, quando a consulta pedir standings, championship, classification, points, pts ou ranking, retorne SOMENTE Drivers Championship.

Regras para ENTRY LIST:
- Use entry list, lineup, teams list ou inscritos dentro de standings SOMENTE quando a consulta pedir entry list, lineup, teams, drivers ou cars E NÃO pedir standings, championship, classification, points, pts, gap ou ranking.
- Em entry list, use category: "Entry List".
- Em entry list, points e gap devem ser null.
- Em entry list, position pode ser a ordem encontrada na fonte quando não houver classificação real.
- Não misture Entry List com Drivers Championship na mesma resposta quando a consulta pedir standings, pontos, classification, championship ou ranking.

Regras para CLASSIFICAÇÕES COM PONTOS:
- Se a consulta pedir "standings", "classification", "championship", "points", "pts", "gap" ou "ranking":
  - Extraia SOMENTE tabelas de classificação/campeonato/resultado relacionadas a pilotos.
  - Não retorne Entry List, line-up, grid, teams/drivers list ou lista de inscritos.
  - Não retorne Constructors Championship, Teams Championship ou Manufacturers Championship.
  - A categoria deve ser "Drivers Championship", "Overall Standings", "Race Result", "Qualifying Result" ou equivalente relacionado a pilotos/classes.
  - Cada item em standings deve ter points numérico quando a fonte tiver coluna "Points", "Pts", "Total" ou equivalente.
  - Se encontrar uma tabela com coluna "Pos.", "Driver" e "Points", use o último valor numérico da linha como points.
  - Ignore tabelas de "Entries", "Teams and drivers", "Race drivers", "Line-up", "Constructors", "Teams" ou "Manufacturers".
  - Quando houver tanto "Entry List" quanto "World Drivers' Championship standings" nos dados brutos, priorize "World Drivers' Championship standings".

Regras para categorias/classes:
- Use category como a classe oficial quando existir: Pro, Pro-Am, Gold, Silver, Bronze, Overall, GT3, LMGT3, GTD, GTD Pro, SP9, Drivers Championship, Overall Standings, Race Result, Qualifying Result ou Entry List.
- Gold, Silver e Bronze podem ser categorias válidas em GT3/GTWC/SRO quando a fonte indicar classe de piloto/equipe.
- Não use Gold/Silver/Bronze apenas por legenda de cor de resultado. Se vier da legenda "Gold = Winner", "Silver = Second place", "Bronze = Third place", ignore como categoria.

Consulta usada:
${query}

Formato obrigatório:
{
  "summary": "string",
  "events": [
    {
      "title": "string",
      "series": "string",
      "category": "string",
      "circuit": "string",
      "country": "string ou null",
      "startsAt": "YYYY-MM-DDTHH:mm:ss.000Z",
      "endsAt": "YYYY-MM-DDTHH:mm:ss.000Z ou null",
      "priority": 1,
      "hasBrazilian": false,
      "hasVerstappen": false,
      "sourceUrl": "string ou null",
      "notes": "string ou null"
    }
  ],
  "standings": [
    {
      "series": "string",
      "category": "string",
      "position": 1,
      "driver": "string",
      "team": "string ou null",
      "car": "string ou null",
      "points": 0,
      "gap": "string ou null",
      "sourceUrl": "string ou null"
    }
  ]
}

Dados brutos:
${JSON.stringify(raw).slice(0, 32000)}
`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
    },
  });

  const rawText = response.text || '';
  const json = parseJsonFromText(rawText);
  const sanitized = sanitizeImportPayload(json, query);
  const parsed = ImportPayload.parse(sanitized);

  const wantsStandings = isStandingsQuery(query);

  if (
    wantsStandings &&
    parsed.standings.length > 0 &&
    parsed.standings.every((standing) => standing.points === null || standing.points === undefined)
  ) {
    throw new Error(
      'A consulta pediu classificação/pontos, mas o Gemini retornou standings sem pontuação. Provavelmente normalizou Entry List em vez de Championship Standings.',
    );
  }

  if (!(parsed.events.length > 0) && !(parsed.standings.length > 0)) {
    throw new Error('Gemini não retornou nenhum evento real validável. Nada foi salvo.');
  }

  return {
    json: parsed,
    rawText,
    model,
  };
}

async function persistPayload(payloadUnknown: unknown, provider: string) {
  const payload = ImportPayload.parse(payloadUnknown);

  let eventsCreated = 0;
  let eventsUpdated = 0;
  let standingsCreated = 0;
  let standingsUpdated = 0;

  for (const event of payload.events) {
    const startsAt = safeDate(event.startsAt);

    if (!startsAt) {
      continue;
    }

    const sourceKey = stableKey(['event', event.series, event.title, event.circuit, startsAt.toISOString()]);
    const existing = await prisma.event.findUnique({ where: { sourceKey } });

    await prisma.event.upsert({
      where: { sourceKey },
      create: {
        sourceKey,
        title: event.title,
        series: event.series,
        category: event.category,
        circuit: event.circuit,
        country: event.country || null,
        startsAt,
        endsAt: safeDate(event.endsAt),
        priority: event.priority,
        hasBrazilian: event.hasBrazilian,
        hasVerstappen: event.hasVerstappen,
        sourceUrl: event.sourceUrl || provider,
        notes: event.notes || payload.summary || null,
      },
      update: {
        title: event.title,
        series: event.series,
        category: event.category,
        circuit: event.circuit,
        country: event.country || null,
        startsAt,
        endsAt: safeDate(event.endsAt),
        priority: event.priority,
        hasBrazilian: event.hasBrazilian,
        hasVerstappen: event.hasVerstappen,
        sourceUrl: event.sourceUrl || provider,
        notes: event.notes || payload.summary || null,
      },
    });

    if (existing) eventsUpdated++;
    else eventsCreated++;
  }

  for (const standing of payload.standings) {
    const sourceKey = stableKey([
      'standing',
      standing.series,
      standing.category,
      standing.driver,
      standing.team,
    ]);

    const existing = await prisma.standing.findUnique({ where: { sourceKey } });

    await prisma.standing.upsert({
      where: { sourceKey },
      create: {
        sourceKey,
        series: standing.series,
        category: standing.category,
        position: standing.position,
        driver: standing.driver,
        team: standing.team || null,
        car: standing.car || null,
        points: standing.points ?? null,
        gap: standing.gap || null,
        sourceUrl: standing.sourceUrl || provider,
      },
      update: {
        series: standing.series,
        category: standing.category,
        position: standing.position,
        driver: standing.driver,
        team: standing.team || null,
        car: standing.car || null,
        points: standing.points ?? null,
        gap: standing.gap || null,
        sourceUrl: standing.sourceUrl || provider,
      },
    });

    if (existing) standingsUpdated++;
    else standingsCreated++;
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
    '2026 endurance racing GT3 calendar Nürburgring 24 Spa 24 GT World Challenge Europe WEC IMSA Intercontinental GT Challenge dates';

  const searchQuery = buildSearchQuery(query);
  const provider = 'tavily+gemini';

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
    searchQuery,
    provider,
    stages: [],
    strictRealData: true,
    tracksDriversOnly: true,
    blocksTeamOnlyStandings: true,
  };

  const ttl = Number(process.env.IMPORT_CACHE_TTL_SECONDS || '86400');
  const cacheClient = await cache();
  const cacheKey = `import:${searchQuery}`;

  try {
    let searchJson: unknown = null;
    let tavilyStatus: number | undefined;

    try {
      (diagnostics.stages as string[]).push('cache_check');

      const cached = !options?.force ? await cacheClient.get<unknown>(cacheKey) : null;

      if (cached) {
        searchJson = cached;
        (diagnostics.stages as string[]).push('cache_hit');
      } else {
        (diagnostics.stages as string[]).push('tavily_search');

        const result = await searchTavily(searchQuery);

        searchJson = result.json;
        tavilyStatus = result.status;

        await cacheClient.set(cacheKey, searchJson, ttl);
      }
    } catch (error) {
      diagnostics.searchError = getErrorMessage(error);
      throw new Error(`Falha na busca Tavily: ${diagnostics.searchError}`);
    }

    let normalized: ImportPayloadType;
    let llmRawText = '';
    let llmModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    try {
      (diagnostics.stages as string[]).push('gemini_normalize');

      const result = await normalizeWithGemini(searchJson, query);

      normalized = result.json;
      llmRawText = result.rawText;
      llmModel = result.model;
    } catch (error) {
      diagnostics.llmError = getErrorMessage(error);
      diagnostics.llmErrorDetail = getErrorDetail(error);
      throw new Error(`Falha na normalização Gemini: ${diagnostics.llmError}`);
    }

    (diagnostics.stages as string[]).push(options?.dryRun ? 'dry_run_validate' : 'persist');

    const parsed = ImportPayload.parse(normalized);

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
      ? 'Importação real validada em modo dry-run. Nada foi salvo.'
      : 'Importação real concluída com Tavily + Gemini.';

    await prisma.importLog.update({
      where: {
        id: log.id,
      },
      data: {
        status: 'SUCCESS',
        message,
        tavilyStatus,
        llmModel,
        rawSearchJson: searchJson as any,
        llmRawText,
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
      where: {
        id: log.id,
      },
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
      diagnostics: {
        ...diagnostics,
        errorDetail: detail,
      },
    };
  }
}