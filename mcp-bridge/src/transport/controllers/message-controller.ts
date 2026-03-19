import type { DbClient } from "../../db/client.js";
import { sendContext } from "../../application/services/send-context.js";
import { getMessagesByConversation, getUnreadMessages } from "../../application/services/get-messages.js";
import type { ApiRequest, ApiResponse } from "../types.js";
import { appErr } from "../types.js";
import type { SendContextSchema, GetMessagesSchema, GetUnreadSchema, MessageResponse } from "../schemas/message-schemas.js";

export function createMessageController(db: DbClient) {
  return {
    async send(
      req: ApiRequest<SendContextSchema>,
    ): Promise<ApiResponse<MessageResponse>> {
      const result = sendContext(db, req.body);
      if (!result.ok) return appErr(result.error);
      return { ok: true, data: result.data };
    },

    async getByConversation(
      req: ApiRequest<GetMessagesSchema>,
    ): Promise<ApiResponse<MessageResponse[]>> {
      const result = getMessagesByConversation(db, req.params.conversation);
      if (!result.ok) return appErr(result.error);
      return { ok: true, data: result.data };
    },

    async getUnread(
      req: ApiRequest<GetUnreadSchema>,
    ): Promise<ApiResponse<MessageResponse[]>> {
      const result = getUnreadMessages(db, req.query.recipient);
      if (!result.ok) return appErr(result.error);
      return { ok: true, data: result.data };
    },
  };
}
