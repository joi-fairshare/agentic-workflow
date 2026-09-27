export const TYPESAFE_KEYCHAIN_SERVICE = "agentic-workflow-typesafe";

export interface KeychainReader {
  (service: string, account: string): Promise<string | null>;
}

export async function readApiKey(deps: { env: NodeJS.ProcessEnv; readKeychain: KeychainReader }): Promise<string | null> {
  const fromEnv = deps.env.TYPESAFE_API_KEY;
  if (fromEnv !== undefined && fromEnv !== "") return fromEnv;
  try {
    return await deps.readKeychain(TYPESAFE_KEYCHAIN_SERVICE, "TYPESAFE_API_KEY");
  } catch {
    return null;
  }
}
