const { PrismaClient } = require("@prisma/client");

/** Single PrismaClient for the app (API + worker processes). */
const prisma = new PrismaClient({
  log: ["error"],
});

async function disconnectPrisma() {
  await prisma.$disconnect();
}

module.exports = { prisma, disconnectPrisma };
