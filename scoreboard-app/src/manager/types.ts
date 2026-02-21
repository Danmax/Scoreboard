export type GameStatus = "scheduled" | "live" | "final";
export type TournamentFormat = "round_robin" | "single_elim";
export type TournamentStatus = "draft" | "active" | "completed";
export type TimingMode = "NBA" | "FIBA";

export interface GameRules {
  quarterLengthMinutes: number;
  totalQuarters: number;
  shotClockDefault: number;
  foulLimit: number;
  timingMode: TimingMode;
}

export interface Team {
  id: string;
  name: string;
  city: string;
  abbreviation: string;
  logoUrl: string;
  color: string;
  createdAt: number;
}

export interface Player {
  id: string;
  teamId: string;
  name: string;
  number: number;
  position: string;
  height: string;
  weight: string;
  imageUrl: string;
  hometown: string;
  createdAt: number;
}

export interface Game {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  scheduledAt: string;
  location: string;
  status: GameStatus;
  homeScore: number;
  awayScore: number;
  rules: GameRules;
  tournamentId: string | null;
  finishedAt: number | null;
  leaderboard: GameLeaderboardEntry[];
  createdAt: number;
}

export interface GameLeaderboardEntry {
  playerName: string;
  number: number;
  teamId: string;
  teamName: string;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tpm: number;
}

export interface Tournament {
  id: string;
  name: string;
  format: TournamentFormat;
  status: TournamentStatus;
  teamIds: string[];
  startDate: string;
  createdAt: number;
}

export interface ManagerData {
  teams: Team[];
  players: Player[];
  games: Game[];
  tournaments: Tournament[];
  defaultRules: GameRules;
  updatedAt: number;
}

export interface TeamStanding {
  teamId: string;
  games: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
}
