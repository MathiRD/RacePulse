import { prisma } from '../src/lib/prisma';

async function main() {
  await prisma.standing.deleteMany();
  await prisma.event.deleteMany();
  await prisma.importLog.deleteMany();
  console.log('Banco limpo: Event, Standing e ImportLog foram esvaziados.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
