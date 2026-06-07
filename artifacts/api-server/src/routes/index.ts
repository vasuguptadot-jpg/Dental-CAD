import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import patientsRouter from "./patients";
import casesRouter from "./cases";
import scansRouter from "./scans";
import dashboardRouter from "./dashboard";
import analysisRouter from "./analysis";
import aiCopilotRouter from "./ai-copilot";
import analyticsRouter from "./analytics";
import searchRouter from "./search";
import photosRouter from "./photos";
import caseNotesRouter from "./case-notes";
import labsRouter from "./labs";
import scanLibraryRouter from "./scan-library";
import { auditMiddleware } from "../middleware/audit";

const router: IRouter = Router();

router.use(auditMiddleware);

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/patients", patientsRouter);
router.use("/cases", casesRouter);
router.use("/dashboard", dashboardRouter);
router.use("/analytics", analyticsRouter);
router.use("/", scansRouter);
router.use("/", analysisRouter);
router.use("/", aiCopilotRouter);
router.use("/", searchRouter);
router.use("/", photosRouter);
router.use("/", caseNotesRouter);
router.use("/", labsRouter);
router.use("/", scanLibraryRouter);

export default router;
