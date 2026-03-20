import type { ApiResponse, ConversationSummary, Message, Task } from "./types";

const BASE = "/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  const json: ApiResponse<T> = await res.json();
  if (!json.ok) throw new Error(json.error.message);
  return json.data;
}

export async function fetchConversations(
  limit = 20,
  offset = 0,
): Promise<{ conversations: ConversationSummary[]; total: number }> {
  return get(`/conversations?limit=${limit}&offset=${offset}`);
}

export async function fetchMessages(conversation: string): Promise<Message[]> {
  return get(`/messages/conversation/${conversation}`);
}

export async function fetchTasks(conversation: string): Promise<Task[]> {
  return get(`/tasks/conversation/${conversation}`);
}
