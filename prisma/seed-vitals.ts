import 'dotenv/config';
// import { PrismaClient } from '@prisma/client'; // adjust to your generated client path if custom
import { PrismaPg } from '@prisma/adapter-pg'; // Prisma 7 needs a driver adapter
import { PrismaClient } from 'src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// deterministic noise so reruns look the same
let s = 42;
const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const jitter = (amp: number) => (rnd() * 2 - 1) * amp;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error('Usage: tsx prisma/seed-vitals.ts <user-email>');

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user with email ${email}`);

  const DAYS = 30;
  const since = new Date(Date.now() - (DAYS + 1) * 86_400_000);
  const wiped = await prisma.vital.deleteMany({
    where: { userId: user.id, recordedAt: { gte: since } },
  });
  console.log(`Removed ${wiped.count} existing readings in window`);

  const rows: any[] = [];
  for (let d = DAYS; d >= 0; d--) {
    const t = (DAYS - d) / DAYS; // 0 → 1 across the month
    const surge = d <= 7 ? (7 - d) * 2.2 : 0; // sharper climb in the last week
    const at = (h: number, m = 0) => {
      const dt = new Date();
      dt.setDate(dt.getDate() - d);
      dt.setHours(h, m, 0, 0);
      return dt;
    };

    // morning: BP + HR (+ glucose most days)
    rows.push({
      userId: user.id,
      recordedAt: at(7, 30),
      systolicBp: Math.round(clamp(124 + t * 8 + surge + jitter(3), 90, 180)),
      diastolicBp: Math.round(
        clamp(80 + t * 4 + surge * 0.5 + jitter(2), 55, 110),
      ),
      heartRate: Math.round(clamp(70 + jitter(4), 50, 110)),
      bloodGlucose:
        rnd() > 0.2
          ? +clamp(5.0 + t * 0.3 + jitter(0.3), 3.5, 9).toFixed(1)
          : null,
    });

    // evening BP on ~half the days (gives the chart denser points)
    if (rnd() > 0.5) {
      rows.push({
        userId: user.id,
        recordedAt: at(20, 0),
        systolicBp: Math.round(clamp(126 + t * 8 + surge + jitter(3), 90, 180)),
        diastolicBp: Math.round(
          clamp(82 + t * 4 + surge * 0.5 + jitter(2), 55, 110),
        ),
      });
    }

    // weight every other day, slight downward drift
    if (d % 2 === 0) {
      rows.push({
        userId: user.id,
        recordedAt: at(6, 45),
        weight: +(75 - t * 0.8 + jitter(0.2)).toFixed(1),
      });
    }
  }

  await prisma.vital.createMany({ data: rows });
  console.log(`Inserted ${rows.length} readings for ${email}`);
}

main().finally(() => prisma.$disconnect());
