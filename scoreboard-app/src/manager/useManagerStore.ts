import { useEffect, useMemo, useReducer } from "react";
import { defaultManagerData, loadManagerData, saveManagerData } from "./storage";
import type {
  Game,
  GameLeaderboardEntry,
  GameRules,
  GameStatus,
  ManagerData,
  Player,
  Team,
  TeamStanding,
  Tournament,
  TournamentFormat,
} from "./types";

type Action =
  | { type: "ADD_TEAM"; name: string; city: string; abbreviation: string; logoUrl: string; color: string }
  | {
      type: "UPDATE_TEAM";
      teamId: string;
      updates: Partial<Pick<Team, "name" | "city" | "abbreviation" | "logoUrl" | "color">>;
    }
  | { type: "DELETE_TEAM"; teamId: string }
  | {
      type: "ADD_PLAYER";
      teamId: string;
      name: string;
      number: number;
      position: string;
      height: string;
      weight: string;
      imageUrl: string;
      hometown: string;
    }
  | {
      type: "UPDATE_PLAYER";
      playerId: string;
      updates: Partial<Pick<Player, "name" | "number" | "position" | "height" | "weight" | "imageUrl" | "hometown">>;
    }
  | { type: "DELETE_PLAYER"; playerId: string }
  | { type: "UPDATE_DEFAULT_RULES"; rules: Partial<GameRules> }
  | {
      type: "SCHEDULE_GAME";
      homeTeamId: string;
      awayTeamId: string;
      scheduledAt: string;
      location: string;
      tournamentId: string | null;
      rules: GameRules;
    }
  | {
      type: "UPDATE_GAME";
      gameId: string;
      status?: GameStatus;
      homeScore?: number;
      awayScore?: number;
      scheduledAt?: string;
      location?: string;
      finishedAt?: number | null;
      leaderboard?: GameLeaderboardEntry[];
    }
  | { type: "DELETE_GAME"; gameId: string }
  | {
      type: "ADD_TOURNAMENT";
      name: string;
      format: TournamentFormat;
      startDate: string;
      teamIds: string[];
    }
  | { type: "GENERATE_TOURNAMENT_GAMES"; tournamentId: string }
  | { type: "DELETE_TOURNAMENT"; tournamentId: string }
  | { type: "HYDRATE"; payload: ManagerData };

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function reducer(state: ManagerData, action: Action): ManagerData {
  switch (action.type) {
    case "ADD_TEAM": {
      const team: Team = {
        id: uid("team"),
        name: action.name,
        city: action.city,
        abbreviation: action.abbreviation,
        logoUrl: action.logoUrl,
        color: action.color,
        createdAt: Date.now(),
      };
      return { ...state, teams: [...state.teams, team] };
    }
    case "UPDATE_TEAM": {
      return {
        ...state,
        teams: state.teams.map((t) =>
          t.id === action.teamId
            ? {
                ...t,
                ...action.updates,
                name: action.updates.name ?? t.name,
                city: action.updates.city ?? t.city,
                abbreviation: action.updates.abbreviation ?? t.abbreviation,
                logoUrl: action.updates.logoUrl ?? t.logoUrl,
                color: action.updates.color ?? t.color,
              }
            : t,
        ),
      };
    }
    case "DELETE_TEAM": {
      return {
        ...state,
        teams: state.teams.filter((t) => t.id !== action.teamId),
        players: state.players.filter((p) => p.teamId !== action.teamId),
        games: state.games.filter((g) => g.homeTeamId !== action.teamId && g.awayTeamId !== action.teamId),
        tournaments: state.tournaments.map((t) => ({
          ...t,
          teamIds: t.teamIds.filter((id) => id !== action.teamId),
        })),
      };
    }
    case "ADD_PLAYER": {
      const player: Player = {
        id: uid("player"),
        teamId: action.teamId,
        name: action.name,
        number: action.number,
        position: action.position,
        height: action.height,
        weight: action.weight,
        imageUrl: action.imageUrl,
        hometown: action.hometown,
        createdAt: Date.now(),
      };
      return { ...state, players: [...state.players, player] };
    }
    case "UPDATE_PLAYER": {
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId
            ? {
                ...p,
                ...action.updates,
                name: action.updates.name ?? p.name,
                number: action.updates.number ?? p.number,
                position: action.updates.position ?? p.position,
                height: action.updates.height ?? p.height,
                weight: action.updates.weight ?? p.weight,
                imageUrl: action.updates.imageUrl ?? p.imageUrl,
                hometown: action.updates.hometown ?? p.hometown,
              }
            : p,
        ),
      };
    }
    case "DELETE_PLAYER": {
      return { ...state, players: state.players.filter((p) => p.id !== action.playerId) };
    }
    case "UPDATE_DEFAULT_RULES": {
      return {
        ...state,
        defaultRules: {
          ...state.defaultRules,
          ...action.rules,
        },
      };
    }
    case "SCHEDULE_GAME": {
      if (action.homeTeamId === action.awayTeamId) return state;
      const game: Game = {
        id: uid("game"),
        homeTeamId: action.homeTeamId,
        awayTeamId: action.awayTeamId,
        scheduledAt: action.scheduledAt,
        location: action.location,
        status: "scheduled",
        homeScore: 0,
        awayScore: 0,
        rules: action.rules,
        tournamentId: action.tournamentId,
        finishedAt: null,
        leaderboard: [],
        createdAt: Date.now(),
      };
      return { ...state, games: [...state.games, game] };
    }
    case "UPDATE_GAME": {
      return {
        ...state,
        games: state.games.map((g) =>
          g.id === action.gameId
            ? {
                ...g,
                status: action.status ?? g.status,
                homeScore: action.homeScore ?? g.homeScore,
                awayScore: action.awayScore ?? g.awayScore,
                scheduledAt: action.scheduledAt ?? g.scheduledAt,
                location: action.location ?? g.location,
                finishedAt: action.finishedAt ?? g.finishedAt,
                leaderboard: action.leaderboard ?? g.leaderboard,
              }
            : g,
        ),
      };
    }
    case "DELETE_GAME": {
      return { ...state, games: state.games.filter((g) => g.id !== action.gameId) };
    }
    case "ADD_TOURNAMENT": {
      const tournament: Tournament = {
        id: uid("tournament"),
        name: action.name,
        format: action.format,
        startDate: action.startDate,
        status: "draft",
        teamIds: [...new Set(action.teamIds)],
        createdAt: Date.now(),
      };
      return { ...state, tournaments: [...state.tournaments, tournament] };
    }
    case "GENERATE_TOURNAMENT_GAMES": {
      const tournament = state.tournaments.find((t) => t.id === action.tournamentId);
      if (!tournament || tournament.teamIds.length < 2) return state;

      const existingGameKey = new Set(
        state.games
          .filter((g) => g.tournamentId === tournament.id)
          .map((g) => `${g.homeTeamId}-${g.awayTeamId}`),
      );

      const newGames: Game[] = [];
      if (tournament.format === "round_robin") {
        for (let i = 0; i < tournament.teamIds.length; i += 1) {
          for (let j = i + 1; j < tournament.teamIds.length; j += 1) {
            const homeTeamId = tournament.teamIds[i];
            const awayTeamId = tournament.teamIds[j];
            const key = `${homeTeamId}-${awayTeamId}`;
            if (existingGameKey.has(key)) continue;

            newGames.push({
              id: uid("game"),
              homeTeamId,
              awayTeamId,
              scheduledAt: tournament.startDate,
              location: `${tournament.name} Arena`,
              status: "scheduled",
              homeScore: 0,
              awayScore: 0,
              rules: state.defaultRules,
              tournamentId: tournament.id,
              finishedAt: null,
              leaderboard: [],
              createdAt: Date.now(),
            });
          }
        }
      } else {
        for (let i = 0; i + 1 < tournament.teamIds.length; i += 2) {
          const homeTeamId = tournament.teamIds[i];
          const awayTeamId = tournament.teamIds[i + 1];
          const key = `${homeTeamId}-${awayTeamId}`;
          if (existingGameKey.has(key)) continue;

          newGames.push({
            id: uid("game"),
            homeTeamId,
            awayTeamId,
            scheduledAt: tournament.startDate,
            location: `${tournament.name} Arena`,
            status: "scheduled",
            homeScore: 0,
            awayScore: 0,
            rules: state.defaultRules,
            tournamentId: tournament.id,
            finishedAt: null,
            leaderboard: [],
            createdAt: Date.now(),
          });
        }
      }

      return {
        ...state,
        games: [...state.games, ...newGames],
        tournaments: state.tournaments.map((t) =>
          t.id === tournament.id ? { ...t, status: "active" } : t,
        ),
      };
    }
    case "DELETE_TOURNAMENT": {
      return {
        ...state,
        tournaments: state.tournaments.filter((t) => t.id !== action.tournamentId),
        games: state.games.map((g) =>
          g.tournamentId === action.tournamentId ? { ...g, tournamentId: null } : g,
        ),
      };
    }
    case "HYDRATE":
      return action.payload;
    default:
      return state;
  }
}

