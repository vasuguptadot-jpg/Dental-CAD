import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import patientsRouter from "./patients";
import casesRouter from "./cases";
import scansRouter from "./scans";
import dashboardRouter from "./dashboard";
import analysisRouter from "./analysis";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/patients", patientsRouter);
router.use("/cases", casesRouter);
router.use("/dashboard", dashboardRouter);
router.use("/", scansRouter);
router.use("/", analysisRouter);

export default router;
