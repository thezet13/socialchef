import { prisma } from "../src/lib/prisma"; // поправь импорт под свой проект

import type { Prisma } from "@prisma/client";

async function main() {
  // Можно выбрать SYSTEM как базу, или TENANT — как хочешь
  const base = await prisma.preset.findFirst({
    where: { scope: "SYSTEM" },
    orderBy: { createdAt: "asc" },
  });

  if (!base) {
    console.log("No base preset found");
    return;
  }

  const COUNT = 50;

  // ВАЖНО: не копируем id/createdAt/updatedAt и relation-поля
  const {
    id,
    createdAt,
    updatedAt,
    tenant,
    createdBy,
    presetAssets,
    proDesigns,
    ...rest
  } = base as any;

  await prisma.$transaction(
    Array.from({ length: COUNT }).map((_, i) => {
      const n = i + 1;

      // UncheckedCreateInput удобно, потому что tenantId/createdById — обычные поля
      const data: Prisma.PresetUncheckedCreateInput = {
        ...rest,

        // чуть-чуть меняем, чтобы отличались (title обязателен)
        title: `${base.title} (dup ${n})`,
        sortOrder: base.sortOrder + n, // чтобы по сортировке не были все одинаковые

        // если хочешь сделать их кастомными — раскомментируй:
        // scope: "TENANT",
        // tenantId: "YOUR_TENANT_ID",
      };

      return prisma.preset.create({ data });
    })
  );

  console.log(`Created ${COUNT} duplicates from preset ${base.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });