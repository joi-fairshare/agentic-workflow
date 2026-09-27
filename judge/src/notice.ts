export interface FallbackNotice {
  systemMessage: string;
}

export function fallbackNotice(question: string, escalateReasonCode: string): FallbackNotice {
  return {
    systemMessage:
      `judge: "${question}" escalated (${escalateReasonCode}) instead of guessing. ` +
      `Run \`judge why <id>\` once the calling hook logs the decision id, or \`judge health\` for the overall picture.`,
  };
}
