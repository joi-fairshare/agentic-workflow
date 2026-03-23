"use client";
import type { UsePathReplayReturn } from "@/hooks/use-path-replay";

interface PathReplayProps {
  replay: UsePathReplayReturn;
}

const SPEED_OPTIONS = [0.5, 1, 1.5, 2, 3];

const BTN_BASE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  borderRadius: 5,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.05)",
  color: "rgba(255,255,255,0.7)",
  cursor: "pointer",
  padding: 0,
  flexShrink: 0,
};

const BTN_ACTIVE: React.CSSProperties = {
  ...BTN_BASE,
  background: "rgba(124,106,245,0.25)",
  border: "1px solid rgba(124,106,245,0.5)",
  color: "#7C6AF5",
};

function IconPlay() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="currentColor"
      style={{ width: 14, height: 14 }}
    >
      <path d="M4 2.5l9 5.5-9 5.5V2.5z" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="currentColor"
      style={{ width: 14, height: 14 }}
    >
      <rect x="3" y="2" width="4" height="12" rx="1" />
      <rect x="9" y="2" width="4" height="12" rx="1" />
    </svg>
  );
}

function IconStop() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="currentColor"
      style={{ width: 14, height: 14 }}
    >
      <rect x="3" y="3" width="10" height="10" rx="1.5" />
    </svg>
  );
}

function IconStepBack() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="currentColor"
      style={{ width: 14, height: 14 }}
    >
      <rect x="3" y="3" width="2" height="10" rx="1" />
      <path d="M13 3.5L6 8l7 4.5V3.5z" />
    </svg>
  );
}

function IconStepForward() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="currentColor"
      style={{ width: 14, height: 14 }}
    >
      <rect x="11" y="3" width="2" height="10" rx="1" />
      <path d="M3 3.5L10 8l-7 4.5V3.5z" />
    </svg>
  );
}

export function PathReplay({ replay }: PathReplayProps) {
  const {
    state,
    steps,
    currentStepIndex,
    speed,
    visitedNodeIds,
    play,
    pause,
    stop,
    stepForward,
    stepBack,
    setSpeed,
  } = replay;

  if (steps.length === 0) return null;

  const total = steps.length;
  const visited = visitedNodeIds.size;
  const progressPercent = total > 0 ? ((currentStepIndex + 1) / total) * 100 : 0;
  const currentStep = currentStepIndex >= 0 ? steps[currentStepIndex] : null;
  const isPlaying = state === "playing";
  const isIdle = state === "idle";

  const shortId = (id: string | null) =>
    id ? id.slice(0, 8) + (id.length > 8 ? "…" : "") : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "8px 12px",
        background: "#1A1A1C",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        flexShrink: 0,
      }}
    >
      {/* Controls row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {/* Step back */}
        <button
          style={BTN_BASE}
          onClick={stepBack}
          disabled={currentStepIndex <= 0}
          title="Step back"
          aria-label="Step back"
        >
          <IconStepBack />
        </button>

        {/* Play / Pause */}
        <button
          style={isPlaying ? BTN_ACTIVE : BTN_BASE}
          onClick={isPlaying ? pause : play}
          title={isPlaying ? "Pause" : "Play"}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <IconPause /> : <IconPlay />}
        </button>

        {/* Stop */}
        <button
          style={isIdle ? { ...BTN_BASE, opacity: 0.4, cursor: "default" } : BTN_BASE}
          onClick={stop}
          disabled={isIdle}
          title="Stop"
          aria-label="Stop"
        >
          <IconStop />
        </button>

        {/* Step forward */}
        <button
          style={BTN_BASE}
          onClick={stepForward}
          disabled={currentStepIndex >= total - 1}
          title="Step forward"
          aria-label="Step forward"
        >
          <IconStepForward />
        </button>

        {/* Divider */}
        <div
          style={{
            width: 1,
            height: 18,
            background: "rgba(255,255,255,0.1)",
            marginLeft: 2,
            marginRight: 2,
          }}
        />

        {/* Speed buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <span
            style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", marginRight: 2 }}
          >
            Speed
          </span>
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              style={
                speed === s
                  ? {
                      ...BTN_BASE,
                      width: "auto",
                      padding: "0 6px",
                      fontSize: 10,
                      background: "rgba(124,106,245,0.25)",
                      border: "1px solid rgba(124,106,245,0.5)",
                      color: "#7C6AF5",
                      fontWeight: 600,
                    }
                  : {
                      ...BTN_BASE,
                      width: "auto",
                      padding: "0 6px",
                      fontSize: 10,
                    }
              }
              onClick={() => setSpeed(s)}
              title={`${s}x speed`}
              aria-label={`Set speed to ${s}x`}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Visit count */}
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", whiteSpace: "nowrap" }}>
          {visited}/{total} nodes visited
        </span>
      </div>

      {/* Progress bar + step info */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {/* Progress bar */}
        <div
          style={{
            height: 3,
            background: "rgba(255,255,255,0.08)",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progressPercent}%`,
              background: "#7C6AF5",
              borderRadius: 2,
              transition: "width 0.15s ease",
            }}
          />
        </div>

        {/* Step info */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap" }}>
            Step {currentStepIndex >= 0 ? currentStepIndex + 1 : 0}/{total}
          </span>
          {currentStep && (
            <span
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.35)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              —{" "}
              {currentStep.edge_kind
                ? `reached via ${currentStep.edge_kind}`
                : "start node"}
              {currentStep.parent_id
                ? ` from ${shortId(currentStep.parent_id)}`
                : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
