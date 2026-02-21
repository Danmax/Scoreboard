import { STORAGE_KEY_V3, STORAGE_KEY_V5, defaultPayload } from "./constants";
import type { PersistedPayload, PlayerState, ScoreboardState } from "./types";

function normalizePlayers(list: PlayerState[] | undefined, fallback: PlayerState[]): PlayerState[] {
  if (!Array.isArray(list)) return fallback;
  return list.map((p, idx) => {
    const base = fallback[idx] ?? fallback[0];
    return {
      ...base,
      ...p,
      tpm: Number.isFinite((p as Partial<PlayerState>).tpm) ? (p as Partial<PlayerState>).tpm as number : 0,
    };
  });
}

function isState(value: unknown): value is ScoreboardState {
  if (!value || typeof value !== "object") return false;
  const obj = value as Partial<ScoreboardState>;
  return (
    !!obj.teamA &&
    !!obj.teamB &&
    typeof obj.gameClockSeconds === "number" &&
    typeof obj.shotClockSeconds === "number"
  );
}

export function parsePayload(raw: string | null): PersistedPayload | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedPayload>;
    if (!parsed || !isState(parsed.state)) return null;
    const base = defaultPayload();

    return {
      ...base,
      ...parsed,
      state: {
        ...base.state,
        ...parsed.state,
        teamA: {
          ...base.state.teamA,
          ...parsed.state.teamA,
        },
        teamB: {
          ...base.state.teamB,
          ...parsed.state.teamB,
        },
      },
      players: {
        A: normalizePlayers(parsed.players?.A as PlayerState[] | undefined, base.players.A),
        B: normalizePlayers(parsed.players?.B as PlayerState[] | undefined, base.players.B),
      },
      actionLog: parsed.actionLog ?? [],
      updatedAt: parsed.updatedAt ?? Date.now(),
    };
  } catch {
    return null;
  }
}

export function loadLatestPayload(): PersistedPayload {
  const fromV5 = parsePayload(localStorage.getItem(STORAGE_KEY_V5));
  const fromV3 = parsePayload(localStorage.getItem(STORAGE_KEY_V3));

  if (!fromV5 && !fromV3) {
    return defaultPayload();
  }
  if (!fromV5) return fromV3 as PersistedPayload;
  if (!fromV3) return fromV5;

  return fromV5.updatedAt >= fromV3.updatedAt ? fromV5 : fromV3;
}

export function savePayload(payload: PersistedPayload): void {
  const normalized = {
    ...payload,
    updatedAt: Date.now(),
  };
  const serialized = JSON.stringify(normalized);
  localStorage.setItem(STORAGE_KEY_V5, serialized);
  localStorage.setItem(STORAGE_KEY_V3, serialized);
}
