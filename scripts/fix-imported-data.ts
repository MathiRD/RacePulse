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
  return cleanText(value).replace(/\s+/g, "-");
}


function normalizeTeamKey(value: unknown) {
  const text = cleanText(value);

  return text
    .replace(/\b(team|racing|motorsport|motorsports|competition|garage|by)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "unknown-team";
}

function normalizeCarNumberKey(value: unknown) {
  const text = String(value ?? "").trim();
  const number = text.match(/[A-Za-z0-9]+/g)?.join("") || "";

  return number ? number.toLowerCase() : "no-car-number";
}

function normalizeDriverGroup(value: unknown) {
  return String(value ?? "")
    .split(/\s*(?:\/|,|;|\+| and | & )\s*/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .sort((a, b) => cleanText(a).localeCompare(cleanText(b)))
    .join(" / ");
}

function driverLineupParts(value: unknown) {
  return String(value ?? "")
    .split(/\s*(?:\/|,|;|\+| and | & )\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function driverLineupScore(value: unknown) {
  const parts = driverLineupParts(value);
  const text = String(value ?? "").trim();

  return parts.length * 100 + text.length;
}

function standingGroupKey(standing: any) {
  const teamKey = normalizeTeamKey(standing.team);
  const carNumberKey = normalizeCarNumberKey(standing.carNumber);
  const eventKey = standing.eventId || `${cleanText(standing.series)}|no-event`;
  const categoryKey = slug(standing.category);

  if (standing.kind === "ENTRY_LIST" && carNumberKey !== "no-car-number" && teamKey !== "unknown-team") {
    return [
      "entry-list",
      standing.eventKind,
      eventKey,
      categoryKey,
      teamKey,
      carNumberKey,
    ].join("|");
  }

  return [
    standing.kind,
    standing.eventKind,
    eventKey,
    categoryKey,
    teamKey,
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

  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => scoreStanding(b) - scoreStanding(a));
    const keeper = sorted[0];
    const duplicates = sorted.slice(1);
    const bestDriver = sorted.map((item) => item.driver).sort((a, b) => driverLineupScore(b) - driverLineupScore(a))[0];
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

const EVENT_SPONSOR_WORDS = [
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
  "qatar airways",
  "bapco energies",
  "imsa michelin",
];

function stripEventSponsorWords(value: string) {
  let text = cleanText(value);

  for (const sponsor of EVENT_SPONSOR_WORDS) {
    const sponsorText = cleanText(sponsor);
    text = text
      .replace(new RegExp(`^${sponsorText}\\b\\s*`, "i"), "")
      .replace(new RegExp(`\\b${sponsorText}\\b`, "gi"), " ");
  }

  return text
    .replace(
      /\b(main race|race event|official|provisional|entry list|calendar|schedule|race week)\b/g,
      " ",
    )
    .replace(/\b(round|rd)\s*\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDurationToken(value: string) {
  const text = cleanText(value);

  if (/\b24\s*(h|hour|hours|hrs)\b|\btwenty four\b/.test(text)) return "24h";
  if (/\b12\s*(h|hour|hours|hrs)\b|\btwelve\b/.test(text)) return "12h";
  if (/\b10\s*(h|hour|hours|hrs)\b|\bten\b/.test(text)) return "10h";
  if (/\b8\s*(h|hour|hours|hrs)\b|\beight\b/.test(text)) return "8h";
  if (/\b6\s*(h|hour|hours|hrs)\b|\bsix\b/.test(text)) return "6h";
  if (/\b4\s*(h|hour|hours|hrs)\b|\bfour\b/.test(text)) return "4h";
  if (/\b3\s*(h|hour|hours|hrs)\b|\bthree\b/.test(text)) return "3h";
  if (/\b2\s*(h|hour|hours|hrs)\b|\btwo\b/.test(text)) return "2h";

  return "";
}

function structuralEventToken(value: string) {
  const text = cleanText(value);
  const tokens = [
    "sprint",
    "endurance",
    "summer race",
    "winter race",
    "classic",
    "grand prix",
    "nls",
    "qualifiers",
    "qualifying race",
    "race of champions",
    "road race showcase",
  ];

  return tokens.find((token) => text.includes(token)) || "";
}

function canonicalCircuit(circuit: string) {
  const c = cleanText(circuit);

  if (/spa|francorchamps/.test(c)) return "circuit-de-spa-francorchamps";
  if (/nurburgring|nuerburgring|nordschleife|green hell|24h rennen|n24/.test(c))
    return "nurburgring-nordschleife";
  if (/le mans|sarthe/.test(c)) return "circuit-de-la-sarthe";
  if (/daytona/.test(c)) return "daytona-international-speedway";
  if (/sebring/.test(c)) return "sebring-international-raceway";
  if (/bathurst|mount panorama/.test(c)) return "mount-panorama-circuit";
  if (/paul ricard/.test(c)) return "circuit-paul-ricard";
  if (/monza/.test(c)) return "autodromo-nazionale-monza";
  if (/silverstone/.test(c)) return "silverstone-circuit";
  if (/suzuka/.test(c)) return "suzuka-circuit";
  if (/interlagos|jose carlos pace|sao paulo/.test(c)) return "interlagos";
  if (/road america/.test(c)) return "road-america";
  if (/indianapolis|indy/.test(c)) return "indianapolis-motor-speedway";
  if (/vir|virginia/.test(c)) return "virginia-international-raceway";
  if (/watkins glen/.test(c)) return "watkins-glen-international";
  if (/laguna seca/.test(c)) return "weathertech-raceway-laguna-seca";
  if (/road atlanta/.test(c)) return "road-atlanta";

  return slug(circuit) || "unknown-circuit";
}

function canonicalEventTitle(title: string, circuit = "") {
  const raw = cleanText(`${title} ${circuit}`);
  const t = stripEventSponsorWords(title);
  const combined = cleanText(`${t} ${circuit}`);
  const duration = extractDurationToken(`${title} ${circuit}`);

  if (
    (duration === "24h" || /\bn24\b|24h rennen|24 h rennen/.test(raw)) &&
    /(nurburgring|nuerburgring|nordschleife|n24|24h rennen)/.test(combined)
  )
    return "24-hours-of-nurburgring";
  if (duration === "24h" && /(spa|francorchamps)/.test(combined))
    return "24-hours-of-spa";
  if (duration === "24h" && /le mans|sarthe/.test(combined))
    return "24-hours-of-le-mans";
  if (duration === "24h" && /daytona/.test(combined))
    return "24-hours-of-daytona";
  if (duration === "24h" && /dubai/.test(combined)) return "24-hours-of-dubai";
  if (duration === "12h" && /bathurst|mount panorama/.test(combined))
    return "bathurst-12-hour";
  if (duration === "12h" && /sebring/.test(combined))
    return "12-hours-of-sebring";
  if (/petit.*le.*mans/.test(combined)) return "petit-le-mans";
  if (duration === "6h" && /watkins.*glen/.test(combined))
    return "6-hours-of-watkins-glen";

  const structural = structuralEventToken(t);
  const hourRace = t.match(
    /(?:^|\b)(\d{1,2})\s*(?:h|hour|hours|hrs)\b(?:\s+of)?\s+([a-z0-9 ]{3,60})/,
  );
  if (hourRace?.[1] && hourRace?.[2]) {
    const name =
      slug(hourRace[2].replace(/\brace\b/g, "")) || slug(circuit) || "event";
    return `${hourRace[1]}-hours-${name}`;
  }

  const cleaned = t
    .replace(/\brace\s+at\s+the\b/g, " ")
    .replace(/\brace\s+at\b/g, " ")
    .replace(/\bthe\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (slug(`${duration} ${structural} ${cleaned}`) || "unknown-event")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function displayEventTitle(title: string, circuit = "") {
  const key = canonicalEventTitle(title, circuit);
  const titles: Record<string, string> = {
    "24-hours-of-nurburgring": "24 Hours of Nürburgring",
    "24-hours-of-spa": "24 Hours of Spa",
    "24-hours-of-le-mans": "24 Hours of Le Mans",
    "24-hours-of-daytona": "24 Hours of Daytona",
    "24-hours-of-dubai": "Dubai 24H",
    "bathurst-12-hour": "Bathurst 12 Hour",
    "12-hours-of-sebring": "12 Hours of Sebring",
    "petit-le-mans": "Petit Le Mans",
    "6-hours-of-watkins-glen": "6 Hours of Watkins Glen",
  };
  return titles[key] || title;
}

function eventGroupKey(event: any) {
  const date = event.startsAt ? new Date(event.startsAt) : null;
  const year =
    date && !Number.isNaN(date.getTime())
      ? date.getUTCFullYear()
      : process.env.IMPORT_YEAR || "unknown-year";
  const dateBucket =
    date && !Number.isNaN(date.getTime())
      ? date.toISOString().slice(0, 10)
      : "no-date";
  const major =
    /^(24-hours-of-spa|24-hours-of-nurburgring|24-hours-of-le-mans|24-hours-of-daytona|24-hours-of-dubai|bathurst-12-hour|12-hours-of-sebring|petit-le-mans|6-hours-of-watkins-glen)$/.test(
      canonicalEventTitle(event.title, event.circuit),
    );

  return [
    event.eventKind,
    year,
    major ? "major-endurance" : cleanText(event.series || ""),
    extractDurationToken(`${event.title} ${event.circuit}`) || "no-duration",
    structuralEventToken(event.title || "") || "event",
    canonicalEventTitle(event.title || "", event.circuit || ""),
    canonicalCircuit(event.circuit || ""),
    dateBucket,
  ].join("|");
}

function scoreEvent(event: any) {
  return [
    event.sourceUrl ? 20 : 0,
    event.country ? 5 : 0,
    event.notes ? 3 : 0,
    event.hasVerstappen ? 2 : 0,
    event.hasBrazilian ? 2 : 0,
    event.priority ? 4 - Number(event.priority) : 0,
  ].reduce((sum, item) => sum + item, 0);
}

async function main() {
  const events = await prisma.event.findMany({ orderBy: { startsAt: "asc" } });
  const groups = new Map<string, typeof events>();

  for (const event of events) {
    const key = eventGroupKey(event);
    const list = groups.get(key) || [];
    list.push(event);
    groups.set(key, list);
  }

  let mergedEvents = 0;
  let movedStandings = 0;
  let deletedEvents = 0;
  let normalizedEvents = 0;

  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => scoreEvent(b) - scoreEvent(a));
    const keeper = sorted[0];
    const duplicates = sorted.slice(1);
    const normalizedTitle = displayEventTitle(keeper.title, keeper.circuit);

    if (keeper.title !== normalizedTitle) {
      await prisma.event.update({
        where: { id: keeper.id },
        data: { title: normalizedTitle },
      });
      normalizedEvents++;
    }

    for (const duplicate of duplicates) {
      const moved = await prisma.standing.updateMany({
        where: { eventId: duplicate.id },
        data: { eventId: keeper.id },
      });
      movedStandings += moved.count;

      await prisma.event.update({
        where: { id: keeper.id },
        data: {
          hasBrazilian: keeper.hasBrazilian || duplicate.hasBrazilian,
          hasVerstappen: keeper.hasVerstappen || duplicate.hasVerstappen,
          notes: keeper.notes || duplicate.notes,
          sourceUrl: keeper.sourceUrl || duplicate.sourceUrl,
        },
      });

      await prisma.event.delete({ where: { id: duplicate.id } });
      mergedEvents++;
      deletedEvents++;
    }
  }

  const entryListMerge = await mergeDuplicateEntryLists();

  const fixedStandings = await prisma.standing.updateMany({
    data: { points: null, gap: null },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        normalizedEvents,
        mergedEvents,
        deletedEvents,
        movedStandings,
        mergedEntryLists: entryListMerge.mergedStandings,
        normalizedEntryLists: entryListMerge.normalizedStandings,
        entriesFixed: fixedStandings.count,
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
