import type { CSSProperties } from "react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { TeamStatsMode } from "./TeamStatsMode";
import { extractColorFromImageUrl, hexToRgba, normalizeHexColor } from "./colorUtils";
import { GameManagerDashboard } from "./manager/GameManagerDashboard";
import { loadManagerData, saveManagerData } from "./manager/storage";
import type { GameLeaderboardEntry, GameRules, Player, Team } from "./manager/types";
import type { PersistedPayload, PlayerState } from "./types";
import { useScoreboardStore } from "./useScoreboardStore";
import "./styles.css";

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatMinutes(secondsPlayed: number): string {
  return (secondsPlayed / 60).toFixed(1);
}

function orderedPlayers(players: PlayerState[]): PlayerState[] {
  return [...players.filter((p) => p.onCourt), ...players.filter((p) => !p.onCourt)];
}

function toLiveRoster(players: Player[]): Array<{ name: string; number: number; imageUrl?: string }> {
  return [...players]
    .sort((a, b) => a.number - b.number)
    .map((p) => ({ name: p.name, number: p.number, imageUrl: p.imageUrl || "" }));
}

function initialMode(): "live" | "manager" | "team-stats" {
  const mode = new URLSearchParams(window.location.search).get("mode");
  if (mode === "live" || mode === "manager" || mode === "team-stats") {
    return mode;
  }
  return "manager";
}

type AppTheme = "light" | "dark";

interface SavedGame {
  id: string;
  createdAt: number;
  title: string;
  winner: string;
  summary: string;
  payload: PersistedPayload;
}

interface ActiveManagerGameMeta {
  scheduledGameId: string | null;
  homeTeamId: string;
  awayTeamId: string;
}

const GAME_ARCHIVE_KEY = "scoreboard_saved_games_v1";
const THEME_STORAGE_KEY = "scoreboard_theme_v1";

