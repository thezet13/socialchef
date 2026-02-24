import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.brandStyle.findMany({
    orderBy: { createdAt: "asc" },
  });

  if (existing.length === 0) {
    console.warn("⚠️ No brand styles found. Nothing to duplicate.");
    return;
  }

  const TARGET = 50;
  const result: any[] = [];

  let i = 0;
  while (result.length + existing.length < TARGET) {
    const base = existing[i % existing.length];

    result.push({
      name: `${base.name} #${Math.floor(i / existing.length) + 2}`,
      scope: base.scope,
      status: base.status,
      tenantId: base.tenantId,
      userId: base.userId,
      sourceImageUrl: base.sourceImageUrl,
      version: base.version,
      styleRecipeJson: base.styleRecipeJson,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    i++;
  }

  await prisma.brandStyle.createMany({
    data: result,
  });

}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
