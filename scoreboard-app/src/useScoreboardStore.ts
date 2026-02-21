import type { Dispatch } from "react";
import { useEffect, useMemo, useReducer, useRef } from "react";
import { COMMAND_KEY } from "./constants";
import { loadLatestPayload, parsePayload, savePayload } from "./storage";
import type { Command, PersistedPayload, PlayerState } from "./types";

interface LoadGameTeamInput {
  name: string;
  color?: string;
  logoUrl?: string;
  players: Array<{ name: string; number: number; imageUrl?: string }>;
}

interface LoadGameRulesInput {
  quarterLengthMinutes?: number;
  totalQuarters?: number;
  shotClockDefault?: number;
  foulLimit?: number;
  timingMode?: "NBA" | "FIBA";
}

export type ScoreboardAction =
  | { type: "ADD_POINTS"; team: "A" | "B"; points: number; playerId?: string }
  | { type: "ADD_FAST_BREAK_POINTS"; team: "A" | "B"; points: number }
  | { type: "SET_TEAM_NAME"; team: "A" | "B"; name: string }
  | { type: "SET_TEAM_COLOR"; team: "A" | "B"; color: string }
  | { type: "SET_TEAM_LOGO"; team: "A" | "B"; logoUrl: string }
  | { type: "LOAD_GAME"; home: LoadGameTeamInput; away: LoadGameTeamInput; rules?: LoadGameRulesInput }
  | { type: "SET_POSSESSION"; team: "A" | "B" }
  | { type: "START_GAME" }
  | { type: "STOP_GAME" }
  | { type: "FINISH_GAME" }
  | { type: "START_SHOT" }
  | { type: "STOP_SHOT" }
  | { type: "RESET_QUARTER" }
  | { type: "PREV_QUARTER" }
  | { type: "NEXT_QUARTER" }
  | { type: "RESET_SHOT"; seconds: number }
  | { type: "INC_FOUL"; team: "A" | "B" }
  | { type: "USE_TIMEOUT"; team: "A" | "B" }
  | { type: "OPEN_TIMEOUT"; team: "A" | "B"; seconds: number }
  | { type: "START_HALFTIME"; minutes: number }
  | { type: "END_OVERLAY"; manual?: boolean }
  | { type: "SHOW_TV_STAR_PLAYER"; team: "A" | "B"; playerId: string }
  | { type: "DISMISS_TV_STAR_PLAYER" }
  | {
      type: "INC_PLAYER_STAT";
      team: "A" | "B";
      playerId: string;
      stat: "reb" | "ast" | "stl" | "blk" | "fls";
      amount?: number;
    }
  | { type: "SET_PLAYER_ON_COURT"; team: "A" | "B"; playerId: string; onCourt: boolean }
  | { type: "SUBSTITUTE_PLAYER"; team: "A" | "B"; playerOutId: string; playerInId: string }
  | { type: "ADD_PLAYER"; team: "A" | "B"; name: string; number: number; onCourt: boolean }
  | {
      type: "UPDATE_PLAYER";
      team: "A" | "B";
      playerId: string;
      updates: Partial<Pick<PlayerState, "name" | "number" | "onCourt">>;
    }
  | { type: "DELETE_PLAYER"; team: "A" | "B"; playerId: string }
  | { type: "ADD_LOG"; text: string }
  | { type: "TICK" }
  | { type: "HYDRATE"; payload: PersistedPayload };

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function teamStateKey(team: "A" | "B"): "teamA" | "teamB" {
  return team === "A" ? "teamA" : "teamB";
}

