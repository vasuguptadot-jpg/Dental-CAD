import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, doctorsTable } from "@workspace/db";
import { LoginBody } from "@workspace/api-zod";
import { verifyPassword } from "../lib/auth";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;
  const [doctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.email, email));

  if (!doctor) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await verifyPassword(password, doctor.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  req.session.doctorId = doctor.id;
  req.log.info({ doctorId: doctor.id }, "Doctor logged in");

  res.json({
    doctor: {
      id: doctor.id,
      email: doctor.email,
      name: doctor.name,
      role: doctor.role,
    },
  });
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {
    res.json({ success: true, message: "Logged out" });
  });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [doctor] = await db
    .select()
    .from(doctorsTable)
    .where(eq(doctorsTable.id, req.session.doctorId!));

  if (!doctor) {
    res.status(401).json({ error: "Session invalid" });
    return;
  }

  res.json({
    id: doctor.id,
    email: doctor.email,
    name: doctor.name,
    role: doctor.role,
  });
});

export default router;
