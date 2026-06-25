import { execSync } from "child_process";
import bcrypt from "bcryptjs";
import { db, doctorsTable } from "@workspace/db";
import { logger } from "./logger";

const DEFAULT_EMAIL = "doctor@orthovision.com";
const DEFAULT_PASSWORD = "doctor123";
const DEFAULT_NAME = "Dr. Demo";

function pushSchema() {
  try {
    logger.info("Pushing DB schema...");
    execSync("pnpm --filter @workspace/db run push --force", {
      stdio: "pipe",
      cwd: "/home/runner/workspace",
    });
    logger.info("DB schema push complete.");
  } catch (err) {
    // Non-fatal: tables may already be up-to-date or db not yet reachable
    logger.warn({ err }, "DB schema push failed — tables may already be current.");
  }
}

async function seedDoctor() {
  try {
    const existing = await db
      .select({ id: doctorsTable.id })
      .from(doctorsTable)
      .limit(1);

    if (existing.length > 0) {
      logger.info("Default doctor already exists — skipping seed.");
      return;
    }

    logger.info("No doctors found — seeding default doctor account...");
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    await db.insert(doctorsTable).values({
      name: DEFAULT_NAME,
      email: DEFAULT_EMAIL,
      passwordHash,
      role: "doctor",
    });
    logger.info(
      { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD },
      "Default doctor seeded. Use these credentials to log in."
    );
  } catch (err) {
    logger.warn(
      { err },
      "Doctor seed check failed — DB may not be ready yet. Starting server anyway."
    );
  }
}

export async function ensureSeeded() {
  pushSchema();
  await seedDoctor();
}
