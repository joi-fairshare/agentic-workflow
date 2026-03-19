import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

// ── Row types ──────────────────────────────────────────────

export interface MessageRow {
  id: string;
  conversation: string;
  sender: string;
  recipient: string;
  kind: "context" | "task" | "status" | "reply";
  payload: string;
  meta_prompt: string | null;
  created_at: string;
  read_at: string | null;
}

export interface TaskRow {
  id: string;
  conversation: string;
  domain: string;
  summary: string;
  details: string;
  analysis: string | null;
  assigned_to: string | null;
  status: "pending" | "in_progress" | "completed" | "failed";
  created_at: string;
  updated_at: string;
}

// ── Database client ────────────────────────────────────────

export interface DbClient {
  insertMessage(msg: Omit<MessageRow, "id" | "created_at" | "read_at">): MessageRow;
  getMessagesByConversation(conversation: string): MessageRow[];
  getUnreadMessages(recipient: string): MessageRow[];
  markRead(id: string): void;
  insertTask(task: Omit<TaskRow, "id" | "created_at" | "updated_at" | "status">): TaskRow;
  getTask(id: string): TaskRow | undefined;
  getTasksByConversation(conversation: string): TaskRow[];
  updateTaskStatus(id: string, status: TaskRow["status"], analysis?: string): void;
}

export function createDbClient(db: Database.Database): DbClient {
  // Prepare statements once
  const stmts = {
    insertMessage: db.prepare(`
      INSERT INTO messages (id, conversation, sender, recipient, kind, payload, meta_prompt)
      VALUES (@id, @conversation, @sender, @recipient, @kind, @payload, @meta_prompt)
    `),

    getByConversation: db.prepare(`
      SELECT * FROM messages WHERE conversation = @conversation ORDER BY created_at ASC
    `),

    getUnread: db.prepare(`
      SELECT * FROM messages WHERE recipient = @recipient AND read_at IS NULL ORDER BY created_at ASC
    `),

    markRead: db.prepare(`
      UPDATE messages SET read_at = @read_at WHERE id = @id
    `),

    insertTask: db.prepare(`
      INSERT INTO tasks (id, conversation, domain, summary, details, analysis, assigned_to)
      VALUES (@id, @conversation, @domain, @summary, @details, @analysis, @assigned_to)
    `),

    getTask: db.prepare(`
      SELECT * FROM tasks WHERE id = @id
    `),

    getTasksByConversation: db.prepare(`
      SELECT * FROM tasks WHERE conversation = @conversation ORDER BY created_at ASC
    `),

    updateTaskStatus: db.prepare(`
      UPDATE tasks SET status = @status, analysis = COALESCE(@analysis, analysis), updated_at = @updated_at
      WHERE id = @id
    `),
  };

  return {
    insertMessage(msg) {
      const row: MessageRow = {
        ...msg,
        id: randomUUID(),
        created_at: new Date().toISOString(),
        read_at: null,
      };
      stmts.insertMessage.run(row);
      return row;
    },

    getMessagesByConversation(conversation) {
      return stmts.getByConversation.all({ conversation }) as MessageRow[];
    },

    getUnreadMessages(recipient) {
      return stmts.getUnread.all({ recipient }) as MessageRow[];
    },

    markRead(id) {
      stmts.markRead.run({ id, read_at: new Date().toISOString() });
    },

    insertTask(task) {
      const row: TaskRow = {
        ...task,
        id: randomUUID(),
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      stmts.insertTask.run(row);
      return row;
    },

    getTask(id) {
      return stmts.getTask.get({ id }) as TaskRow | undefined;
    },

    getTasksByConversation(conversation) {
      return stmts.getTasksByConversation.all({ conversation }) as TaskRow[];
    },

    updateTaskStatus(id, status, analysis) {
      stmts.updateTaskStatus.run({
        id,
        status,
        analysis: analysis ?? null,
        updated_at: new Date().toISOString(),
      });
    },
  };
}
