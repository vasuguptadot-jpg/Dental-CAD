import { Router } from "express";
import { db } from "@workspace/db";
import { caseNotesTable, caseAssignmentsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();
router.use(requireAuth);

// Get notes for a case
router.get("/cases/:caseId/notes", async (req, res) => {
  const caseId = parseInt(req.params.caseId, 10);
  const notes = await db
    .select()
    .from(caseNotesTable)
    .where(eq(caseNotesTable.caseId, caseId))
    .orderBy(desc(caseNotesTable.isPinned), desc(caseNotesTable.createdAt));
  res.json(notes);
});

// Add a note
router.post("/cases/:caseId/notes", async (req, res) => {
  const caseId = parseInt(req.params.caseId, 10);
  const user = (req as any).user;
  const { content, noteType = "general" } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: "Content required" });
  const [note] = await db.insert(caseNotesTable).values({
    caseId,
    authorId: user.id,
    authorName: user.fullName ?? user.email ?? "Unknown",
    content: content.trim(),
    noteType,
  }).returning();
  res.json(note);
});

// Pin/unpin a note
router.patch("/notes/:noteId/pin", async (req, res) => {
  const noteId = parseInt(req.params.noteId, 10);
  const { isPinned } = req.body;
  const [note] = await db.update(caseNotesTable).set({ isPinned }).where(eq(caseNotesTable.id, noteId)).returning();
  res.json(note);
});

// Delete a note
router.delete("/notes/:noteId", async (req, res) => {
  const noteId = parseInt(req.params.noteId, 10);
  await db.delete(caseNotesTable).where(eq(caseNotesTable.id, noteId));
  res.json({ success: true });
});

// Get assignments for a case
router.get("/cases/:caseId/assignments", async (req, res) => {
  const caseId = parseInt(req.params.caseId, 10);
  const assignments = await db.select().from(caseAssignmentsTable).where(eq(caseAssignmentsTable.caseId, caseId));
  res.json(assignments);
});

// Add assignment
router.post("/cases/:caseId/assignments", async (req, res) => {
  const caseId = parseInt(req.params.caseId, 10);
  const { assigneeId, assigneeName, role } = req.body;
  if (!assigneeName?.trim()) return res.status(400).json({ error: "Assignee name required" });
  const [assignment] = await db.insert(caseAssignmentsTable).values({
    caseId,
    assigneeId: assigneeId ?? 0,
    assigneeName: assigneeName.trim(),
    role: role ?? "treatment_coordinator",
  }).returning();
  res.json(assignment);
});

// Remove assignment
router.delete("/assignments/:assignmentId", async (req, res) => {
  const assignmentId = parseInt(req.params.assignmentId, 10);
  await db.delete(caseAssignmentsTable).where(eq(caseAssignmentsTable.id, assignmentId));
  res.json({ success: true });
});

export default router;
