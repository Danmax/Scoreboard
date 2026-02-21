import type { GameRules, ManagerData } from "./types";

export const MANAGER_STORAGE_KEY = "game_manager_data_v1";

const DEFAULT_RULES: GameRules = {
  quarterLengthMinutes: 10,
  totalQuarters: 4,
  shotClockDefault: 24,
  foulLimit: 5,
  timingMode: "NBA",
};

export function defaultManagerData(): ManagerData {
  return {
    teams: [],
    players: [],
    games: [],
    tournaments: [],
    defaultRules: DEFAULT_RULES,
    updatedAt: Date.now(),
  };
}

export function loadManagerData(): ManagerData {
  const raw = localStorage.getItem(MANAGER_STORAGE_KEY);
  if (!raw) return defaultManagerData();

  try {
    const parsed = JSON.parse(raw) as Partial<ManagerData>;
    const base = defaultManagerData();
    const normalizedTeams = (parsed.teams ?? base.teams).map((team) => ({
      ...team,
      logoUrl: team.logoUrl ?? "",
      color: team.color ?? "#6B7280",
    }));
    const normalizedRules: GameRules = {
      quarterLengthMinutes: parsed.defaultRules?.quarterLengthMinutes ?? DEFAULT_RULES.quarterLengthMinutes,
      totalQuarters: parsed.defaultRules?.totalQuarters ?? DEFAULT_RULES.totalQuarters,
      shotClockDefault: parsed.defaultRules?.shotClockDefault ?? DEFAULT_RULES.shotClockDefault,
      foulLimit: parsed.defaultRules?.foulLimit ?? DEFAULT_RULES.foulLimit,
      timingMode: parsed.defaultRules?.timingMode ?? DEFAULT_RULES.timingMode,
    };
    const normalizedGames = (parsed.games ?? base.games).map((game) => ({
      ...game,
      finishedAt: game.finishedAt ?? null,
      leaderboard: game.leaderboard ?? [],
      rules: {
        quarterLengthMinutes: game.rules?.quarterLengthMinutes ?? normalizedRules.quarterLengthMinutes,
        totalQuarters: game.rules?.totalQuarters ?? normalizedRules.totalQuarters,
        shotClockDefault: game.rules?.shotClockDefault ?? normalizedRules.shotClockDefault,
        foulLimit: game.rules?.foulLimit ?? normalizedRules.foulLimit,
        timingMode: game.rules?.timingMode ?? normalizedRules.timingMode,
      },
    }));
    const normalizedPlayers = (parsed.players ?? base.players).map((player) => ({
      ...player,
      height: player.height ?? "",
      weight: player.weight ?? "",
      imageUrl: player.imageUrl ?? "",
      hometown: player.hometown ?? "",
    }));
    return {
      teams: normalizedTeams,
      players: normalizedPlayers,
      games: normalizedGames,
      tournaments: parsed.tournaments ?? base.tournaments,
      defaultRules: normalizedRules,
      updatedAt: parsed.updatedAt ?? Date.now(),
    };
  } catch {
    return defaultManagerData();
  }
}

export function saveManagerData(data: ManagerData): void {
  localStorage.setItem(
    MANAGER_STORAGE_KEY,
    JSON.stringify({
      ...data,
      updatedAt: Date.now(),
    }),
  );
}
