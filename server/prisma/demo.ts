// Fills an EMPTY database with demo data, so every screen has something to
// show: members in every state, payments over six months, check-ins, programs
// and progress. Refuses to touch a database that already has members.
//
//   DEMO_PASSWORD=... npm run db:demo -w @calisthenics/server
//
// Signs in: demo-coach@example.test (coach) and demo-client@example.test
// (client), both with DEMO_PASSWORD.
import 'dotenv/config';
import { addDays, addMonths, todayIn } from '@calisthenics/shared';
import { hashPassword } from '../src/lib/password.js';
import { prisma } from '../src/lib/prisma.js';

const password = process.env.DEMO_PASSWORD ?? '';
if (password.length < 12) {
  console.error('Set DEMO_PASSWORD (at least 12 characters) for the demo accounts.');
  process.exit(1);
}
if ((await prisma.member.count()) > 0) {
  console.error('This database already has members. The demo only fills an empty database.');
  process.exit(1);
}

const today = todayIn('UTC');
const day = (offset: number) => new Date(`${addDays(today, offset)}T00:00:00Z`);
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);
const hash = await hashPassword(password);

await prisma.settings.upsert({
  where: { id: 1 },
  update: {},
  create: {
    businessName: 'Demo Bar Gym',
    coachName: 'Sami',
    coachBio: 'Coaching calisthenics for ten years. Strict form first, then strength, then skills.',
    address: 'Hamra Street, Beirut',
    phone: '+961 70 000 000',
    instagram: '@demo.calisthenics',
    openingHours: 'Every day 07:00–22:00',
    timezone: 'UTC',
  },
});

const coach = await prisma.user.create({
  data: { email: 'demo-coach@example.test', passwordHash: hash, role: 'OWNER' },
});
const plan = await prisma.plan.create({
  data: { name: 'Monthly', priceCents: 2000, durationMonths: 1, description: null },
});

/** A member whose current month ends `endOffset` days from today, paid on its first day. */
async function member(
  firstName: string,
  lastName: string,
  endOffset: number | null,
  extra: { userId?: string; history?: number } = {},
) {
  const m = await prisma.member.create({
    data: {
      firstName,
      lastName,
      phone: `+961 7${Math.floor(Math.random() * 9)} ${100 + Math.floor(Math.random() * 899)} ${100 + Math.floor(Math.random() * 899)}`,
      userId: extra.userId,
      createdAt: day(-180),
    },
  });
  if (endOffset === null) return m;
  // The current month, then earlier months back to back.
  let end = addDays(today, endOffset);
  for (let i = 0; i <= (extra.history ?? 2); i++) {
    const start = addMonths(end, -1);
    if (start > today) break;
    await prisma.subscription.create({
      data: {
        memberId: m.id,
        planId: plan.id,
        planName: plan.name,
        priceCents: plan.priceCents,
        startDate: date(start),
        endDate: date(end),
        payments: {
          create: {
            amountCents: 2000,
            method: i % 3 === 1 ? 'WHISH_MONEY' : 'CASH',
            paidAt: date(start),
            recordedById: coach.id,
          },
        },
      },
    });
    end = start;
  }
  return m;
}

const client = await prisma.user.create({
  data: { email: 'demo-client@example.test', passwordHash: hash, role: 'CLIENT' },
});
const lina = await member('Lina', 'Farouk', 6, { userId: client.id, history: 5 });
const omar = await member('Omar', 'Haddad', 2, { history: 4 });
const karim = await member('Karim', 'Nasser', 5);
const nour = await member('Nour', 'Khalil', 18, { history: 5 });
await member('Maya', 'Darwish', 16);
const rami = await member('Rami', 'Saleh', 21, { history: 3 });
await member('Sara', 'Aziz', -1, { history: 4 });
await member('Yusuf', 'Salem', -5);
const hadi = await member('Hadi', 'Mansour', null);

// Check-ins: today for four members, and Lina most days this month.
const at = (offset: number, hour: number, minute: number) =>
  new Date(day(offset).getTime() + (hour * 60 + minute) * 60_000);
for (const [m, h, min] of [
  [nour, 17, 42],
  [omar, 17, 15],
  [lina, 16, 50],
  [karim, 9, 5],
] as const) {
  await prisma.checkIn.create({
    data: { memberId: m.id, date: day(0), checkedInAt: at(0, h, min), recordedById: coach.id },
  });
}
for (const offset of [-2, -3, -5, -6, -8, -9, -11]) {
  await prisma.checkIn.create({
    data: {
      memberId: lina.id,
      date: day(offset),
      checkedInAt: at(offset, 17, 20),
      recordedById: coach.id,
    },
  });
}

