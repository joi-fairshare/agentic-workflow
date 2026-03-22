"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export interface ReplayStep {
  node_id: string;
  parent_id: string | null;
  edge_id: string | null;
  edge_kind: string | null;
}

export type ReplayState = "idle" | "playing" | "paused";

export interface UsePathReplayReturn {
  state: ReplayState;
  steps: ReplayStep[];
  currentStepIndex: number;
  speed: number;
  visitedNodeIds: Set<string>;
  currentNodeId: string | null;
  play: () => void;
  pause: () => void;
  stop: () => void;
  stepForward: () => void;
  stepBack: () => void;
  setSpeed: (speed: number) => void;
  loadSteps: (steps: ReplayStep[]) => void;
}

export function usePathReplay(): UsePathReplayReturn {
  const [state, setState] = useState<ReplayState>("idle");
  const [steps, setSteps] = useState<ReplayStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [speed, setSpeedState] = useState(1);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speedRef = useRef(speed);
  const stepsRef = useRef(steps);
  const currentStepIndexRef = useRef(currentStepIndex);

  // Keep refs in sync
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  useEffect(() => {
    currentStepIndexRef.current = currentStepIndex;
  }, [currentStepIndex]);

  const clearIntervalRef = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startInterval = useCallback(() => {
    clearIntervalRef();
    const ms = Math.round(1000 / speedRef.current);
    intervalRef.current = setInterval(() => {
      setCurrentStepIndex((prev) => {
        const nextIndex = prev + 1;
        if (nextIndex >= stepsRef.current.length) {
          // Auto-stop at last step
          clearIntervalRef();
          setState("idle");
          return stepsRef.current.length - 1;
        }
        return nextIndex;
      });
    }, ms);
  }, [clearIntervalRef]);

  const play = useCallback(() => {
    if (stepsRef.current.length === 0) return;
    // If already at end while idle, reset to beginning
    setCurrentStepIndex((prev) => {
      if (prev >= stepsRef.current.length - 1) return -1;
      return prev;
    });
    setState("playing");
    startInterval();
  }, [startInterval]);

  const pause = useCallback(() => {
    clearIntervalRef();
    setState("paused");
  }, [clearIntervalRef]);

  const stop = useCallback(() => {
    clearIntervalRef();
    setState("idle");
    setCurrentStepIndex(-1);
  }, [clearIntervalRef]);

  const stepForward = useCallback(() => {
    clearIntervalRef();
    setState((prev) => (prev === "playing" ? "paused" : prev));
    setCurrentStepIndex((prev) => {
      const next = prev + 1;
      if (next >= stepsRef.current.length) return prev;
      return next;
    });
  }, [clearIntervalRef]);

  const stepBack = useCallback(() => {
    clearIntervalRef();
    setState((prev) => (prev === "playing" ? "paused" : prev));
    setCurrentStepIndex((prev) => {
      const next = prev - 1;
      if (next < -1) return -1;
      return next;
    });
  }, [clearIntervalRef]);

  const setSpeed = useCallback(
    (newSpeed: number) => {
      setSpeedState(newSpeed);
      speedRef.current = newSpeed;
      // If playing, restart interval with new speed
      if (intervalRef.current !== null) {
        startInterval();
      }
    },
    [startInterval],
  );

  const loadSteps = useCallback(
    (newSteps: ReplayStep[]) => {
      clearIntervalRef();
      setState("idle");
      setCurrentStepIndex(-1);
      setSteps(newSteps);
      stepsRef.current = newSteps;
    },
    [clearIntervalRef],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearIntervalRef();
    };
  }, [clearIntervalRef]);

  // Compute derived values
  const visitedNodeIds = new Set(
    steps.slice(0, currentStepIndex + 1).map((s) => s.node_id),
  );
  const currentNodeId = currentStepIndex >= 0 ? (steps[currentStepIndex]?.node_id ?? null) : null;

  return {
    state,
    steps,
    currentStepIndex,
    speed,
    visitedNodeIds,
    currentNodeId,
    play,
    pause,
    stop,
    stepForward,
    stepBack,
    setSpeed,
    loadSteps,
  };
}
