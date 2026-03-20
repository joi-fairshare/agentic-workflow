"use client";

import { useEffect, useRef } from "react";
import type { BridgeEventType } from "@/lib/types";

interface UseSseOptions {
  /** Called when any bridge event arrives */
  onEvent: (eventType: BridgeEventType, data: Record<string, string>) => void;
}

/**
 * Subscribes to the bridge SSE stream at /api/events.
 * Automatically reconnects on disconnect.
 */
export function useSse({ onEvent }: UseSseOptions) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const eventSource = new EventSource("/api/events");

    const eventTypes: BridgeEventType[] = [
      "connected",
      "message:created",
      "task:created",
      "task:updated",
    ];

    for (const type of eventTypes) {
      eventSource.addEventListener(type, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          onEventRef.current(type, data);
        } catch {
          onEventRef.current(type, {});
        }
      });
    }

    eventSource.onerror = () => {
      // EventSource auto-reconnects; no action needed
    };

    return () => {
      eventSource.close();
    };
  }, []);
}
