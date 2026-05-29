import { createHash } from "crypto";
import { prisma } from "../src/lib/prisma";

function cleanText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function slug(value: unknown) {
  return cleanText(value).replace(/\s+/g, "-") || "unknown";
}

function stableKey(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isFormulaOne(value: unknown) {
  const text = cleanText(value);
  return /\b(formula 1|formula one|f1)\b/.test(text);
}

function normalizeSeries(value: unknown) {
  const text = cleanText(value);
  if (isFormulaOne(text)) return "formula-1";
  if (/gt world challenge/.test(text)) return "gt-world-challenge";
  if (/intercontinental gt challenge|igtc/.test(text)) return "intercontinental-gt-challenge";
  if (/fia world endurance|\bwec\b/.test(text)) return "fia-wec";
  if (/imsa/.test(text)) return "imsa";
  return slug(text);
}

function normalizeCategory(value: unknown) {
  const text = cleanText(value);
  if (isFormulaOne(text)) return "formula-1";
  if (/\bsp9\b/.test(text) && /\bgt3\b/.test(text)) return "sp9-gt3";
  if (/\blmgt3\b/.test(text)) return "lmgt3";
  if (/\bgtd\b/.test(text)) return text.includes("pro") ? "gtd-pro" : "gtd";
  if (/\bgt3\b/.test(text)) return "gt3";
  return slug(text);
}

function normalizeTeamKey(value: unknown) {
  let text = cleanText(value);

  const aliases: Array<[RegExp, string]> = [
    [/\boracle red bull racing\b|\bred bull racing\b|\bred bull\b/g, "red bull"],
    [/\bvisa cash app rb formula one team\b|\bvisa cash app racing bulls f1 team\b|\bracing bulls\b|\bvcarb\b/g, "racing bulls"],
    [/\bmercedes amg petronas formula one team\b|\bmercedes amg petronas\b|\bmercedes\b/g, "mercedes"],
    [/\bscuderia ferrari hp\b|\bscuderia ferrari\b|\bferrari\b/g, "ferrari"],
    [/\bmclaren formula 1 team\b|\bmclaren\b/g, "mclaren"],
    [/\baston martin aramco formula one team\b|\baston martin\b/g, "aston martin"],
    [/\balpine f1 team\b|\balpine\b/g, "alpine"],
    [/\bwilliams racing\b|\bwilliams\b/g, "williams"],
    [/\bstake f1 team kick sauber\b|\bkick sauber\b|\bsauber\b/g, "sauber"],
    [/\bhaas f1 team\b|\bhaas\b/g, "haas"],
  ];

  for (const [pattern, replacement] of aliases) {
    text = text.replace(pattern, replacement);
  }

  text = text
    .replace(/\b(team|racing|motorsport|motorsports|competition|garage|scuderia|formula one|formula 1|f1|by)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || "unknown-team";
}

function normalizeCarNumberKey(value: unknown) {
  const text = String(value ?? "").trim();
  const number = text.match(/[A-Za-z0-9]+/g)?.join("") || "";
  return number ? number.toLowerCase() : "no-car-number";
}

function splitDrivers(value: unknown) {
  return String(value ?? "")
    .split(/\s*(?:\/|,|;|\+| and | & )\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeDriverName(value: unknown) {
  return cleanText(value)
    .replace(/\b(driver|piloto)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDriverGroup(value: unknown) {
  return splitDrivers(value)
    .map((driver) => driver.trim())
    .filter(Boolean)
    .sort((a, b) => normalizeDriverName(a).localeCompare(normalizeDriverName(b)))
    .join(" / ");
}

function driverLineupScore(value: unknown) {
  const parts = splitDrivers(value);
  const text = String(value ?? "").trim();
  return parts.length * 100 + text.length;
}

function getEventYear(event: { startsAt?: Date | null } | null | undefined) {
  return event?.startsAt ? event.startsAt.getUTCFullYear() : process.env.IMPORT_YEAR || "unknown-year";
}

function canonicalEventTitle(value: unknown) {
  let text = cleanText(value);

  const sponsorWords = [
    "adac",
    "ravenol",
    "crowdstrike",
    "totalenergies",
    "total energies",
    "rolex",
    "motul",
    "michelin",
    "fanatec",
    "aws",
    "powered by aws",
    "liqui moly",
    "aramco",
  ];

  for (const word of sponsorWords) {
    text = text.replace(new RegExp(`\\b${cleanText(word)}\\b`, "g"), " ");
  }

  text = text
    .replace(/\b(main race|race event|official|provisional|entry list|calendar|schedule|race week)\b/g, " ")
    .replace(/\b(round|rd)\s*\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/nurburgring|nordschleife|24h rennen/.test(text) && /\b24\s*(h|hours?)\b|twenty four/.test(text)) {
    return "24-hours-of-nurburgring";
  }
  if (/spa|francorchamps/.test(text) && /\b24\s*(h|hours?)\b|twenty four/.test(text)) {
    return "24-hours-of-spa";
  }
  if (/le mans/.test(text) && /\b24\s*(h|hours?)\b|twenty four/.test(text)) {
    return "24-hours-of-le-mans";
  }

  return slug(text);
}

function canonicalCircuit(value: unknown) {
  const text = cleanText(value);
  if (/nurburgring|nordschleife/.test(text)) return "nurburgring";
  if (/spa|francorchamps/.test(text)) return "spa-francorchamps";
  if (/le mans|sarthe/.test(text)) return "circuit-de-la-sarthe";
  if (/monza/.test(text)) return "monza";
  if (/paul ricard/.test(text)) return "paul-ricard";
  if (/daytona/.test(text)) return "daytona";
  if (/sebring/.test(text)) return "sebring";
  return slug(text);
}

function eventGroupKey(event: any) {
  const startsAt = event.startsAt ? new Date(event.startsAt) : null;
  const year = startsAt ? startsAt.getUTCFullYear() : process.env.IMPORT_YEAR || "unknown-year";
  const dateBucket = startsAt ? startsAt.toISOString().slice(0, 10) : "no-date";

  return [
    "event",
    event.eventKind || "REAL",
    year,
    normalizeSeries(event.series),
    canonicalEventTitle(event.title),
    canonicalCircuit(event.circuit),
    dateBucket,
  ].join("|");
}

function standingGroupKey(standing: any) {
  const categoryKey = normalizeCategory(standing.category);
  const seriesKey = normalizeSeries(standing.series);
  const eventKey = standing.eventId || `season:${seriesKey}:${categoryKey}:${process.env.IMPORT_YEAR || "unknown-year"}`;

  if (standing.kind === "ENTRY_LIST") {
    if (isFormulaOne(`${standing.series} ${standing.category}`)) {
      // F1 season entry lists often come without a parent event and with team aliases.
      // A driver should appear once per season/category. Keep the richest record.
      return [
        "entry-list",
        standing.eventKind || "REAL",
        "formula-1",
        getEventYear(null),
        normalizeDriverName(standing.driver),
      ].join("|");
    }

    const teamKey = normalizeTeamKey(standing.team);
    const carNumberKey = normalizeCarNumberKey(standing.carNumber);

    if (carNumberKey !== "no-car-number" && teamKey !== "unknown-team") {
      return [
        "entry-list",
        standing.eventKind || "REAL",
        eventKey,
        categoryKey,
        teamKey,
        carNumberKey,
      ].join("|");
    }

    return [
      "entry-list",
      standing.eventKind || "REAL",
      eventKey,
      categoryKey,
      teamKey,
      normalizeDriverGroup(standing.driver),
    ].join("|");
  }

  return [
    standing.kind,
    standing.eventKind || "REAL",
    eventKey,
    categoryKey,
    standing.position || "no-position",
    normalizeDriverGroup(standing.driver),
  ].join("|");
}

function scoreStanding(standing: any) {
  return (
    driverLineupScore(standing.driver) +
    (standing.car ? 40 : 0) +
    (standing.team ? 30 : 0) +
    (standing.carNumber ? 20 : 0) +
    (standing.sourceUrl ? 10 : 0) +
    (standing.eventId ? 10 : 0)
  );
}

function chooseBest<T>(items: T[], picker: (item: T) => unknown) {
  return items.map(picker).find((value) => String(value ?? "").trim()) || null;
}

async function mergeDuplicateEvents() {
  const events = await prisma.event.findMany({ orderBy: { updatedAt: "desc" } });
  const groups = new Map<string, typeof events>();

  for (const event of events) {
    const key = eventGroupKey(event);
    const list = groups.get(key) || [];
    list.push(event);
    groups.set(key, list);
  }

  let mergedEvents = 0;

  for (const group of Array.from(groups.values())) {
    if (group.length <= 1) continue;

    const sorted = [...group].sort((a, b) => {
      const scoreA = (a.sourceUrl ? 10 : 0) + (a.notes ? 5 : 0) + (a.hasVerstappen ? 3 : 0) + (a.hasBrazilian ? 2 : 0);
      const scoreB = (b.sourceUrl ? 10 : 0) + (b.notes ? 5 : 0) + (b.hasVerstappen ? 3 : 0) + (b.hasBrazilian ? 2 : 0);
      return scoreB - scoreA;
    });

    const keeper = sorted[0];
    const duplicates = sorted.slice(1);

    await prisma.event.update({
      where: { id: keeper.id },
      data: {
        hasBrazilian: group.some((event) => event.hasBrazilian),
        hasVerstappen: group.some((event) => event.hasVerstappen),
        sourceUrl: chooseBest(group, (event) => event.sourceUrl) as string | null,
        notes: chooseBest(group, (event) => event.notes) as string | null,
      },
    });

    for (const duplicate of duplicates) {
      await prisma.standing.updateMany({
        where: { eventId: duplicate.id },
        data: { eventId: keeper.id },
      });
      await prisma.event.delete({ where: { id: duplicate.id } });
      mergedEvents++;
    }
  }

  return mergedEvents;
}

async function mergeDuplicateEntryLists() {
  const standings = await prisma.standing.findMany({
    where: { kind: "ENTRY_LIST" as any },
    orderBy: { updatedAt: "desc" },
  });
  const groups = new Map<string, typeof standings>();

  for (const standing of standings) {
    const key = standingGroupKey(standing);
    const list = groups.get(key) || [];
    list.push(standing);
    groups.set(key, list);
  }

  let mergedStandings = 0;
  let normalizedStandings = 0;

  for (const group of Array.from(groups.values())) {
    const sorted = [...group].sort((a, b) => scoreStanding(b) - scoreStanding(a));
    const keeper = sorted[0];
    const duplicates = sorted.slice(1);

    const bestDriver = sorted
      .map((item) => item.driver)
      .sort((a, b) => driverLineupScore(b) - driverLineupScore(a))[0];
    const bestCar = sorted.find((item) => item.car)?.car || keeper.car;
    const bestTeam = sorted.find((item) => item.team)?.team || keeper.team;
    const bestCarNumber = sorted.find((item) => item.carNumber)?.carNumber || keeper.carNumber;
    const bestEventId = sorted.find((item) => item.eventId)?.eventId || keeper.eventId;
    const bestSourceUrl = sorted.find((item) => item.sourceUrl)?.sourceUrl || keeper.sourceUrl;

    await prisma.standing.update({
      where: { id: keeper.id },
      data: {
        driver: normalizeDriverGroup(bestDriver),
        car: bestCar,
        team: bestTeam,
        carNumber: bestCarNumber,
        eventId: bestEventId,
        sourceUrl: bestSourceUrl,
        points: null,
        gap: null,
      },
    });
    normalizedStandings++;

    for (const duplicate of duplicates) {
      await prisma.standing.delete({ where: { id: duplicate.id } });
      mergedStandings++;
    }
  }

  return { mergedStandings, normalizedStandings };
}

async function main() {
  const mergedEvents = await mergeDuplicateEvents();
  const { mergedStandings, normalizedStandings } = await mergeDuplicateEntryLists();

  console.log(
    JSON.stringify(
      {
        ok: true,
        mergedEvents,
        mergedStandings,
        normalizedStandings,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
