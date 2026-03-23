"use client";

import { useParams } from "next/navigation";
import { ConversationGraphPage } from "@/components/conversation-graph/conversation-graph-page";

export default function Page() {
  const params = useParams<{ id: string }>();
  return <ConversationGraphPage conversationId={params.id} />;
}
