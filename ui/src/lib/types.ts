export interface Message {
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

export interface Task {
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

export interface ConversationSummary {
  conversation: string;
  message_count: number;
  task_count: number;
  last_activity: string;
}

export interface ApiOk<T> {
  ok: true;
  data: T;
}

export interface ApiErr {
  ok: false;
  error: { code: string; message: string };
}

export type ApiResponse<T> = ApiOk<T> | ApiErr;

export type BridgeEventType = "message:created" | "task:created" | "task:updated" | "connected";