// Exercises and programs.
const ex = async (name: string, unit: 'REPS' | 'SECONDS' | 'KG') =>
  prisma.exercise.create({ data: { name, unit } });
const scap = await ex('Scapula pull-ups', 'REPS');
const rows = await ex('Australian rows', 'REPS');
const negs = await ex('Negative pull-ups', 'REPS');
const hang = await ex('Dead hang', 'SECONDS');
const hollow = await ex('Hollow body hold', 'SECONDS');
const pullUps = await ex('Pull-ups', 'REPS');
const pushUps = await ex('Push-ups', 'REPS');
const dips = await ex('Dips', 'REPS');
const handstand = await ex('Handstand hold', 'SECONDS');

const pull = await prisma.program.create({
  data: {
    name: 'Beginner Pull Strength',
    level: 'Beginner',
    goal: 'First strict pull-up',
    days: {
      create: [
        {
          position: 0,
          title: 'Pull',
          exercises: {
            create: [
              {
                position: 0,
                exerciseId: scap.id,
                sets: 3,
                target: 10,
                restSeconds: 60,
                note: 'Slow, from a full hang',
              },
              {
                position: 1,
                exerciseId: rows.id,
                sets: 4,
                target: 8,
                restSeconds: 90,
                note: 'Chest to the bar',
              },
              {
                position: 2,
                exerciseId: negs.id,
                sets: 4,
                target: 4,
                restSeconds: 120,
                note: '5 seconds on the way down',
              },
              {
                position: 3,
                exerciseId: hang.id,
                sets: 3,
                target: 30,
                restSeconds: 60,
                note: 'Shoulders active',
              },
              {
                position: 4,
                exerciseId: hollow.id,
                sets: 3,
                target: 30,
                restSeconds: 60,
                note: 'Lower back on the floor',
              },
            ],
          },
        },
        {
          position: 1,
          title: 'Push',
          exercises: {
            create: [
              { position: 0, exerciseId: pushUps.id, sets: 4, target: 12, restSeconds: 90 },
              { position: 1, exerciseId: dips.id, sets: 3, target: 8, restSeconds: 120 },
            ],
          },
        },
        {
          position: 2,
          title: 'Legs and core',
          exercises: {
            create: [{ position: 0, exerciseId: hollow.id, sets: 4, target: 40, restSeconds: 60 }],
          },
        },
      ],
    },
  },
});
await prisma.program.create({
  data: {
    name: 'Push Foundations',
    level: 'Beginner',
    days: {
      create: [
        {
          position: 0,
          title: 'Push',
          exercises: {
            create: [{ position: 0, exerciseId: pushUps.id, sets: 5, target: 10, restSeconds: 90 }],
          },
        },
      ],
    },
  },
});
for (const [m, offset] of [
  [lina, -13],
  [rami, -9],
  [hadi, -3],
] as const) {
  await prisma.memberProgram.create({
    data: { memberId: m.id, programId: pull.id, assignedAt: day(offset) },
  });
}

// Lina's progress over two months.
const progress: [string, number[]][] = [
  [pullUps.id, [6, 7, 9, 11]],
  [pushUps.id, [22, 26, 30, 34]],
  [dips.id, [8, 10, 13, 15]],
  [handstand.id, [10, 15, 22, 28]],
];
for (const [exerciseId, values] of progress) {
  for (const [i, value] of values.entries()) {
    await prisma.performanceRecord.create({
      data: { memberId: lina.id, exerciseId, value, recordedAt: day(-60 + i * 20) },
    });
  }
}
for (const [i, w] of [64, 63.4, 63, 62.5].entries()) {
  await prisma.bodyMeasurement.create({
    data: { memberId: lina.id, recordedAt: day(-60 + i * 20), weightKg: w, waistCm: 72 - i },
  });
}

await prisma.contactMessage.create({
  data: {
    name: 'Rami',
    contact: 'rami@example.test',
    message: 'Do you have evening classes for beginners?',
  },
});

console.log('Demo data created. Sign in as demo-coach@example.test or demo-client@example.test.');
await prisma.$disconnect();