function initialTheme(): AppTheme {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function buildGameSummary(payload: PersistedPayload): string {
  const { state } = payload;
  const allPlayers = [...payload.players.A, ...payload.players.B];
  const top = [...allPlayers]
    .sort((a, b) => b.pts - a.pts || b.reb - a.reb || b.ast - a.ast)
    .slice(0, 3);
  const winner =
    state.teamA.score === state.teamB.score
      ? "Tie"
      : state.teamA.score > state.teamB.score
        ? state.teamA.name
        : state.teamB.name;

  const lines: string[] = [];
  lines.push(`${state.teamA.name} ${state.teamA.score} - ${state.teamB.score} ${state.teamB.name}`);
  lines.push(`Winner: ${winner}`);
  lines.push(`Q${state.quarter}/${state.totalQuarters} | Clock ${formatClock(state.gameClockSeconds)}`);
  lines.push(
    `${state.teamA.name} FOUL ${state.teamA.fouls}, TO ${state.teamA.timeouts}, FB ${state.teamA.fastBreakPoints}`,
  );
  lines.push(
    `${state.teamB.name} FOUL ${state.teamB.fouls}, TO ${state.teamB.timeouts}, FB ${state.teamB.fastBreakPoints}`,
  );
  lines.push("Top Players:");
  for (const p of top) {
    lines.push(
      `#${p.number} ${p.name}: ${p.pts} PTS, ${p.reb} REB, ${p.ast} AST, ${p.stl} STL, ${p.blk} BLK, ${p.tpm} 3PM`,
    );
  }
  return lines.join("\n");
}

function loadSavedGames(): SavedGame[] {
  const raw = localStorage.getItem(GAME_ARCHIVE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SavedGame[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSavedGames(list: SavedGame[]): void {
  localStorage.setItem(GAME_ARCHIVE_KEY, JSON.stringify(list));
}

export default function App() {
  const { payload, dispatch } = useScoreboardStore();
  const { state } = payload;
  const [mode, setMode] = useState<"live" | "manager" | "team-stats">(initialMode);
  const [theme, setTheme] = useState<AppTheme>(initialTheme);
  const [savedGames, setSavedGames] = useState<SavedGame[]>(() => loadSavedGames());
  const [activeManagerGame, setActiveManagerGame] = useState<ActiveManagerGameMeta | null>(null);

  const [rosterTeam, setRosterTeam] = useState<"A" | "B">("A");
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerNumber, setNewPlayerNumber] = useState("0");
  const [newPlayerOnCourt, setNewPlayerOnCourt] = useState(true);
  const [halftimeMinutes, setHalftimeMinutes] = useState("15");

  const [subTeam, setSubTeam] = useState<"A" | "B" | null>(null);
  const [subOutId, setSubOutId] = useState<string | null>(null);
  const [subInId, setSubInId] = useState<string | null>(null);
  const [teamEditorTeam, setTeamEditorTeam] = useState<"A" | "B" | null>(null);
  const [teamEditorName, setTeamEditorName] = useState("");
  const [teamEditorLogo, setTeamEditorLogo] = useState("");
  const [teamEditorColor, setTeamEditorColor] = useState("#6B7280");
  const [statPulse, setStatPulse] = useState<Record<string, boolean>>({});

  const pulseStat = (playerId: string, stat: "pts" | "reb" | "ast" | "stl" | "blk" | "fls") => {
    const key = `${playerId}:${stat}`;
    setStatPulse((prev) => ({ ...prev, [key]: true }));
    window.setTimeout(() => {
      setStatPulse((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, 1600);
  };

  const openTeamEditor = (team: "A" | "B") => {
    const data = team === "A" ? state.teamA : state.teamB;
    setTeamEditorTeam(team);
    setTeamEditorName(data.name);
    setTeamEditorLogo(data.logoUrl);
    setTeamEditorColor(normalizeHexColor(data.color));
  };

  const closeTeamEditor = () => {
    setTeamEditorTeam(null);
  };

  const saveTeamEditor = () => {
    if (!teamEditorTeam) return;
    dispatch({ type: "SET_TEAM_NAME", team: teamEditorTeam, name: teamEditorName.trim() || (teamEditorTeam === "A" ? "Home" : "Away") });
    dispatch({ type: "SET_TEAM_LOGO", team: teamEditorTeam, logoUrl: teamEditorLogo.trim() });
    dispatch({ type: "SET_TEAM_COLOR", team: teamEditorTeam, color: normalizeHexColor(teamEditorColor) });
    closeTeamEditor();
  };

  const handleStartGameFromDashboard = (input: {
    homeTeam: Team;
    awayTeam: Team;
    homePlayers: Player[];
    awayPlayers: Player[];
    rules: GameRules;
    scheduledGameId: string | null;
  }) => {
    dispatch({
      type: "LOAD_GAME",
      home: {
        name: input.homeTeam.name,
        color: input.homeTeam.color,
        logoUrl: input.homeTeam.logoUrl,
        players: toLiveRoster(input.homePlayers),
      },
      away: {
        name: input.awayTeam.name,
        color: input.awayTeam.color,
        logoUrl: input.awayTeam.logoUrl,
        players: toLiveRoster(input.awayPlayers),
      },
      rules: input.rules,
    });
    setActiveManagerGame({
      scheduledGameId: input.scheduledGameId,
      homeTeamId: input.homeTeam.id,
      awayTeamId: input.awayTeam.id,
    });
    setMode("live");
  };

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", mode);
    if (mode !== "team-stats") {
      url.searchParams.delete("page");
    }
    window.history.replaceState({}, "", url.toString());
  }, [mode]);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.body.setAttribute("data-theme", theme);
  }, [theme]);

  const players = payload.players[rosterTeam];
  const appThemeStyle = useMemo<CSSProperties>(
    () => ({
      ["--team-a-color" as const]: normalizeHexColor(state.teamA.color),
      ["--team-b-color" as const]: normalizeHexColor(state.teamB.color),
      ["--team-a-soft" as const]: hexToRgba(state.teamA.color, 0.14),
      ["--team-b-soft" as const]: hexToRgba(state.teamB.color, 0.14),
    } as CSSProperties),
    [state.teamA.color, state.teamB.color],
  );
  const winnerLabel =
    state.teamA.score === state.teamB.score
      ? "Tie"
      : state.teamA.score > state.teamB.score
        ? state.teamA.name
        : state.teamB.name;
  const teamAStyle = useMemo(
    () => ({
      background:
        theme === "dark"
          ? `linear-gradient(140deg, ${hexToRgba(state.teamA.color, 0.32)}, #111827)`
          : `linear-gradient(140deg, ${hexToRgba(state.teamA.color, 0.22)}, #fff8ef)`,
      border: `1px solid ${hexToRgba(state.teamA.color, 0.5)}`,
    }),
    [state.teamA.color, theme],
  );
  const teamBStyle = useMemo(
    () => ({
      background:
        theme === "dark"
          ? `linear-gradient(140deg, ${hexToRgba(state.teamB.color, 0.32)}, #111827)`
          : `linear-gradient(140deg, ${hexToRgba(state.teamB.color, 0.22)}, #f7fcff)`,
      border: `1px solid ${hexToRgba(state.teamB.color, 0.5)}`,
    }),
    [state.teamB.color, theme],
  );
  const subBench = useMemo(() => {
    if (!subTeam || !subOutId) return [];
    return payload.players[subTeam].filter((p) => !p.onCourt && !p.fouledOut);
  }, [payload.players, subOutId, subTeam]);
  const activeRosterTeam = rosterTeam === "A" ? state.teamA : state.teamB;

  const openSubModal = (team: "A" | "B", playerId: string) => {
    setSubTeam(team);
    setSubOutId(playerId);
    setSubInId(null);
  };

  const closeSubModal = () => {
    setSubTeam(null);
    setSubOutId(null);
    setSubInId(null);
  };

  const confirmSub = () => {
    if (!subTeam || !subOutId || !subInId) return;
    dispatch({
      type: "SUBSTITUTE_PLAYER",
      team: subTeam,
      playerOutId: subOutId,
      playerInId: subInId,
    });
    closeSubModal();
  };

  const changeQuarterWithConfirm = (direction: "prev" | "next") => {
    const isPrev = direction === "prev";
    const current = state.quarter;
    const target = isPrev ? Math.max(1, current - 1) : Math.min(state.totalQuarters, current + 1);
    if (target === current) return;

    const ok = window.confirm(
      `Change quarter from Q${current} to Q${target}? This resets game and shot clocks for the new quarter.`,
    );
    if (!ok) return;

    dispatch({ type: isPrev ? "PREV_QUARTER" : "NEXT_QUARTER" });
  };

  const finalizeManagerGame = (snapshot: PersistedPayload) => {
    if (activeManagerGame) {
      const leaderboard: GameLeaderboardEntry[] = [
        ...snapshot.players.A.map((p) => ({
          playerName: p.name,
          number: p.number,
          teamId: activeManagerGame.homeTeamId,
          teamName: snapshot.state.teamA.name,
          pts: p.pts,
          reb: p.reb,
          ast: p.ast,
          stl: p.stl,
          blk: p.blk,
          tpm: p.tpm,
        })),
        ...snapshot.players.B.map((p) => ({
          playerName: p.name,
          number: p.number,
          teamId: activeManagerGame.awayTeamId,
          teamName: snapshot.state.teamB.name,
          pts: p.pts,
          reb: p.reb,
          ast: p.ast,
          stl: p.stl,
          blk: p.blk,
          tpm: p.tpm,
        })),
      ]
        .sort((a, b) => b.pts - a.pts || b.reb - a.reb || b.ast - a.ast || b.stl - a.stl || b.blk - a.blk)
        .slice(0, 10);

      const manager = loadManagerData();
      const nowIso = new Date().toISOString().slice(0, 16);
      const nowTs = Date.now();
      if (activeManagerGame.scheduledGameId) {
        manager.games = manager.games.map((g) =>
          g.id === activeManagerGame.scheduledGameId
            ? {
                ...g,
                status: "final",
                homeScore: snapshot.state.teamA.score,
                awayScore: snapshot.state.teamB.score,
                finishedAt: nowTs,
                leaderboard,
              }
            : g,
        );
      } else {
        manager.games = [
          ...manager.games,
          {
            id: `game-${nowTs}-${Math.random().toString(16).slice(2, 8)}`,
            homeTeamId: activeManagerGame.homeTeamId,
            awayTeamId: activeManagerGame.awayTeamId,
            scheduledAt: nowIso,
            location: "Live Console",
            status: "final",
            homeScore: snapshot.state.teamA.score,
            awayScore: snapshot.state.teamB.score,
            rules: {
              quarterLengthMinutes: snapshot.state.quarterLengthMinutes,
              totalQuarters: snapshot.state.totalQuarters,
              shotClockDefault: snapshot.state.shotClockDefault,
              foulLimit: snapshot.state.foulLimit,
              timingMode: snapshot.state.timingMode,
            },
            tournamentId: null,
            finishedAt: nowTs,
            leaderboard,
            createdAt: nowTs,
          },
        ];
      }
      saveManagerData(manager);
      setActiveManagerGame(null);
    }
  };

  const endGame = (saveArchive: boolean) => {
    const scoreLine = `${state.teamA.name} ${state.teamA.score} - ${state.teamB.score} ${state.teamB.name}`;
    const ok = window.confirm(
      saveArchive
        ? `Finalize game and save stats archive?\n${scoreLine}`
        : `Finalize game without saving archive?\n${scoreLine}`,
    );
    if (!ok) return;

    const snapshot: PersistedPayload = JSON.parse(JSON.stringify(payload)) as PersistedPayload;
    if (saveArchive) {
      const summary = buildGameSummary(snapshot);
      const entry: SavedGame = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        createdAt: Date.now(),
        title: `${snapshot.state.teamA.name} ${snapshot.state.teamA.score}-${snapshot.state.teamB.score} ${snapshot.state.teamB.name}`,
        winner: winnerLabel,
        summary,
        payload: snapshot,
      };
      const next = [entry, ...savedGames].slice(0, 40);
      setSavedGames(next);
      saveSavedGames(next);
    }

    finalizeManagerGame(snapshot);

    dispatch({ type: "FINISH_GAME" });
    dispatch({
      type: "ADD_LOG",
      text: saveArchive ? `Game finalized and saved: ${scoreLine}` : `Game finalized: ${scoreLine}`,
    });
  };

  const renderPlayerTable = (team: "A" | "B") => {
    const teamPlayers = orderedPlayers(payload.players[team]);
    const teamColor = team === "A" ? state.teamA.color : state.teamB.color;

    return (
      <div
        className="card players-card"
        style={{
          background:
            theme === "dark"
              ? `linear-gradient(160deg, ${hexToRgba(teamColor, 0.2)}, #111827 62%)`
              : `linear-gradient(160deg, ${hexToRgba(teamColor, 0.1)}, #ffffff 55%)`,
          border: `1px solid ${hexToRgba(teamColor, 0.45)}`,
        }}
      >
        <h3>{team === "A" ? state.teamA.name : state.teamB.name} Players</h3>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>PTS</th>
              <th>3PM</th>
              <th>REB</th>
              <th>AST</th>
              <th>STL</th>
              <th>BLK</th>
              <th>FLS</th>
              <th>MIN</th>
            </tr>
          </thead>
          <tbody>
            {teamPlayers.map((p) => (
              <Fragment key={p.id}>
                <tr className={p.fouledOut ? "fouled-out-row" : ""}>
                  <td>{p.number}</td>
                  <td>
                    {p.name}
                    {p.onCourt ? " *" : ""}
                    {p.fouledOut ? " (FOULED OUT)" : ""}
                  </td>
                  <td className={statPulse[`${p.id}:pts`] ? "stat-pulse" : ""}>{p.pts}</td>
                  <td>{p.tpm}</td>
                  <td className={statPulse[`${p.id}:reb`] ? "stat-pulse" : ""}>{p.reb}</td>
                  <td className={statPulse[`${p.id}:ast`] ? "stat-pulse" : ""}>{p.ast}</td>
                  <td className={statPulse[`${p.id}:stl`] ? "stat-pulse" : ""}>{p.stl}</td>
                  <td className={statPulse[`${p.id}:blk`] ? "stat-pulse" : ""}>{p.blk}</td>
                  <td className={statPulse[`${p.id}:fls`] ? "stat-pulse" : ""}>{p.fls}</td>
                  <td>{formatMinutes(p.secondsPlayed)}</td>
                </tr>
                <tr className="player-actions-row">
                  <td colSpan={10} className="player-actions-cell">
                    <div className="player-actions">
                      <button disabled={p.fouledOut} onClick={() => { pulseStat(p.id, "pts"); dispatch({ type: "ADD_POINTS", team, points: 1, playerId: p.id }); }}>
                        +1
                      </button>
                      <button disabled={p.fouledOut} onClick={() => { pulseStat(p.id, "pts"); dispatch({ type: "ADD_POINTS", team, points: 2, playerId: p.id }); }}>
                        +2
                      </button>
                      <button disabled={p.fouledOut} onClick={() => { pulseStat(p.id, "pts"); dispatch({ type: "ADD_POINTS", team, points: 3, playerId: p.id }); }}>
                        +3
                      </button>
                      <button disabled={p.fouledOut} onClick={() => { pulseStat(p.id, "reb"); dispatch({ type: "INC_PLAYER_STAT", team, playerId: p.id, stat: "reb" }); }}>
                        +REB
                      </button>
                      <button disabled={p.fouledOut} onClick={() => { pulseStat(p.id, "ast"); dispatch({ type: "INC_PLAYER_STAT", team, playerId: p.id, stat: "ast" }); }}>
                        +AST
                      </button>
                      <button disabled={p.fouledOut} onClick={() => { pulseStat(p.id, "stl"); dispatch({ type: "INC_PLAYER_STAT", team, playerId: p.id, stat: "stl" }); }}>
                        +STL
                      </button>
                      <button disabled={p.fouledOut} onClick={() => { pulseStat(p.id, "blk"); dispatch({ type: "INC_PLAYER_STAT", team, playerId: p.id, stat: "blk" }); }}>
                        +BLK
                      </button>
                      <button disabled={p.fouledOut} onClick={() => { pulseStat(p.id, "fls"); dispatch({ type: "INC_PLAYER_STAT", team, playerId: p.id, stat: "fls" }); }}>
                        +F
                      </button>
                      <button disabled={p.fouledOut} onClick={() => dispatch({ type: "SHOW_TV_STAR_PLAYER", team, playerId: p.id })}>
                        TV Star
                      </button>
                      {p.onCourt ? (
                        <button disabled={p.fouledOut} onClick={() => openSubModal(team, p.id)}>
                          Sub Out
                        </button>
                      ) : (
                        <button
                          disabled={p.fouledOut}
                          onClick={() => dispatch({ type: "SET_PLAYER_ON_COURT", team, playerId: p.id, onCourt: true })}
                        >
                          Sub In
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <main className={`app theme-${theme}`} style={appThemeStyle}>
      <section className="card mode-switch">
        <div className="mode-switch-head">
          <h1>Basketball Operations Hub</h1>
          <button className="theme-toggle" onClick={() => setTheme((prev) => (prev === "light" ? "dark" : "light"))}>
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
        </div>
        <div className="manager-tabs">
          <button className={mode === "manager" ? "active" : ""} onClick={() => setMode("manager")}>
            Game Manager
          </button>
          <button className={mode === "team-stats" ? "active" : ""} onClick={() => setMode("team-stats")}>
            Team Stats Mode
          </button>
          <button className={mode === "live" ? "active" : ""} onClick={() => setMode("live")}>
            Live Console
          </button>
        </div>
      </section>

      {mode === "manager" ? <GameManagerDashboard onStartGame={handleStartGameFromDashboard} /> : null}
      {mode === "team-stats" ? <TeamStatsMode payload={payload} dispatch={dispatch} /> : null}

      {mode === "live" ? (
        <>
      <section className="card">
        <h2>Live Scoreboard Console</h2>
        <p>Run active games, clocks, substitutions, and overlays.</p>
      </section>

      <section className="board card">
        <div className="team team-a" style={teamAStyle}>
          <div className="team-header-row">
            <div className="team-title">{state.teamA.name}</div>
            <button className="team-info-btn" onClick={() => openTeamEditor("A")}>Team Info</button>
          </div>
          {state.teamA.logoUrl ? (
            <div className="live-team-logo-wrap">
              <img className="live-team-logo" src={state.teamA.logoUrl} alt={`${state.teamA.name} logo`} />
            </div>
          ) : null}
          <div className="score">{state.teamA.score}</div>
          <div className="meta">Fouls: {state.teamA.fouls} | TO: {state.teamA.timeouts} | FB: {state.teamA.fastBreakPoints}</div>
          <div className="btn-row">
            <button disabled={state.gameFinal} onClick={() => dispatch({ type: "ADD_POINTS", team: "A", points: 1 })}>+1</button>
            <button disabled={state.gameFinal} onClick={() => dispatch({ type: "ADD_POINTS", team: "A", points: 2 })}>+2</button>
            <button disabled={state.gameFinal} onClick={() => dispatch({ type: "ADD_POINTS", team: "A", points: 3 })}>+3</button>
          </div>
        </div>

        <div className="center">
          <div className="quarter">Q{state.quarter}</div>
          <div className="clock">{formatClock(state.gameClockSeconds)}</div>
          <div className={state.shotViolation ? "violation" : "shot"}>{state.shotClockSeconds}</div>
          <div className="possession">Possession: Team {state.possession}</div>
        </div>

        <div className="team team-b" style={teamBStyle}>
          <div className="team-header-row">
            <div className="team-title">{state.teamB.name}</div>
            <button className="team-info-btn" onClick={() => openTeamEditor("B")}>Team Info</button>
          </div>
          {state.teamB.logoUrl ? (
            <div className="live-team-logo-wrap">
              <img className="live-team-logo" src={state.teamB.logoUrl} alt={`${state.teamB.name} logo`} />
            </div>
          ) : null}
          <div className="score">{state.teamB.score}</div>
          <div className="meta">Fouls: {state.teamB.fouls} | TO: {state.teamB.timeouts} | FB: {state.teamB.fastBreakPoints}</div>
          <div className="btn-row">
            <button disabled={state.gameFinal} onClick={() => dispatch({ type: "ADD_POINTS", team: "B", points: 1 })}>+1</button>
            <button disabled={state.gameFinal} onClick={() => dispatch({ type: "ADD_POINTS", team: "B", points: 2 })}>+2</button>
            <button disabled={state.gameFinal} onClick={() => dispatch({ type: "ADD_POINTS", team: "B", points: 3 })}>+3</button>
          </div>
        </div>
      </section>

      <section className="card controls">
        <h2>Clock Controls</h2>
        <div className="control-grid">
          <div className="control-group">
            <h4>Game Clock</h4>
            <div className="control-buttons">
              <button onClick={() => dispatch({ type: "START_GAME" })}>Start</button>
              <button onClick={() => dispatch({ type: "STOP_GAME" })}>Stop</button>
              <button onClick={() => changeQuarterWithConfirm("prev")}>{"< Quarter"}</button>
              <button onClick={() => changeQuarterWithConfirm("next")}>Next Quarter</button>
            </div>
          </div>
          <div className="control-group">
            <h4>Shot Clock</h4>
            <div className="control-buttons">
              <button onClick={() => dispatch({ type: "START_SHOT" })}>Start</button>
              <button onClick={() => dispatch({ type: "STOP_SHOT" })}>Stop</button>
              <button onClick={() => dispatch({ type: "RESET_SHOT", seconds: 24 })}>Reset 24</button>
              <button onClick={() => dispatch({ type: "RESET_SHOT", seconds: 14 })}>Reset 14</button>
            </div>
          </div>
          <div className="control-group">
            <h4>Possession</h4>
            <div className="control-buttons two-col">
              <button onClick={() => dispatch({ type: "SET_POSSESSION", team: "A" })}>{state.teamA.name}</button>
              <button onClick={() => dispatch({ type: "SET_POSSESSION", team: "B" })}>{state.teamB.name}</button>
            </div>
          </div>
          <div className="control-group">
            <h4>Timeouts</h4>
            <div className="control-buttons">
              <button onClick={() => dispatch({ type: "OPEN_TIMEOUT", team: "A", seconds: 30 })}>{state.teamA.name} 30s</button>
              <button onClick={() => dispatch({ type: "OPEN_TIMEOUT", team: "A", seconds: 60 })}>{state.teamA.name} 60s</button>
              <button onClick={() => dispatch({ type: "OPEN_TIMEOUT", team: "B", seconds: 30 })}>{state.teamB.name} 30s</button>
              <button onClick={() => dispatch({ type: "OPEN_TIMEOUT", team: "B", seconds: 60 })}>{state.teamB.name} 60s</button>
            </div>
          </div>
        </div>
        <div className="halftime-row">
          <input
            type="number"
            min={1}
            max={30}
            value={halftimeMinutes}
            onChange={(e) => setHalftimeMinutes(e.target.value)}
          />
          <button
            onClick={() =>
              dispatch({
                type: "START_HALFTIME",
                minutes: Number.parseInt(halftimeMinutes || "15", 10) || 15,
              })
            }
          >
            Start Halftime
          </button>
        </div>
      </section>

      <section className="players-grid">{renderPlayerTable("A")}{renderPlayerTable("B")}</section>

      <section className="card">
        <div className="roster-header">
          <h2 className="roster-title">
            {activeRosterTeam.name} Roster
            <span
              className="roster-color-dot"
              style={{ background: activeRosterTeam.color, boxShadow: `0 0 0 4px ${hexToRgba(activeRosterTeam.color, 0.18)}` }}
            />
          </h2>
          <div className="roster-tabs">
            <button className={rosterTeam === "A" ? "active" : ""} onClick={() => setRosterTeam("A")}>{state.teamA.name}</button>
            <button className={rosterTeam === "B" ? "active" : ""} onClick={() => setRosterTeam("B")}>{state.teamB.name}</button>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>On Court</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id}>
                <td>
                  <input
                    type="number"
                    value={p.number}
                    onChange={(e) =>
                      dispatch({
                        type: "UPDATE_PLAYER",
                        team: rosterTeam,
                        playerId: p.id,
                        updates: { number: Number.parseInt(e.target.value || "0", 10) || 0 },
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={p.name}
                    onChange={(e) =>
                      dispatch({
                        type: "UPDATE_PLAYER",
                        team: rosterTeam,
                        playerId: p.id,
                        updates: { name: e.target.value },
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={p.onCourt}
                    disabled={p.fouledOut}
                    onChange={(e) =>
                      dispatch({
                        type: "UPDATE_PLAYER",
                        team: rosterTeam,
                        playerId: p.id,
                        updates: { onCourt: e.target.checked },
                      })
                    }
                  />
                </td>
                <td>
                  <button onClick={() => dispatch({ type: "DELETE_PLAYER", team: rosterTeam, playerId: p.id })}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="add-player-form">
          <input
            type="number"
            placeholder="Number"
            value={newPlayerNumber}
            onChange={(e) => setNewPlayerNumber(e.target.value)}
          />
          <input
            type="text"
            placeholder="Player name"
            value={newPlayerName}
            onChange={(e) => setNewPlayerName(e.target.value)}
          />
          <label>
            <input type="checkbox" checked={newPlayerOnCourt} onChange={(e) => setNewPlayerOnCourt(e.target.checked)} />
            On Court
          </label>
          <button
            onClick={() => {
              const name = newPlayerName.trim();
              if (!name) return;
              dispatch({
                type: "ADD_PLAYER",
                team: rosterTeam,
                name,
                number: Number.parseInt(newPlayerNumber || "0", 10) || 0,
                onCourt: newPlayerOnCourt,
              });
              setNewPlayerName("");
              setNewPlayerNumber("0");
              setNewPlayerOnCourt(true);
            }}
          >
            Add Player
          </button>
        </div>
      </section>

      <section className="card controls">
        <h2>Action Log</h2>
        <div className="action-log">
          {payload.actionLog.length === 0 ? (
            <div className="empty-log">No actions yet.</div>
          ) : (
            payload.actionLog.map((entry, idx) => <div key={`${entry}-${idx}`}>{entry}</div>)
          )}
        </div>
      </section>

      <section className="card controls">
        <h2>Game Results Archive</h2>
        <div className="row-actions">
          <button onClick={() => endGame(false)}>Finalize Game</button>
          <button onClick={() => endGame(true)}>Finalize + Save Stats</button>
        </div>
        <div className="muted">Winner if ended now: {winnerLabel}</div>
        <div className="list-block archive-list">
          {savedGames.length === 0 ? (
            <div className="empty-log">No saved games yet.</div>
          ) : (
            savedGames.map((game) => (
              <div className="list-row game-row" key={game.id}>
                <div>
                  <strong>{game.title}</strong>
                  <div className="muted">
                    {formatDateTime(game.createdAt)} | Winner: {game.winner}
                  </div>
                </div>
                <div className="row-actions">
                  <button onClick={() => navigator.clipboard.writeText(game.summary)}>Copy Summary</button>
                  <button
                    onClick={() => {
                      const next = savedGames.filter((g) => g.id !== game.id);
                      setSavedGames(next);
                      saveSavedGames(next);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {subTeam && subOutId ? (
        <div className="modal-backdrop" onClick={closeSubModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Substitution</h3>
            <p>Select a bench player to sub in.</p>
            <div className="sub-list">
              {subBench.length === 0 ? (
                <div className="empty-log">No bench players available.</div>
              ) : (
                subBench.map((p) => (
                  <button
                    key={p.id}
                    className={`sub-option ${subInId === p.id ? "active-sub" : ""}`}
                    onClick={() => setSubInId(p.id)}
                  >
                    #{p.number} {p.name}
                  </button>
                ))
              )}
            </div>
            <div className="modal-actions">
              <button onClick={closeSubModal}>Cancel</button>
              <button disabled={!subInId} onClick={confirmSub}>
                Confirm Sub
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {state.overlayMode ? (
        <div className="timeout-modal">
          <div className="timeout-modal-title">{state.overlayLabel}</div>
          <div className="timeout-modal-clock">{formatClock(state.overlayRemainingSeconds)}</div>
          <button className="overlay-end-btn" onClick={() => dispatch({ type: "END_OVERLAY", manual: true })}>
            Dismiss
          </button>
        </div>
      ) : null}

      {teamEditorTeam ? (
        <div className="modal-backdrop" onClick={closeTeamEditor}>
          <div className="modal team-info-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{teamEditorTeam === "A" ? "Home Team Info" : "Away Team Info"}</h3>
            <div className="form-grid">
              <input value={teamEditorName} onChange={(e) => setTeamEditorName(e.target.value)} placeholder="Team Name" />
              <input value={teamEditorLogo} onChange={(e) => setTeamEditorLogo(e.target.value)} placeholder="Logo URL" />
              <div className="color-row">
                <input type="color" value={normalizeHexColor(teamEditorColor)} onChange={(e) => setTeamEditorColor(e.target.value)} />
                <button
                  onClick={async () => {
                    try {
                      const extracted = await extractColorFromImageUrl(teamEditorLogo);
                      setTeamEditorColor(extracted);
                    } catch {
                      window.alert("Could not extract team color from logo URL.");
                    }
                  }}
                >
                  Auto
                </button>
              </div>
              <div className="row-actions">
                <button onClick={saveTeamEditor}>Save</button>
                <button onClick={closeTeamEditor}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <section className="card controls">
        <h2>Legacy Control Commands</h2>
        <p>
          This app listens for <code>scoreboard_command</code> and syncs state to both
          <code> basketball_scoreboard_state_v3</code> and <code>basketball_scoreboard_state_v5b</code>.
        </p>
      </section>
      </>
      ) : null}
    </main>
  );
}
