import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import patientsRouter from "./patients";
import casesRouter from "./cases";
import dashboardRouter from "./dashboard";
import scansRouter from "./scans";
import segmentsRouter from "./segments";
import landmarksRouter from "./landmarks";
import analysesRouter from "./analyses";
import aiCopilotRouter from "./aiCopilot";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(patientsRouter);
router.use(casesRouter);
router.use(dashboardRouter);
router.use(scansRouter);
router.use(segmentsRouter);
router.use(landmarksRouter);
router.use(analysesRouter);
router.use(aiCopilotRouter);

export default router;