function buildLivePlayers(team: "A" | "B", players: Array<{ name: string; number: number; imageUrl?: string }>): PlayerState[] {
  const safe = players.length
    ? players
    : [
        { name: `Player ${team}1`, number: 1 },
        { name: `Player ${team}2`, number: 2 },
        { name: `Player ${team}3`, number: 3 },
        { name: `Player ${team}4`, number: 4 },
        { name: `Player ${team}5`, number: 5 },
      ];

  return safe.map((p, idx) => ({
    id: `${team}-${Date.now()}-${idx}`,
    number: p.number,
    name: p.name,
    imageUrl: p.imageUrl ?? "",
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

function withActionLog(payload: PersistedPayload, text: string): PersistedPayload {
  const ts = `[Q${payload.state.quarter} - ${formatClock(payload.state.gameClockSeconds)}]`;
  return {
    ...payload,
    actionLog: [`${ts} ${text}`, ...payload.actionLog].slice(0, 250),
  };
}

function recalcTeamFouls(payload: PersistedPayload, team: "A" | "B"): PersistedPayload {
  const teamKey = teamStateKey(team);
  const total = payload.players[team].reduce((sum, p) => sum + (p.fls || 0), 0);
  return {
    ...payload,
    state: {
      ...payload.state,
      [teamKey]: {
        ...payload.state[teamKey],
        fouls: total,
      },
    },
  };
}

const HIGHLIGHT_COOLDOWN_SECONDS = 22;
const PLAYER_HIGHLIGHT_SECONDS = 10;
const TEAM_HIGHLIGHT_SECONDS = 10;
const POINTS_MILESTONES = [10, 15, 20, 25, 30, 35, 40];
const REB_MILESTONES = [8, 10, 12, 15, 18, 20];
const STL_MILESTONES = [3, 4, 5, 6];
const BLK_MILESTONES = [3, 4, 5, 6];
const TPM_MILESTONES = [3, 4, 5, 6, 7, 8];

function highestMilestone(value: number, milestones: number[]): number {
  let result = 0;
  for (const m of milestones) {
    if (value >= m) result = m;
  }
  return result;
}

function allPlayers(payload: PersistedPayload): PlayerState[] {
  return [...payload.players.A, ...payload.players.B];
}

function canAutoHighlight(payload: PersistedPayload): boolean {
  const state = payload.state;
  return !state.tvStarPlayer && !state.tvTeamComparison && state.tvAutoCooldownSeconds <= 0;
}

function markSeen(state: PersistedPayload["state"], key: string): PersistedPayload["state"] {
  return {
    ...state,
    tvAutoSeen: [key, ...state.tvAutoSeen.filter((item) => item !== key)].slice(0, 400),
  };
}

function showAutoPlayerHighlight(
  payload: PersistedPayload,
  team: "A" | "B",
  playerId: string,
  reason: string,
  key: string,
): PersistedPayload {
  if (!canAutoHighlight(payload)) return payload;
  if (payload.state.tvAutoSeen.includes(key)) return payload;
  const player = payload.players[team].find((p) => p.id === playerId);
  if (!player) return payload;
  const teamName = team === "A" ? payload.state.teamA.name : payload.state.teamB.name;
  return withActionLog(
    {
      ...payload,
      state: {
        ...markSeen(payload.state, key),
        tvAutoCooldownSeconds: HIGHLIGHT_COOLDOWN_SECONDS,
        tvStarPlayer: {
          team,
          playerId,
          remainingSeconds: PLAYER_HIGHLIGHT_SECONDS,
          reason,
          auto: true,
        },
        tvTeamComparison: null,
      },
    },
    `TV Auto Highlight: ${player.name} #${player.number} (${teamName}) - ${reason}`,
  );
}

function totalTeamRebounds(payload: PersistedPayload, team: "A" | "B"): number {
  return payload.players[team].reduce((sum, p) => sum + p.reb, 0);
}

function maybeAutoTeamComparison(payload: PersistedPayload): PersistedPayload {
  if (!canAutoHighlight(payload)) return payload;

  const rebA = totalTeamRebounds(payload, "A");
  const rebB = totalTeamRebounds(payload, "B");
  const rebDiff = Math.abs(rebA - rebB);
  const rebLeader: "A" | "B" | null = rebA === rebB ? null : rebA > rebB ? "A" : "B";

  if (rebLeader && rebDiff >= 6 && rebA + rebB >= 18) {
    const bucket = Math.floor(rebDiff / 3) * 3;
    const key = `team:rebounds:${rebLeader}:${bucket}`;
    if (!payload.state.tvAutoSeen.includes(key)) {
      const leaderName = rebLeader === "A" ? payload.state.teamA.name : payload.state.teamB.name;
      return withActionLog(
        {
          ...payload,
          state: {
            ...markSeen(payload.state, key),
            tvAutoCooldownSeconds: HIGHLIGHT_COOLDOWN_SECONDS,
            tvStarPlayer: null,
            tvTeamComparison: {
              metric: "rebounds",
              teamAValue: rebA,
              teamBValue: rebB,
              leadingTeam: rebLeader,
              remainingSeconds: TEAM_HIGHLIGHT_SECONDS,
            },
          },
        },
        `TV Auto Team Comparison: Rebounds edge for ${leaderName}`,
      );
    }
  }

  const fbA = payload.state.teamA.fastBreakPoints;
  const fbB = payload.state.teamB.fastBreakPoints;
  const fbDiff = Math.abs(fbA - fbB);
  const fbLeader: "A" | "B" | null = fbA === fbB ? null : fbA > fbB ? "A" : "B";
  if (fbLeader && fbDiff >= 4 && fbA + fbB >= 8) {
    const bucket = Math.floor(fbDiff / 2) * 2;
    const key = `team:fastBreakPoints:${fbLeader}:${bucket}`;
    if (!payload.state.tvAutoSeen.includes(key)) {
      const leaderName = fbLeader === "A" ? payload.state.teamA.name : payload.state.teamB.name;
      return withActionLog(
        {
          ...payload,
          state: {
            ...markSeen(payload.state, key),
            tvAutoCooldownSeconds: HIGHLIGHT_COOLDOWN_SECONDS,
            tvStarPlayer: null,
            tvTeamComparison: {
              metric: "fastBreakPoints",
              teamAValue: fbA,
              teamBValue: fbB,
              leadingTeam: fbLeader,
              remainingSeconds: TEAM_HIGHLIGHT_SECONDS,
            },
          },
        },
        `TV Auto Team Comparison: Fast break edge for ${leaderName}`,
      );
    }
  }

  return payload;
}

function maybeAutoPlayerHighlight(payload: PersistedPayload, team: "A" | "B", playerId: string): PersistedPayload {
  const player = payload.players[team].find((p) => p.id === playerId);
  if (!player) return payload;
  const everyone = allPlayers(payload);
  const maxPts = everyone.reduce((max, p) => Math.max(max, p.pts), 0);
  const maxReb = everyone.reduce((max, p) => Math.max(max, p.reb), 0);
  const maxStl = everyone.reduce((max, p) => Math.max(max, p.stl), 0);
  const maxBlk = everyone.reduce((max, p) => Math.max(max, p.blk), 0);
  const maxTpm = everyone.reduce((max, p) => Math.max(max, p.tpm), 0);

  const ptsMilestone = highestMilestone(player.pts, POINTS_MILESTONES);
  if (ptsMilestone > 0 && player.pts === maxPts) {
    const key = `player:${team}:${player.id}:pts:${ptsMilestone}`;
    const next = showAutoPlayerHighlight(payload, team, playerId, `High Scorer ${player.pts} PTS`, key);
    if (next !== payload) return next;
  }

  const rebMilestone = highestMilestone(player.reb, REB_MILESTONES);
  if (rebMilestone > 0 && player.reb === maxReb) {
    const key = `player:${team}:${player.id}:reb:${rebMilestone}`;
    const next = showAutoPlayerHighlight(payload, team, playerId, `Top Rebounder ${player.reb} REB`, key);
    if (next !== payload) return next;
  }

  const stlMilestone = highestMilestone(player.stl, STL_MILESTONES);
  if (stlMilestone > 0 && player.stl === maxStl) {
    const key = `player:${team}:${player.id}:stl:${stlMilestone}`;
    const next = showAutoPlayerHighlight(payload, team, playerId, `Steals Impact ${player.stl} STL`, key);
    if (next !== payload) return next;
  }

  const blkMilestone = highestMilestone(player.blk, BLK_MILESTONES);
  if (blkMilestone > 0 && player.blk === maxBlk) {
    const key = `player:${team}:${player.id}:blk:${blkMilestone}`;
    const next = showAutoPlayerHighlight(payload, team, playerId, `Rim Protection ${player.blk} BLK`, key);
    if (next !== payload) return next;
  }

  const tpmMilestone = highestMilestone(player.tpm, TPM_MILESTONES);
  if (tpmMilestone > 0 && player.tpm === maxTpm) {
    const key = `player:${team}:${player.id}:tpm:${tpmMilestone}`;
    const next = showAutoPlayerHighlight(payload, team, playerId, `Deep Range ${player.tpm} 3PM`, key);
    if (next !== payload) return next;
  }

  return payload;
}

function setPossession(payload: PersistedPayload, team: "A" | "B"): PersistedPayload {
  const shouldRunShot = payload.state.gameClockRunning && !payload.state.shotViolation;
  return {
    ...payload,
    state: {
      ...payload.state,
      possession: team,
      shotClockSeconds: payload.state.shotClockDefault,
      shotViolation: false,
      shotClockRunning: shouldRunShot,
    },
  };
}

function resetQuarter(payload: PersistedPayload): PersistedPayload {
  return {
    ...payload,
    state: {
      ...payload.state,
      gameClockSeconds: payload.state.quarterLengthMinutes * 60,
      shotClockSeconds: payload.state.shotClockDefault,
      gameClockRunning: false,
      shotClockRunning: false,
      shotViolation: false,
      gameFinal: false,
      overlayMode: null,
      overlayLabel: "",
      overlayRemainingSeconds: 0,
      overlayResumeGame: false,
      tvAutoCooldownSeconds: 0,
      tvAutoSeen: payload.state.tvAutoSeen,
      tvStarPlayer: null,
      tvTeamComparison: null,
    },
  };
}

function beginOverlay(
  payload: PersistedPayload,
  mode: "timeout" | "halftime",
  label: string,
  seconds: number,
): PersistedPayload {
  return {
    ...payload,
    state: {
      ...payload.state,
      gameClockRunning: false,
      shotClockRunning: false,
      overlayMode: mode,
      overlayLabel: label.toUpperCase(),
      overlayRemainingSeconds: Math.max(0, seconds),
      overlayResumeGame: payload.state.gameClockRunning,
    },
  };
}

function endOverlay(payload: PersistedPayload): PersistedPayload {
  const mode = payload.state.overlayMode;
  if (!mode) return payload;

  let nextPayload: PersistedPayload = {
    ...payload,
    state: {
      ...payload.state,
      overlayMode: null,
      overlayLabel: "",
      overlayRemainingSeconds: 0,
      overlayResumeGame: false,
    },
  };

  if (mode === "halftime") {
    if (nextPayload.state.quarter === 2 && nextPayload.state.totalQuarters >= 3) {
      nextPayload = {
        ...nextPayload,
        state: {
          ...nextPayload.state,
          quarter: 3,
          gameClockSeconds: nextPayload.state.quarterLengthMinutes * 60,
          shotClockSeconds: nextPayload.state.shotClockDefault,
          possession: "A",
          shotViolation: false,
        },
      };
    }
    return withActionLog(nextPayload, "Halftime ended.");
  }

  if (mode === "timeout") {
    const resume = payload.state.overlayResumeGame;
    nextPayload = {
      ...nextPayload,
      state: {
        ...nextPayload.state,
        gameClockRunning: resume,
        shotClockRunning: resume,
      },
    };
    return withActionLog(nextPayload, "Timeout ended.");
  }

  return nextPayload;
}

function reducer(payload: PersistedPayload, action: ScoreboardAction): PersistedPayload {
  switch (action.type) {
    case "ADD_POINTS": {
      if (payload.state.gameFinal) return payload;
      if (!action.points) return payload;

      const teamKey = teamStateKey(action.team);
      const nextScore = Math.max(0, payload.state[teamKey].score + action.points);
      let nextPayload: PersistedPayload = {
        ...payload,
        state: {
          ...payload.state,
          [teamKey]: {
            ...payload.state[teamKey],
            score: nextScore,
          },
        },
      };

      if (action.playerId) {
        nextPayload = {
          ...nextPayload,
          players: {
            ...nextPayload.players,
            [action.team]: nextPayload.players[action.team].map((p) =>
              p.id === action.playerId
                ? { ...p, pts: p.pts + action.points, tpm: p.tpm + (action.points === 3 ? 1 : 0) }
                : p,
            ),
          },
        };
      }

      if (action.points > 0) {
        const teamName = nextPayload.state[teamKey].name;
        const player = action.playerId
          ? nextPayload.players[action.team].find((p) => p.id === action.playerId)
          : null;

        if (player) {
          nextPayload = withActionLog(
            nextPayload,
            `${player.name} #${player.number} hits ${action.points} for ${teamName} (${player.pts} pts)`,
          );
        } else {
          nextPayload = withActionLog(
            nextPayload,
            `${teamName} scores ${action.points} point${action.points === 1 ? "" : "s"}.`,
          );
        }

        nextPayload = setPossession(nextPayload, action.team === "A" ? "B" : "A");

        if (nextPayload.state.timingMode === "NBA" && nextPayload.state.gameClockRunning) {
          nextPayload = {
            ...nextPayload,
            state: {
              ...nextPayload.state,
              gameClockRunning: false,
              shotClockRunning: false,
            },
          };
        }
      }

      if (action.playerId) {
        nextPayload = maybeAutoPlayerHighlight(nextPayload, action.team, action.playerId);
      }
      nextPayload = maybeAutoTeamComparison(nextPayload);

      return nextPayload;
    }
    case "ADD_FAST_BREAK_POINTS": {
      if (payload.state.gameFinal) return payload;
      if (!action.points) return payload;
      const key = teamStateKey(action.team);
      const teamName = payload.state[key].name;
      let nextPayload: PersistedPayload = {
        ...payload,
        state: {
          ...payload.state,
          [key]: {
            ...payload.state[key],
            score: payload.state[key].score + action.points,
            fastBreakPoints: payload.state[key].fastBreakPoints + action.points,
          },
        },
      };
      nextPayload = withActionLog(nextPayload, `${teamName} fast break +${action.points}`);
      nextPayload = setPossession(nextPayload, action.team === "A" ? "B" : "A");
      nextPayload = maybeAutoTeamComparison(nextPayload);
      return nextPayload;
    }
    case "SET_TEAM_NAME": {
      const key = teamStateKey(action.team);
      return {
        ...payload,
        state: {
          ...payload.state,
          [key]: {
            ...payload.state[key],
            name: action.name || (action.team === "A" ? "Home" : "Away"),
          },
        },
      };
    }
    case "SET_TEAM_COLOR": {
      const key = teamStateKey(action.team);
      return {
        ...payload,
        state: {
          ...payload.state,
          [key]: {
            ...payload.state[key],
            color: action.color,
          },
        },
      };
    }
    case "SET_TEAM_LOGO": {
      const key = teamStateKey(action.team);
      return {
        ...payload,
        state: {
          ...payload.state,
          [key]: {
            ...payload.state[key],
            logoUrl: action.logoUrl,
          },
        },
      };
    }
    case "LOAD_GAME": {
      const nextQuarterLength = action.rules?.quarterLengthMinutes ?? payload.state.quarterLengthMinutes;
      const nextTotalQuarters = action.rules?.totalQuarters ?? payload.state.totalQuarters;
      const nextShotClockDefault = action.rules?.shotClockDefault ?? payload.state.shotClockDefault;
      const nextFoulLimit = action.rules?.foulLimit ?? payload.state.foulLimit;
      const nextTimingMode = action.rules?.timingMode ?? payload.state.timingMode;
      const quarterSeconds = nextQuarterLength * 60;
      return {
        ...payload,
        state: {
          ...payload.state,
          teamA: {
            ...payload.state.teamA,
            name: action.home.name,
            score: 0,
            fouls: 0,
            timeouts: 3,
            fastBreakPoints: 0,
            color: action.home.color ?? payload.state.teamA.color,
            logoUrl: action.home.logoUrl ?? "",
          },
          teamB: {
            ...payload.state.teamB,
            name: action.away.name,
            score: 0,
            fouls: 0,
            timeouts: 3,
            fastBreakPoints: 0,
            color: action.away.color ?? payload.state.teamB.color,
            logoUrl: action.away.logoUrl ?? "",
          },
          possession: "A",
          quarter: 1,
          totalQuarters: nextTotalQuarters,
          quarterLengthMinutes: nextQuarterLength,
          foulLimit: nextFoulLimit,
          shotClockDefault: nextShotClockDefault,
          gameClockSeconds: quarterSeconds,
          shotClockSeconds: nextShotClockDefault,
          gameClockRunning: false,
          shotClockRunning: false,
          timingMode: nextTimingMode,
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
        },
        players: {
          A: buildLivePlayers("A", action.home.players),
          B: buildLivePlayers("B", action.away.players),
        },
        actionLog: [
          `[Q1 - ${formatClock(quarterSeconds)}] New game loaded: ${action.home.name} vs ${action.away.name}`,
        ],
      };
    }
    case "SET_POSSESSION":
      return setPossession(payload, action.team);
    case "START_GAME":
      if (payload.state.overlayMode) return payload;
      return {
        ...payload,
        state: { ...payload.state, gameClockRunning: true, shotClockRunning: true, gameFinal: false },
      };
    case "STOP_GAME":
      return {
        ...payload,
        state: { ...payload.state, gameClockRunning: false, shotClockRunning: false },
      };
    case "FINISH_GAME":
      return {
        ...payload,
        state: {
          ...payload.state,
          gameClockRunning: false,
          shotClockRunning: false,
          gameFinal: true,
          overlayMode: null,
          overlayLabel: "",
          overlayRemainingSeconds: 0,
          overlayResumeGame: false,
          tvStarPlayer: null,
          tvTeamComparison: null,
        },
      };
    case "START_SHOT":
      if (payload.state.overlayMode) return payload;
      return { ...payload, state: { ...payload.state, shotClockRunning: true } };
    case "STOP_SHOT":
      return { ...payload, state: { ...payload.state, shotClockRunning: false } };
    case "RESET_QUARTER":
      return resetQuarter(payload);
    case "PREV_QUARTER": {
      const prevQuarter = Math.max(1, payload.state.quarter - 1);
      return resetQuarter({
        ...payload,
        state: {
          ...payload.state,
          quarter: prevQuarter,
        },
      });
    }
    case "NEXT_QUARTER": {
      const nextQuarter = Math.min(payload.state.totalQuarters, payload.state.quarter + 1);
      return resetQuarter({
        ...payload,
        state: {
          ...payload.state,
          quarter: nextQuarter,
        },
      });
    }
    case "RESET_SHOT":
      return {
        ...payload,
        state: {
          ...payload.state,
          shotClockSeconds: action.seconds,
          shotClockRunning: false,
          shotViolation: false,
        },
      };
    case "INC_FOUL": {
      const key = teamStateKey(action.team);
      return {
        ...payload,
        state: {
          ...payload.state,
          [key]: {
            ...payload.state[key],
            fouls: payload.state[key].fouls + 1,
          },
        },
      };
    }
    case "USE_TIMEOUT": {
      return reducer(payload, { type: "OPEN_TIMEOUT", team: action.team, seconds: 60 });
    }
    case "OPEN_TIMEOUT": {
      const teamKey = teamStateKey(action.team);
      const teamName = payload.state[teamKey].name;
      const label = `${teamName} Timeout`;
      let nextPayload = beginOverlay(payload, "timeout", label, action.seconds);
      nextPayload = {
        ...nextPayload,
        state: {
          ...nextPayload.state,
          [teamKey]: {
            ...nextPayload.state[teamKey],
            timeouts: Math.max(0, nextPayload.state[teamKey].timeouts - 1),
          },
        },
      };
      nextPayload = withActionLog(
        nextPayload,
        `${teamName} takes a ${action.seconds === 30 ? "30-second" : "full"} timeout`,
      );
      return nextPayload;
    }
    case "START_HALFTIME": {
      const minutes = Math.max(1, Math.floor(action.minutes));
      let nextPayload = withActionLog(payload, `Halftime begins (${minutes} minutes)`);
      nextPayload = beginOverlay(nextPayload, "halftime", "Halftime", minutes * 60);
      return nextPayload;
    }
    case "END_OVERLAY": {
      return endOverlay(payload);
    }
    case "SHOW_TV_STAR_PLAYER": {
      const player = payload.players[action.team].find((p) => p.id === action.playerId);
      if (!player) return payload;
      const teamName = action.team === "A" ? payload.state.teamA.name : payload.state.teamB.name;
      return withActionLog(
        {
          ...payload,
          state: {
            ...payload.state,
            tvStarPlayer: {
              team: action.team,
              playerId: action.playerId,
              remainingSeconds: 10,
              reason: "Star Player",
              auto: false,
            },
            tvTeamComparison: null,
          },
        },
        `TV Star Player: ${player.name} #${player.number} (${teamName})`,
      );
    }
    case "DISMISS_TV_STAR_PLAYER":
      return {
        ...payload,
        state: {
          ...payload.state,
          tvStarPlayer: null,
          tvTeamComparison: null,
        },
      };
    case "INC_PLAYER_STAT": {
      const amount = action.amount ?? 1;
      let fouledOutPlayerName = "";

      let nextPayload: PersistedPayload = {
        ...payload,
        players: {
          ...payload.players,
          [action.team]: payload.players[action.team].map((p) => {
            if (p.id !== action.playerId || p.fouledOut) return p;
            const next = {
              ...p,
              [action.stat]: Math.max(0, (p[action.stat] as number) + amount),
            };

            if (action.stat === "fls" && next.fls >= payload.state.foulLimit) {
              fouledOutPlayerName = `${next.name} #${next.number}`;
              return { ...next, fouledOut: true, onCourt: false };
            }

            return next;
          }),
        },
      };

      if (action.stat === "fls") {
        nextPayload = recalcTeamFouls(nextPayload, action.team);
      }

      const player = nextPayload.players[action.team].find((p) => p.id === action.playerId);
      if (player && action.stat !== "fls") {
        nextPayload = withActionLog(nextPayload, `${player.name} #${player.number} +${action.stat.toUpperCase()}`);
      }

      if (fouledOutPlayerName) {
        nextPayload = withActionLog(nextPayload, `${fouledOutPlayerName} fouled out.`);
      }

      nextPayload = maybeAutoPlayerHighlight(nextPayload, action.team, action.playerId);
      nextPayload = maybeAutoTeamComparison(nextPayload);

      return nextPayload;
    }
    case "SET_PLAYER_ON_COURT": {
      const list = payload.players[action.team];
      const onCourtCount = list.filter((p) => p.onCourt).length;
      const target = list.find((p) => p.id === action.playerId);
      if (!target || target.fouledOut) return payload;
      if (action.onCourt && !target.onCourt && onCourtCount >= 5) return payload;

      return {
        ...payload,
        players: {
          ...payload.players,
          [action.team]: list.map((p) =>
            p.id === action.playerId ? { ...p, onCourt: action.onCourt } : p,
          ),
        },
      };
    }
    case "SUBSTITUTE_PLAYER": {
      const list = payload.players[action.team];
      const playerOut = list.find((p) => p.id === action.playerOutId);
      const playerIn = list.find((p) => p.id === action.playerInId);
      if (!playerOut || !playerIn || !playerOut.onCourt || playerIn.onCourt || playerIn.fouledOut) {
        return payload;
      }

      let nextPayload: PersistedPayload = {
        ...payload,
        players: {
          ...payload.players,
          [action.team]: list.map((p) => {
            if (p.id === action.playerOutId) return { ...p, onCourt: false };
            if (p.id === action.playerInId) return { ...p, onCourt: true };
            return p;
          }),
        },
      };

      nextPayload = withActionLog(
        nextPayload,
        `${playerOut.name} #${playerOut.number} subbed out for ${playerIn.name} #${playerIn.number}.`,
      );

      return nextPayload;
    }
    case "ADD_PLAYER": {
      const addOnCourt = action.onCourt && payload.players[action.team].filter((p) => p.onCourt).length < 5;
      return {
        ...payload,
        players: {
          ...payload.players,
          [action.team]: [
            ...payload.players[action.team],
            {
              id: `${action.team}-${Date.now()}`,
              number: Number.isFinite(action.number) ? action.number : 0,
              name: action.name,
              pts: 0,
              reb: 0,
              ast: 0,
              stl: 0,
              blk: 0,
              tpm: 0,
              fls: 0,
              secondsPlayed: 0,
              onCourt: addOnCourt,
              fouledOut: false,
            },
          ],
        },
      };
    }
    case "UPDATE_PLAYER": {
      const list = payload.players[action.team];
      const target = list.find((p) => p.id === action.playerId);
      if (!target) return payload;

      const wantsOnCourt = action.updates.onCourt === true && !target.onCourt;
      const onCourtCount = list.filter((p) => p.onCourt).length;
      if (wantsOnCourt && onCourtCount >= 5) return payload;

      const nextPayload: PersistedPayload = {
        ...payload,
        players: {
          ...payload.players,
          [action.team]: list.map((p) =>
            p.id === action.playerId
              ? {
                  ...p,
                  ...action.updates,
                  name: action.updates.name ?? p.name,
                  number: action.updates.number ?? p.number,
                  onCourt: action.updates.onCourt ?? p.onCourt,
                }
              : p,
          ),
        },
      };

      return recalcTeamFouls(nextPayload, action.team);
    }
    case "DELETE_PLAYER": {
      const nextPayload = {
        ...payload,
        players: {
          ...payload.players,
          [action.team]: payload.players[action.team].filter((p) => p.id !== action.playerId),
        },
      };

      return recalcTeamFouls(nextPayload, action.team);
    }
    case "ADD_LOG":
      return withActionLog(payload, action.text);
    case "TICK": {
      const state = payload.state;
      const nextAutoCooldownSeconds = Math.max(0, state.tvAutoCooldownSeconds - 1);
      const nextTvStarPlayer = state.tvStarPlayer
        ? state.tvStarPlayer.remainingSeconds <= 1
          ? null
          : {
              ...state.tvStarPlayer,
              remainingSeconds: state.tvStarPlayer.remainingSeconds - 1,
            }
        : null;
      const nextTvTeamComparison = state.tvTeamComparison
        ? state.tvTeamComparison.remainingSeconds <= 1
          ? null
          : {
              ...state.tvTeamComparison,
              remainingSeconds: state.tvTeamComparison.remainingSeconds - 1,
            }
        : null;

      if (state.overlayMode) {
        const nextRemaining = Math.max(0, state.overlayRemainingSeconds - 1);
        const nextPayload = {
          ...payload,
          state: {
            ...state,
            overlayRemainingSeconds: nextRemaining,
            tvAutoCooldownSeconds: nextAutoCooldownSeconds,
            tvStarPlayer: nextTvStarPlayer,
            tvTeamComparison: nextTvTeamComparison,
          },
        };

        if (nextRemaining <= 0) {
          return endOverlay(nextPayload);
        }
        return nextPayload;
      }

      const gameNext = state.gameClockRunning ? Math.max(0, state.gameClockSeconds - 1) : state.gameClockSeconds;
      const shotNext = state.shotClockRunning ? Math.max(0, state.shotClockSeconds - 1) : state.shotClockSeconds;

      const reachedQuarterEnd = state.gameClockRunning && gameNext === 0;
      let nextState = {
        ...state,
        gameClockSeconds: gameNext,
        shotClockSeconds: shotNext,
        gameClockRunning: gameNext > 0 ? state.gameClockRunning : false,
        shotClockRunning: gameNext > 0 && shotNext > 0 ? state.shotClockRunning : false,
        shotViolation: shotNext === 0 ? true : state.shotViolation,
        tvAutoCooldownSeconds: nextAutoCooldownSeconds,
        tvStarPlayer: nextTvStarPlayer,
        tvTeamComparison: nextTvTeamComparison,
      };

      let nextActionLog = payload.actionLog;
      if (reachedQuarterEnd && state.quarter < state.totalQuarters) {
        const advancedQuarter = state.quarter + 1;
        nextState = {
          ...nextState,
          quarter: advancedQuarter,
          gameClockSeconds: state.quarterLengthMinutes * 60,
          shotClockSeconds: state.shotClockDefault,
          gameClockRunning: false,
          shotClockRunning: false,
          shotViolation: false,
        };
        nextActionLog = withActionLog(
          { ...payload, state: nextState },
          `Quarter ended. Advanced to Q${advancedQuarter}.`,
        ).actionLog;
      } else if (reachedQuarterEnd && state.quarter >= state.totalQuarters) {
        nextState = {
          ...nextState,
          gameFinal: true,
        };
        nextActionLog = withActionLog(
          { ...payload, state: nextState },
          "Final buzzer.",
        ).actionLog;
      }

      const nextPlayers = state.gameClockRunning
        ? {
            A: payload.players.A.map((p) => (p.onCourt ? { ...p, secondsPlayed: p.secondsPlayed + 1 } : p)),
            B: payload.players.B.map((p) => (p.onCourt ? { ...p, secondsPlayed: p.secondsPlayed + 1 } : p)),
          }
        : payload.players;

      return {
        ...payload,
        state: nextState,
        players: nextPlayers,
        actionLog: nextActionLog,
      };
    }
    case "HYDRATE":
      return action.payload;
    default:
      return payload;
  }
}

function applyCommand(command: Command, dispatch: Dispatch<ScoreboardAction>): void {
  switch (command) {
    case "startGame":
      dispatch({ type: "START_GAME" });
      break;
    case "stopGame":
      dispatch({ type: "STOP_GAME" });
      break;
    case "resetQuarter":
      dispatch({ type: "RESET_QUARTER" });
      break;
    case "nextQuarter":
      dispatch({ type: "NEXT_QUARTER" });
      break;
    case "startShot":
      dispatch({ type: "START_SHOT" });
      break;
    case "stopShot":
      dispatch({ type: "STOP_SHOT" });
      break;
    case "reset24":
      dispatch({ type: "RESET_SHOT", seconds: 24 });
      break;
    case "reset14":
      dispatch({ type: "RESET_SHOT", seconds: 14 });
      break;
    case "possessionA":
      dispatch({ type: "SET_POSSESSION", team: "A" });
      break;
    case "possessionB":
      dispatch({ type: "SET_POSSESSION", team: "B" });
      break;
    case "foulA":
      dispatch({ type: "INC_FOUL", team: "A" });
      break;
    case "foulB":
      dispatch({ type: "INC_FOUL", team: "B" });
      break;
    case "timeoutA":
      dispatch({ type: "OPEN_TIMEOUT", team: "A", seconds: 60 });
      break;
    case "timeoutB":
      dispatch({ type: "OPEN_TIMEOUT", team: "B", seconds: 60 });
      break;
  }
}

const TICK_OWNER_KEY = "scoreboard_tick_owner_v1";
const TICK_OWNER_STALE_MS = 2200;

interface TickOwnerRecord {
  id: string;
  ts: number;
}

function readTickOwner(): TickOwnerRecord | null {
  const raw = localStorage.getItem(TICK_OWNER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TickOwnerRecord;
    if (!parsed || typeof parsed.id !== "string" || typeof parsed.ts !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeTickOwner(record: TickOwnerRecord): void {
  localStorage.setItem(TICK_OWNER_KEY, JSON.stringify(record));
}

export function useScoreboardStore() {
  const [payload, dispatch] = useReducer(reducer, undefined, loadLatestPayload);
  const tabIdRef = useRef<string>(`${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);

  useEffect(() => {
    savePayload(payload);
  }, [payload]);

  useEffect(() => {
    const tabId = tabIdRef.current;

    const heartbeat = window.setInterval(() => {
      const now = Date.now();
      const owner = readTickOwner();
      const isStale = !owner || now - owner.ts > TICK_OWNER_STALE_MS;
      const isOwner = owner?.id === tabId;

      if (isStale || isOwner) {
        writeTickOwner({ id: tabId, ts: now });
        dispatch({ type: "TICK" });
      }
    }, 1000);

    return () => {
      window.clearInterval(heartbeat);
      const owner = readTickOwner();
      if (owner?.id === tabId) {
        localStorage.removeItem(TICK_OWNER_KEY);
      }
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const tabId = tabIdRef.current;
      const owner = readTickOwner();
      if (!owner) return;
      if (Date.now() - owner.ts > TICK_OWNER_STALE_MS) return;
      if (owner.id !== tabId) return;

      const command = localStorage.getItem(COMMAND_KEY) as Command | null;
      if (!command) return;
      localStorage.removeItem(COMMAND_KEY);
      applyCommand(command, dispatch);
    }, 150);

    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!event.key || !event.newValue) return;
      if (event.key !== "basketball_scoreboard_state_v3" && event.key !== "basketball_scoreboard_state_v5b") {
        return;
      }

      const externalPayload = parsePayload(event.newValue);
      if (!externalPayload) return;
      if (externalPayload.updatedAt <= payload.updatedAt) return;
      dispatch({ type: "HYDRATE", payload: externalPayload });
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [payload.updatedAt]);

  return useMemo(
    () => ({
      payload,
      dispatch,
    }),
    [payload],
  );
}
