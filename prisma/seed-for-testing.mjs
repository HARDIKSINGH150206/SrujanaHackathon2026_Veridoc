// Manual test seed (not wired into `prisma db seed`). Creates or updates
// one user per role, each with a service number and bcrypt-hashed PIN
// for /api/auth/login, plus one case. Idempotent: safe to re-run over an
// existing database — users are matched on authIdentity, the case on
// caseNumber.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();

const BCRYPT_COST = 12;

const seedUsers = [
  { role: "POLICE_OFFICER", serviceNumber: "TEST-PARTY-1", pin: "112233" },
  { role: "INVESTIGATING_OFFICER", serviceNumber: "TEST-PARTY-2", pin: "223344" },
  { role: "COURT_OFFICIAL", serviceNumber: "TEST-REVIEWER", pin: "334455" },
  { role: "FORENSIC_LAB", serviceNumber: "TEST-VERIFIER", pin: "445566" },
  { role: "ADMIN", serviceNumber: "TEST-ADMIN", pin: "556677" },
];

async function main() {
  const users = {};
  for (const { role, serviceNumber, pin } of seedUsers) {
    const authIdentity = `${role.toLowerCase()}@test.digivault`;
    const pinHash = await bcrypt.hash(pin, BCRYPT_COST);
    const user = await prisma.user.upsert({
      where: { authIdentity },
      update: { serviceNumber, pinHash },
      create: { role, department: "General", authIdentity, serviceNumber, pinHash },
    });
    users[role] = user;
    console.log(role.padEnd(22), serviceNumber.padEnd(15), "->", user.id);
  }

  const kase = await prisma.case.upsert({
    where: { caseNumber: "TEST/2026/0001" },
    update: {},
    create: {
      caseNumber: "TEST/2026/0001",
      caseType: "Supply order",
      status: "OPEN",
      department: "General",
      createdById: users.INVESTIGATING_OFFICER.id,
    },
  });
  console.log("case ->", kase.id);
}

main().finally(() => prisma.$disconnect());
