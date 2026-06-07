import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, doctorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { LoginBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.post("/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { email, password } = parsed.data;

  const [doctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.email, email)).limit(1);
  if (!doctor) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(password, doctor.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  req.session.doctorId = doctor.id;

  res.json({
    doctor: {
      id: doctor.id,
      name: doctor.name,
      email: doctor.email,
      role: doctor.role,
      createdAt: doctor.createdAt.toISOString(),
    },
  });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, message: "Logged out" });
  });
});

router.get("/me", requireAuth, async (req, res) => {
  const [doctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.id, req.session.doctorId!)).limit(1);
  if (!doctor) {
    res.status(401).json({ error: "Session invalid" });
    return;
  }
  res.json({
    id: doctor.id,
    name: doctor.name,
    email: doctor.email,
    role: doctor.role,
    createdAt: doctor.createdAt.toISOString(),
  });
});

export default router;
