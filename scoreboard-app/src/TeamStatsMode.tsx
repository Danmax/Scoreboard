import type { Dispatch } from "react";
import { useEffect, useMemo, useState } from "react";
import type { PersistedPayload, PlayerState } from "./types";
import { hexToRgba } from "./colorUtils";
import type { ScoreboardAction } from "./useScoreboardStore";

type TeamStatsPage = "stats" | "time" | "display" | "subs" | "recap";

interface TeamStatsModeProps {
  payload: PersistedPayload;
  dispatch: Dispatch<ScoreboardAction>;
}

interface SavedRecap {
  id: string;
  title: string;
  text: string;
  createdAt: number;
}

const RECAP_STORAGE_KEY = "game_recap_archive_v1";

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

function initialPage(): TeamStatsPage {
  const page = new URLSearchParams(window.location.search).get("page");
  if (page === "time" || page === "display" || page === "subs" || page === "recap" || page === "stats") {
    return page;
  }
  return "stats";
}

function loadSavedRecaps(): SavedRecap[] {
  const raw = localStorage.getItem(RECAP_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SavedRecap[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSavedRecaps(list: SavedRecap[]): void {
  localStorage.setItem(RECAP_STORAGE_KEY, JSON.stringify(list));
}

function orderedPlayers(list: PlayerState[]): PlayerState[] {
  return [...list.filter((p) => p.onCourt), ...list.filter((p) => !p.onCourt)];
}

function topScorers(players: PlayerState[]): PlayerState[] {
  return [...players].sort((a, b) => b.pts - a.pts).slice(0, 3);
}

function scoringPlayers(players: PlayerState[]): PlayerState[] {
  return [...players]
    .filter((p) => p.pts > 0)
    .sort((a, b) => b.pts - a.pts || a.number - b.number);
}

function initials(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function TeamStatsMode({ payload, dispatch }: TeamStatsModeProps) {
  const [page, setPage] = useState<TeamStatsPage>(initialPage);
  const [halftimeMinutes, setHalftimeMinutes] = useState("15");

  const [subTeam, setSubTeam] = useState<"A" | "B">("A");
  const [subOutId, setSubOutId] = useState<string>("");
  const [subInId, setSubInId] = useState<string>("");

  const [savedRecaps, setSavedRecaps] = useState<SavedRecap[]>(() => loadSavedRecaps());
  const [statPulse, setStatPulse] = useState<Record<string, boolean>>({});

  const state = payload.state;

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", "team-stats");
    url.searchParams.set("page", page);
    window.history.replaceState({}, "", url.toString());
  }, [page]);

  const recapText = useMemo(() => {
    const lines: string[] = [];
    lines.push(`${state.teamA.name} ${state.teamA.score} - ${state.teamB.score} ${state.teamB.name}`);
    lines.push(`Quarter: ${state.quarter}/${state.totalQuarters}`);
    lines.push(`Clock: ${formatClock(state.gameClockSeconds)} | Shot: ${state.shotClockSeconds}`);
    lines.push(`Fouls: ${state.teamA.name} ${state.teamA.fouls}, ${state.teamB.name} ${state.teamB.fouls}`);

    lines.push("");
    lines.push("Top Scorers:");
    for (const p of topScorers(payload.players.A)) {
      lines.push(`${state.teamA.name}: #${p.number} ${p.name} - ${p.pts} pts`);
    }
    for (const p of topScorers(payload.players.B)) {
      lines.push(`${state.teamB.name}: #${p.number} ${p.name} - ${p.pts} pts`);
    }

    lines.push("");
    lines.push("Recent Actions:");
    for (const entry of payload.actionLog.slice(0, 12)) {
      lines.push(`- ${entry}`);
    }
    return lines.join("\n");
  }, [payload.actionLog, payload.players.A, payload.players.B, state]);

  const openScreen = (targetPage: TeamStatsPage) => {
    const url = `${window.location.pathname}?mode=team-stats&page=${targetPage}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const saveRecap = () => {
    const entry: SavedRecap = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      title: `${state.teamA.name} ${state.teamA.score}-${state.teamB.score} ${state.teamB.name}`,
      text: recapText,
      createdAt: Date.now(),
    };
    const next = [entry, ...savedRecaps].slice(0, 30);
    setSavedRecaps(next);
    saveSavedRecaps(next);
  };

  const shareRecap = async () => {
    const title = `${state.teamA.name} vs ${state.teamB.name} Recap`;

    const nav = window.navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
      clipboard?: { writeText: (text: string) => Promise<void> };
    };

    if (typeof nav.share === "function") {
      await nav.share({
        title,
        text: recapText,
      });
      return;
    }

    if (nav.clipboard && typeof nav.clipboard.writeText === "function") {
      await nav.clipboard.writeText(recapText);
      window.alert("Recap copied to clipboard.");
      return;
    }

    window.prompt("Copy recap text:", recapText);
  };

  const runSubstitution = () => {
    if (!subOutId || !subInId) return;
    dispatch({
      type: "SUBSTITUTE_PLAYER",
      team: subTeam,
      playerOutId: subOutId,
      playerInId: subInId,
    });
    setSubOutId("");
    setSubInId("");
  };

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

  const currentTeamPlayers = payload.players[subTeam];
  const onCourtPlayers = currentTeamPlayers.filter((p) => p.onCourt && !p.fouledOut);
  const benchPlayers = currentTeamPlayers.filter((p) => !p.onCourt && !p.fouledOut);
  const scorersA = scoringPlayers(payload.players.A);
  const scorersB = scoringPlayers(payload.players.B);
  const starPrompt = state.tvStarPlayer;
  const starTeamState = starPrompt ? (starPrompt.team === "A" ? state.teamA : state.teamB) : null;
  const starPlayer = starPrompt ? payload.players[starPrompt.team].find((p) => p.id === starPrompt.playerId) ?? null : null;

  if (page === "display") {
    return (
      <>
        <div className="tv-display tv-display-fullscreen">
          <div className="tv-team" style={{ background: hexToRgba(state.teamA.color, 0.2) }}>
            <div className="tv-name">{state.teamA.name}</div>
            <div className="tv-score">{state.teamA.score}</div>
            <div className="tv-team-stats">FOULS {state.teamA.fouls} | TO {state.teamA.timeouts} | FB {state.teamA.fastBreakPoints}</div>
          </div>
          <div className="tv-center">
            <div className="tv-quarter">Q{state.quarter}</div>
            <div className="tv-clock">{formatClock(state.gameClockSeconds)}</div>
            <div className={state.shotViolation ? "tv-shot tv-violation" : "tv-shot"}>{state.shotClockSeconds}</div>
            <div className="tv-center-stats">
              <span>{state.teamA.name} TO {state.teamA.timeouts}</span>
              <span>{state.teamB.name} TO {state.teamB.timeouts}</span>
            </div>
          </div>
          <div className="tv-team" style={{ background: hexToRgba(state.teamB.color, 0.2) }}>
            <div className="tv-name">{state.teamB.name}</div>
            <div className="tv-score">{state.teamB.score}</div>
            <div className="tv-team-stats">FOULS {state.teamB.fouls} | TO {state.teamB.timeouts} | FB {state.teamB.fastBreakPoints}</div>
          </div>
        </div>

        <div className="tv-scorers-wrap">
          <div className="tv-scorers-card" style={{ borderColor: hexToRgba(state.teamA.color, 0.55) }}>
            <div className="tv-scorers-title">{state.teamA.name} Scorers</div>
            <div className="tv-scorers-list">
              {scorersA.length === 0 ? (
                <div className="tv-no-scorers">No scorers yet</div>
              ) : (
                scorersA.slice(0, 5).map((p) => (
                  <div className="tv-scorer-row" key={p.id}>
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={`${p.name}`} className="tv-scorer-img" />
                    ) : (
                      <div className="tv-scorer-fallback">{initials(p.name)}</div>
                    )}
                    <div className="tv-scorer-meta">
                      <div className="tv-scorer-name">#{p.number} {p.name}</div>
                      <div className="tv-scorer-points">{p.pts} PTS</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="tv-scorers-card" style={{ borderColor: hexToRgba(state.teamB.color, 0.55) }}>
            <div className="tv-scorers-title">{state.teamB.name} Scorers</div>
            <div className="tv-scorers-list">
              {scorersB.length === 0 ? (
                <div className="tv-no-scorers">No scorers yet</div>
              ) : (
                scorersB.slice(0, 5).map((p) => (
                  <div className="tv-scorer-row" key={p.id}>
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={`${p.name}`} className="tv-scorer-img" />
                    ) : (
                      <div className="tv-scorer-fallback">{initials(p.name)}</div>
                    )}
                    <div className="tv-scorer-meta">
                      <div className="tv-scorer-name">#{p.number} {p.name}</div>
                      <div className="tv-scorer-points">{p.pts} PTS</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {state.overlayMode ? (
          <div className="tv-overlay-banner">
            <span>{state.overlayLabel}</span>
            <strong>{formatClock(state.overlayRemainingSeconds)}</strong>
          </div>
        ) : null}

        {starPrompt && starPlayer && starTeamState ? (
          <div className="tv-star-wrap">
            <div
              className="tv-star-card"
              style={{
                borderColor: hexToRgba(starTeamState.color, 0.72),
                boxShadow: `0 24px 60px ${hexToRgba(starTeamState.color, 0.28)}`,
              }}
            >
              <div className="tv-star-side" style={{ background: `linear-gradient(180deg, ${hexToRgba(starTeamState.color, 0.25)}, rgba(10,16,30,0.1))` }}>
                <div className="tv-star-tagline">STAR PLAYER</div>
                {starPlayer.imageUrl ? (
                  <img src={starPlayer.imageUrl} alt={starPlayer.name} className="tv-star-img" />
                ) : (
                  <div className="tv-star-fallback">{initials(starPlayer.name)}</div>
                )}
              </div>
              <div className="tv-star-main">
                <div className="tv-star-head" style={{ background: hexToRgba(starTeamState.color, 0.92) }}>
                  <span>{starTeamState.name}</span>
                  <strong>#{starPlayer.number} {starPlayer.name}</strong>
                </div>
                <div className="tv-star-subhead">THIS GAME</div>
                {starPrompt.reason ? <div className="tv-star-reason">{starPrompt.reason}</div> : null}
                <div className="tv-star-stats">
                  <div><span>Points</span><strong>{starPlayer.pts}</strong></div>
                  <div><span>3PM</span><strong>{starPlayer.tpm}</strong></div>
                  <div><span>Rebounds</span><strong>{starPlayer.reb}</strong></div>
                  <div><span>Assists</span><strong>{starPlayer.ast}</strong></div>
                  <div><span>Steals</span><strong>{starPlayer.stl}</strong></div>
                  <div><span>Blocks</span><strong>{starPlayer.blk}</strong></div>
                </div>
                <div className="tv-star-foot">
                  <span>Fouls {starPlayer.fls}</span>
                  <span>Time {Math.max(0, starPrompt.remainingSeconds)}s</span>
                </div>
              </div>
              <button className="tv-star-dismiss" onClick={() => dispatch({ type: "DISMISS_TV_STAR_PLAYER" })}>
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        {state.tvTeamComparison ? (
          <div className="tv-team-compare-wrap">
            <div className="tv-team-compare-card">
              <div className="tv-team-compare-title">
                {state.tvTeamComparison.metric === "rebounds" ? "TEAM COMPARISON: REBOUNDS" : "TEAM COMPARISON: FAST BREAK PTS"}
              </div>
              <div className="tv-team-compare-grid">
                <div className={state.tvTeamComparison.leadingTeam === "A" ? "tv-team-compare-col lead" : "tv-team-compare-col"}>
                  <span>{state.teamA.name}</span>
                  <strong>{state.tvTeamComparison.teamAValue}</strong>
                </div>
                <div className={state.tvTeamComparison.leadingTeam === "B" ? "tv-team-compare-col lead" : "tv-team-compare-col"}>
                  <span>{state.teamB.name}</span>
                  <strong>{state.tvTeamComparison.teamBValue}</strong>
                </div>
              </div>
              <button className="tv-star-dismiss" onClick={() => dispatch({ type: "DISMISS_TV_STAR_PLAYER" })}>
                Dismiss
              </button>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <section className="card team-stats-mode">
      <div className="team-stats-head">
        <h2>Team Stats Mode</h2>
        <div className="manager-tabs">
          <button className={page === "stats" ? "active" : ""} onClick={() => setPage("stats")}>Stats Entry</button>
          <button className={page === "time" ? "active" : ""} onClick={() => setPage("time")}>Timekeeping</button>
          <button className={page === "subs" ? "active" : ""} onClick={() => setPage("subs")}>Substitutions</button>
          <button className={page === "recap" ? "active" : ""} onClick={() => setPage("recap")}>Game Recap</button>
        </div>
      </div>

      <div className="screen-launches">
        <button onClick={() => openScreen("display")}>Open TV Display</button>
      </div>

      {page === "stats" ? (
        <div className="team-stats-grid">
          {(["A", "B"] as const).map((team) => (
            <div
              className="manager-panel"
              key={team}
              style={{
                background: `linear-gradient(160deg, ${hexToRgba(team === "A" ? state.teamA.color : state.teamB.color, 0.12)}, #ffffff 65%)`,
                border: `1px solid ${hexToRgba(team === "A" ? state.teamA.color : state.teamB.color, 0.45)}`,
              }}
            >
              <h3>{team === "A" ? state.teamA.name : state.teamB.name} Stats Entry</h3>
              <div className="list-block">
                {orderedPlayers(payload.players[team]).map((p) => (
                  <div className="list-row" key={p.id}>
                    <div>
                      <strong>#{p.number} {p.name}</strong>
                      <div className="muted">
                        PTS <span className={statPulse[`${p.id}:pts`] ? "stat-pulse-text" : ""}>{p.pts}</span> | REB{" "}
                        <span className={statPulse[`${p.id}:reb`] ? "stat-pulse-text" : ""}>{p.reb}</span> | AST{" "}
                        <span className={statPulse[`${p.id}:ast`] ? "stat-pulse-text" : ""}>{p.ast}</span> | STL{" "}
                        <span className={statPulse[`${p.id}:stl`] ? "stat-pulse-text" : ""}>{p.stl}</span> | BLK{" "}
                        <span className={statPulse[`${p.id}:blk`] ? "stat-pulse-text" : ""}>{p.blk}</span> | FLS{" "}
                        <span className={statPulse[`${p.id}:fls`] ? "stat-pulse-text" : ""}>{p.fls}</span>
                      </div>
                    </div>
                    <div className="player-actions">
                      <button disabled={p.fouledOut} onClick={() => { pulseStat(p.id, "pts"); dispatch({ type: "ADD_POINTS", team, points: 1, playerId: p.id }); }}>+1</button>
                      <button disabled={p.fouledOut} onClick={() => { pulseStat(p.id, "pts"); dispatch({ type: "ADD_POINTS", team, points: 2, playerId: p.id }); }}>+2</button>
                      <button disabled={p.fouledOut} onClick={() => { pulseStat(p.id, "pts"); dispatch({ type: "ADD_POINTS", team, points: 3, playerId: p.id }); }}>+3</button>
                      <button disabled={p.fouledOut} onClick={() => { pulseStat(p.id, "reb"); dispatch({ type: "INC_PLAYER_STAT", team, playerId: p.id, stat: "reb" }); }}>REB</button>
                      <button disabled={p.fouledOut} onClick={() => { pulseStat(p.id, "ast"); dispatch({ type: "INC_PLAYER_STAT", team, playerId: p.id, stat: "ast" }); }}>AST</button>
                      <button disabled={p.fouledOut} onClick={() => { pulseStat(p.id, "stl"); dispatch({ type: "INC_PLAYER_STAT", team, playerId: p.id, stat: "stl" }); }}>STL</button>
                      <button disabled={p.fouledOut} onClick={() => { pulseStat(p.id, "blk"); dispatch({ type: "INC_PLAYER_STAT", team, playerId: p.id, stat: "blk" }); }}>BLK</button>
                      <button disabled={p.fouledOut} onClick={() => { pulseStat(p.id, "fls"); dispatch({ type: "INC_PLAYER_STAT", team, playerId: p.id, stat: "fls" }); }}>F</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {page === "time" ? (
        <div className="manager-panel">
          <h3>Timekeeping Console</h3>
          <div className="time-panel-display">
            <div>Q{state.quarter}</div>
            <div className="big-timer">{formatClock(state.gameClockSeconds)}</div>
            <div className={state.shotViolation ? "violation" : "shot"}>{state.shotClockSeconds}</div>
          </div>
          <div className="btn-grid">
            <button onClick={() => dispatch({ type: "START_GAME" })}>Start Game</button>
            <button onClick={() => dispatch({ type: "STOP_GAME" })}>Stop Game</button>
            <button onClick={() => dispatch({ type: "START_SHOT" })}>Start Shot</button>
            <button onClick={() => dispatch({ type: "STOP_SHOT" })}>Stop Shot</button>
            <button onClick={() => changeQuarterWithConfirm("prev")}>{"< Quarter"}</button>
            <button onClick={() => changeQuarterWithConfirm("next")}>Next Quarter</button>
            <button onClick={() => dispatch({ type: "RESET_SHOT", seconds: 24 })}>Reset 24</button>
            <button onClick={() => dispatch({ type: "RESET_SHOT", seconds: 14 })}>Reset 14</button>
            <button onClick={() => dispatch({ type: "SET_POSSESSION", team: "A" })}>Poss A</button>
            <button onClick={() => dispatch({ type: "SET_POSSESSION", team: "B" })}>Poss B</button>
            <button onClick={() => dispatch({ type: "OPEN_TIMEOUT", team: "A", seconds: 30 })}>A TO 30s</button>
            <button onClick={() => dispatch({ type: "OPEN_TIMEOUT", team: "B", seconds: 30 })}>B TO 30s</button>
            <button onClick={() => dispatch({ type: "OPEN_TIMEOUT", team: "A", seconds: 60 })}>A TO 60s</button>
            <button onClick={() => dispatch({ type: "OPEN_TIMEOUT", team: "B", seconds: 60 })}>B TO 60s</button>
          </div>
          <div className="halftime-row">
            <input type="number" value={halftimeMinutes} onChange={(e) => setHalftimeMinutes(e.target.value)} />
            <button
              onClick={() =>
                dispatch({ type: "START_HALFTIME", minutes: Number.parseInt(halftimeMinutes || "15", 10) || 15 })
              }
            >
              Start Halftime
            </button>
          </div>
        </div>
      ) : null}

      {page === "subs" ? (
        <div className="manager-panel">
          <h3>Substitutions</h3>
          <div className="manager-tabs">
            <button className={subTeam === "A" ? "active" : ""} onClick={() => setSubTeam("A")}>{state.teamA.name}</button>
            <button className={subTeam === "B" ? "active" : ""} onClick={() => setSubTeam("B")}>{state.teamB.name}</button>
          </div>
          <div className="sub-grid">
            <div>
              <h4>On Court (Sub Out)</h4>
              <div className="list-block">
                {onCourtPlayers.map((p) => (
                  <button
                    key={p.id}
                    className={`sub-option ${subOutId === p.id ? "active-sub" : ""}`}
                    onClick={() => setSubOutId(p.id)}
                  >
                    #{p.number} {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h4>Bench (Sub In)</h4>
              <div className="list-block">
                {benchPlayers.map((p) => (
                  <button
                    key={p.id}
                    className={`sub-option ${subInId === p.id ? "active-sub" : ""}`}
                    onClick={() => setSubInId(p.id)}
                  >
                    #{p.number} {p.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button disabled={!subOutId || !subInId} onClick={runSubstitution}>Confirm Substitution</button>
        </div>
      ) : null}

      {page === "recap" ? (
        <div className="manager-panel">
          <h3>Game Recap</h3>
          <div className="recap-actions">
            <button onClick={saveRecap}>Save Recap</button>
            <button onClick={() => void shareRecap()}>Share / Copy Recap</button>
          </div>
          <textarea className="recap-text" readOnly value={recapText} />

          <h4>Saved Recaps</h4>
          <div className="list-block">
            {savedRecaps.map((item) => (
              <div className="list-row" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <div className="muted">{formatDate(item.createdAt)}</div>
                </div>
                <div className="row-actions">
                  <button onClick={() => navigator.clipboard.writeText(item.text)}>Copy</button>
                  <button
                    onClick={() => {
                      const next = savedRecaps.filter((r) => r.id !== item.id);
                      setSavedRecaps(next);
                      saveSavedRecaps(next);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {state.overlayMode ? (
        <div className="overlay-backdrop">
          <div className="overlay-title">{state.overlayLabel}</div>
          <div className="overlay-clock">{formatClock(state.overlayRemainingSeconds)}</div>
          <button className="overlay-end-btn" onClick={() => dispatch({ type: "END_OVERLAY", manual: true })}>
            End Early
          </button>
        </div>
      ) : null}
    </section>
  );
}
