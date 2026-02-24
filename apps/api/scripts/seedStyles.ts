import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const base = await prisma.style.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  if (!base) throw new Error("No styles found to duplicate");

  const COUNT = 50;

  // Собираем только те поля, которые реально надо копировать
  const payloadBase = {
    scope: base.scope,
    status: base.status,
    tenantId: base.tenantId,
    userId: base.userId,

    title: base.title,
    description: base.description,
    thumbnailUrl: base.thumbnailUrl,
    referenceImageUrl: base.referenceImageUrl,

    // если у тебя есть prompt/promptMeta — копируем аккуратно
    prompt: base.prompt,
    // Prisma JSON: null лучше передавать как Prisma.JsonNull (если поле nullable json)
    promptMeta: (base.promptMeta ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
  } as const;

  const ops = Array.from({ length: COUNT }).map((_, i) =>
    prisma.style.create({
      data: {
        ...payloadBase,
        title: `${base.title} #${i + 1}`,
        // createdAt/updatedAt обычно Prisma проставит сам
      },
    })
  );

  // В транзакции — быстрее и атомарно
  await prisma.$transaction(ops);

  console.log(`✅ Duplicated 1 style into ${COUNT} copies`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
