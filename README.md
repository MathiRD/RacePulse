# Motorsport Tracker

A modern motorsport tracking platform focused on endurance racing, GT3, Formula 1, WEC, IMSA, GT World Challenge, Nürburgring 24h, Spa 24h and related categories.

The application centralizes racing calendars, driver-focused standings, entry lists, priorities and visual markers to make it easier to follow relevant races, drivers and teams throughout the season.

## Overview

Motorsport Tracker was built to provide a clean and practical way to follow racing events in chronological order, with special attention to:

- Endurance and GT3 calendars
- Formula 1 and major international racing series
- Driver standings and championship points
- Brazilian drivers
- Max Verstappen-related races or appearances
- Race priority levels
- Automated data import from real web sources using Tavily and Gemini

The project is designed to avoid manually maintaining large motorsport datasets while still keeping control over data validation, normalization and persistence.

## Features

- Chronological racing calendar
- Priority-based event classification
- Driver-focused standings
- Brazilian driver markers
- Verstappen-related markers
- Event categories and series filtering
- Automated import pipeline using Tavily search and Gemini normalization
- Import logs with diagnostics
- Cache support for repeated imports
- PostgreSQL persistence through Prisma
- Ready for deployment on Vercel

## Tech Stack

- Next.js
- TypeScript
- Prisma ORM
- PostgreSQL
- Zod
- Tavily API
- Google Gemini API
- Redis-compatible cache
- Vercel

## Project Structure

```txt
.
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   ├── components/
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── cache.ts
│   │   └── import/
│   └── styles/
├── public/
├── package.json
├── README.md
└── .env.example
```

## Environment Variables

Create a `.env` file based on `.env.example`.

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"

TAVILY_API_KEY="your_tavily_api_key"
TAVILY_SEARCH_DEPTH="advanced"
TAVILY_MAX_RESULTS="10"

GEMINI_API_KEY="your_gemini_api_key"
GEMINI_MODEL="gemini-2.5-flash"

IMPORT_QUERY="2026 endurance racing GT3 calendar Nürburgring 24 Spa 24 GT World Challenge Europe WEC IMSA Intercontinental GT Challenge dates"
IMPORT_CACHE_TTL_SECONDS="86400"

REDIS_URL="your_redis_url"
REDIS_TOKEN="your_redis_token"
```

Depending on the cache implementation, the Redis variables may vary. Use the same names expected by `src/lib/cache.ts`.

## Installation

Clone the repository:

```bash
git clone https://github.com/your-username/your-repository.git
cd your-repository
```

Install dependencies:

```bash
npm install
```

Generate Prisma Client:

```bash
npx prisma generate
```

Run database migrations:

```bash
npx prisma migrate dev
```

Start the development server:

```bash
npm run dev
```

The application should be available at:

```txt
http://localhost:3000
```

## Database

This project uses Prisma with PostgreSQL.

Useful commands:

```bash
npx prisma generate
```

```bash
npx prisma migrate dev
```

```bash
npx prisma studio
```

For production deployments, use:

```bash
npx prisma migrate deploy
```

## Data Import

The import pipeline searches real motorsport data using Tavily and normalizes it with Gemini into a strict JSON structure.

The importer supports:

- Race calendars
- Driver standings
- Entry lists
- Race results
- Qualifying/session results

The system is intentionally driver-focused. Team-only classifications such as Constructors Championship, Teams Championship or Manufacturers Championship are ignored to avoid polluting the driver tracking experience.

Example import query:

```bash
npm run import:debug -- --force --query "2026 Formula 1 World Drivers Championship standings points"
```

For calendar data:

```bash
npm run import:debug -- --force --query "2026 WEC calendar races circuits dates"
```

For GT3 or endurance calendars:

```bash
npm run import:debug -- --force --query "2026 GT World Challenge Europe calendar Spa 24 Nürburgring 24 dates"
```

## Import Rules

The importer follows strict rules to keep data reliable:

- It does not invent races, drivers, teams, cars or dates.
- It only uses information found in the source data.
- It blocks team-only standings.
- It avoids mixing entry lists with championship standings.
- It keeps `Entry List` data only when explicitly requested.
- It stores driver, duo or trio entries as standings records.
- It stores real calendar items as event records.

## Deployment on Vercel

### 1. Push the project to GitHub

```bash
git add .
git commit -m "docs: add professional project README"
git push origin main
```

### 2. Import the repository on Vercel

Go to Vercel and create a new project from the GitHub repository.

### 3. Configure environment variables

Add all required environment variables in:

```txt
Vercel Project > Settings > Environment Variables
```

Required production variables:

```env
DATABASE_URL
TAVILY_API_KEY
GEMINI_API_KEY
GEMINI_MODEL
IMPORT_QUERY
IMPORT_CACHE_TTL_SECONDS
```

Also add Redis/cache variables if your cache implementation requires them.

### 4. Configure build command

Default build command:

```bash
npm run build
```

If Prisma Client needs to be generated during build, use:

```bash
npx prisma generate && npm run build
```

Alternatively, add this to `package.json`:

```json
{
  "scripts": {
    "postinstall": "prisma generate"
  }
}
```

### 5. Deploy

After configuring the environment variables, trigger the deployment.

Vercel will build and publish the application automatically.

## Production Notes

Before deploying to production, make sure that:

- `DATABASE_URL` points to the production database.
- Prisma migrations were applied.
- Tavily and Gemini keys are valid.
- Cache credentials are correctly configured.
- Import commands are tested locally with `--dryRun` or in a safe environment.
- Invalid old standings, especially team-only classifications, are cleaned if needed.

Example cleanup for team-only standings:

```sql
DELETE FROM "Standing"
WHERE category ILIKE '%Constructors%'
   OR category ILIKE '%Constructor%'
   OR category ILIKE '%Teams%'
   OR category ILIKE '%Team%'
   OR category ILIKE '%Manufacturers%'
   OR category ILIKE '%Manufacturer%';
```

## Recommended Commit Messages

```bash
git commit -m "docs: add project README"
```

```bash
git commit -m "chore: configure vercel deployment"
```

```bash
git commit -m "feat: add motorsport import pipeline"
```

```bash
git commit -m "fix: filter team-only standings from imports"
```

## Roadmap

- Add advanced filters by series, category and priority
- Add manual review before saving imported data
- Add admin dashboard for import logs
- Add favorite drivers
- Add race weekend reminders
- Add support for team standings in a separate future module
- Improve source ranking and validation
- Add automated scheduled imports

## License

Developed by Matheus Durigon Rodrigues