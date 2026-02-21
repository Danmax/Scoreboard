import type { PersistedPayload, PlayerState, ScoreboardState } from "./types";

export const STORAGE_KEY_V5 = "basketball_scoreboard_state_v5b";
export const STORAGE_KEY_V3 = "basketball_scoreboard_state_v3";
export const COMMAND_KEY = "scoreboard_command";

export const DEFAULT_PLAYERS_A = [
  { number: 1, name: "Player A1" },
  { number: 3, name: "Player A2" },
  { number: 5, name: "Player A3" },
  { number: 7, name: "Player A4" },
  { number: 9, name: "Player A5" },
  { number: 11, name: "Player A6" },
  { number: 13, name: "Player A7" },
];

export const DEFAULT_PLAYERS_B = [
  { number: 2, name: "Player B1" },
  { number: 4, name: "Player B2" },
  { number: 6, name: "Player B3" },
  { number: 8, name: "Player B4" },
  { number: 10, name: "Player B5" },
  { number: 12, name: "Player B6" },
  { number: 14, name: "Player B7" },
];

export function createPlayerState(
  players: Array<{ number: number; name: string }>,
  teamKey: "A" | "B",
): PlayerState[] {
  return players.map((p, idx) => ({
    id: `${teamKey}-${idx}-${Date.now()}`,
    number: p.number,
    name: p.name,
    pts: 0,
    reb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tpm: 0,
    fls: 0,
    secondsPlayed: 0,
    onCourt: idx < 5,
    fouledOut: false,
  }));
}

export function defaultState(): ScoreboardState {
  return {
    teamA: { name: "Home", score: 0, fouls: 0, timeouts: 3, fastBreakPoints: 0, color: "#FFB347", logoUrl: "" },
    teamB: { name: "Away", score: 0, fouls: 0, timeouts: 3, fastBreakPoints: 0, color: "#7EC4CF", logoUrl: "" },
    possession: "A",
    quarter: 1,
    totalQuarters: 4,
    quarterLengthMinutes: 10,
    foulLimit: 5,
    gameClockSeconds: 10 * 60,
    shotClockDefault: 24,
    shotClockSeconds: 24,
    gameClockRunning: false,
    shotClockRunning: false,
    timingMode: "NBA",
    shotViolation: false,
    gameFinal: false,
    overlayMode: null,
    overlayLabel: "",
    overlayRemainingSeconds: 0,
    overlayResumeGame: false,
    tvAutoCooldownSeconds: 0,
    tvAutoSeen: [],
    tvStarPlayer: null,
    tvTeamComparison: null,
  };
}

export function defaultPayload(): PersistedPayload {
  const state = defaultState();
  return {
    state,
    players: {
      A: createPlayerState(DEFAULT_PLAYERS_A, "A"),
      B: createPlayerState(DEFAULT_PLAYERS_B, "B"),
    },
    actionLog: [],
    updatedAt: Date.now(),
  };
}