function computeStandings(state: ManagerData): TeamStanding[] {
  const table = new Map<string, TeamStanding>();

  for (const team of state.teams) {
    table.set(team.id, {
      teamId: team.id,
      games: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    });
  }

  for (const game of state.games) {
    if (game.status !== "final") continue;

    const home = table.get(game.homeTeamId);
    const away = table.get(game.awayTeamId);
    if (!home || !away) continue;

    home.games += 1;
    away.games += 1;
    home.pointsFor += game.homeScore;
    home.pointsAgainst += game.awayScore;
    away.pointsFor += game.awayScore;
    away.pointsAgainst += game.homeScore;

    if (game.homeScore > game.awayScore) {
      home.wins += 1;
      away.losses += 1;
    } else if (game.awayScore > game.homeScore) {
      away.wins += 1;
      home.losses += 1;
    }
  }

  return [...table.values()].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    const diffA = a.pointsFor - a.pointsAgainst;
    const diffB = b.pointsFor - b.pointsAgainst;
    if (diffB !== diffA) return diffB - diffA;
    return b.pointsFor - a.pointsFor;
  });
}

export function useManagerStore() {
  const [state, dispatch] = useReducer(reducer, undefined, loadManagerData);

  useEffect(() => {
    saveManagerData(state);
  }, [state]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key !== "game_manager_data_v1" || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue) as ManagerData;
        if ((parsed.updatedAt ?? 0) <= state.updatedAt) return;
        dispatch({ type: "HYDRATE", payload: { ...defaultManagerData(), ...parsed } });
      } catch {
        // no-op
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [state.updatedAt]);

  const standings = useMemo(() => computeStandings(state), [state]);

  const helpers = useMemo(
    () => ({
      teamName: (teamId: string) => state.teams.find((t) => t.id === teamId)?.name ?? "Unknown",
      playersForTeam: (teamId: string) => state.players.filter((p) => p.teamId === teamId),
      tournamentName: (tournamentId: string | null) =>
        tournamentId ? state.tournaments.find((t) => t.id === tournamentId)?.name ?? "Unknown" : "-",
    }),
    [state.players, state.teams, state.tournaments],
  );

  return { state, dispatch, standings, helpers };
}
