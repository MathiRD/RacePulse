import { runImport } from '../src/lib/importer';

const args = process.argv.slice(2);
const queryFlagIndex = args.findIndex((arg) => arg === '--query');
const query = queryFlagIndex >= 0 ? args[queryFlagIndex + 1] : undefined;

runImport({
  force: args.includes('--force'),
  dryRun: args.includes('--dry-run'),
  query,
})
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
