import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { casesTable } from "./cases";

export interface AIChatMessageData {
  role: "user" | "assistant";
  content: string;
  context?: {
    scanId?: number;
    toothIds?: number[];
    analysisFindings?: string[];
  };
}

export const aiChatMessagesTable = pgTable("ai_chat_messages", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => casesTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  contextData: jsonb("context_data").$type<AIChatMessageData["context"]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AiChatMessage = typeof aiChatMessagesTable.$inferSelect;
