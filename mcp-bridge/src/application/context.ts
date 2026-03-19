/** Request context passed to every service call. */
export interface AppContext {
  requestId: string;
  now: Date;
}

let counter = 0;

export function createContext(): AppContext {
  return {
    requestId: `req-${Date.now()}-${++counter}`,
    now: new Date(),
  };
}
