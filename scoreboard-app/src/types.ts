export interface TeamState {
  name: string;
  score: number;
  fouls: number;
  timeouts: number;
  fastBreakPoints: number;
  color: string;
  logoUrl: string;
}

export interface ScoreboardState {
  teamA: TeamState;
  teamB: TeamState;
  possession: "A" | "B";
  quarter: number;
  totalQuarters: number;
  quarterLengthMinutes: number;
  foulLimit: number;
  gameClockSeconds: number;
  shotClockDefault: number;
  shotClockSeconds: number;
  gameClockRunning: boolean;
  shotClockRunning: boolean;
  timingMode: "NBA" | "FIBA";
  shotViolation: boolean;
  gameFinal: boolean;
  overlayMode: null | "timeout" | "halftime";
  overlayLabel: string;
  overlayRemainingSeconds: number;
  overlayResumeGame: boolean;
  tvAutoCooldownSeconds: number;
  tvAutoSeen: string[];
  tvStarPlayer: null | {
    team: "A" | "B";
    playerId: string;
    remainingSeconds: number;
    reason?: string;
    auto?: boolean;
  };
  tvTeamComparison: null | {
    metric: "rebounds" | "fastBreakPoints";
    teamAValue: number;
    teamBValue: number;
    leadingTeam: "A" | "B" | null;
    remainingSeconds: number;
  };
}

export interface PlayerState {
  id: string;
  number: number;
  name: string;
  imageUrl?: string;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tpm: number;
  fls: number;
  secondsPlayed: number;
  onCourt: boolean;
  fouledOut: boolean;
}

export interface PersistedPayload {
  state: ScoreboardState;
  players: {
    A: PlayerState[];
    B: PlayerState[];
  };
  actionLog: string[];
  updatedAt: number;
}

export type Command =
  | "startGame"
  | "stopGame"
  | "resetQuarter"
  | "nextQuarter"
  | "startShot"
  | "stopShot"
  | "reset24"
  | "reset14"
  | "possessionA"
  | "possessionB"
  | "foulA"
  | "foulB"
  | "timeoutA"
  | "timeoutB";
