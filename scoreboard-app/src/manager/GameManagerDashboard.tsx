import { useMemo, useState } from "react";
import { extractColorFromImageUrl, normalizeHexColor } from "../colorUtils";
import { useManagerStore } from "./useManagerStore";
import type { GameRules, Player, Team, TournamentFormat } from "./types";

type ManagerTab = "teams" | "games" | "tournaments" | "stats";

interface StartGamePayload {
  homeTeam: Team;
  awayTeam: Team;
  homePlayers: Player[];
  awayPlayers: Player[];
  rules: GameRules;
  scheduledGameId: string | null;
}

interface GameManagerDashboardProps {
  onStartGame?: (payload: StartGamePayload) => void;
}

function nowLocalDateTime(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function GameManagerDashboard({ onStartGame }: GameManagerDashboardProps) {
  const { state, dispatch, standings, helpers } = useManagerStore();
  const [tab, setTab] = useState<ManagerTab>("teams");

  const [teamName, setTeamName] = useState("");
  const [teamCity, setTeamCity] = useState("");
  const [teamAbbreviation, setTeamAbbreviation] = useState("");
  const [teamLogoUrl, setTeamLogoUrl] = useState("");
  const [teamColor, setTeamColor] = useState("#6B7280");
  const [editTeamId, setEditTeamId] = useState<string | null>(null);
  const [editTeamName, setEditTeamName] = useState("");
  const [editTeamCity, setEditTeamCity] = useState("");
  const [editTeamAbbreviation, setEditTeamAbbreviation] = useState("");
  const [editTeamLogoUrl, setEditTeamLogoUrl] = useState("");
  const [editTeamColor, setEditTeamColor] = useState("#6B7280");

  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [playerName, setPlayerName] = useState("");
  const [playerNumber, setPlayerNumber] = useState("0");
  const [playerPosition, setPlayerPosition] = useState("G");
  const [playerHeight, setPlayerHeight] = useState("");
  const [playerWeight, setPlayerWeight] = useState("");
  const [playerImageUrl, setPlayerImageUrl] = useState("");
  const [playerHometown, setPlayerHometown] = useState("");
  const [editPlayerId, setEditPlayerId] = useState<string | null>(null);
  const [editPlayerName, setEditPlayerName] = useState("");
  const [editPlayerNumber, setEditPlayerNumber] = useState("0");
  const [editPlayerPosition, setEditPlayerPosition] = useState("G");
  const [editPlayerHeight, setEditPlayerHeight] = useState("");
  const [editPlayerWeight, setEditPlayerWeight] = useState("");
  const [editPlayerImageUrl, setEditPlayerImageUrl] = useState("");
  const [editPlayerHometown, setEditPlayerHometown] = useState("");

  const [homeTeamId, setHomeTeamId] = useState("");
  const [awayTeamId, setAwayTeamId] = useState("");
  const [scheduledAt, setScheduledAt] = useState(nowLocalDateTime());
  const [location, setLocation] = useState("Main Court");
  const [tournamentId, setTournamentId] = useState("");
  const [startHomeTeamId, setStartHomeTeamId] = useState("");
  const [startAwayTeamId, setStartAwayTeamId] = useState("");

  const [tournamentName, setTournamentName] = useState("");
  const [tournamentFormat, setTournamentFormat] = useState<TournamentFormat>("round_robin");
  const [tournamentStartDate, setTournamentStartDate] = useState(nowLocalDateTime().slice(0, 10));
  const [selectedTournamentTeams, setSelectedTournamentTeams] = useState<string[]>([]);

  const teamOptions = useMemo(() => state.teams, [state.teams]);
  const selectedTeamPlayers = selectedTeamId ? helpers.playersForTeam(selectedTeamId) : [];

  const startGame = (homeId: string, awayId: string, scheduledGameId: string | null) => {
    if (!onStartGame || !homeId || !awayId || homeId === awayId) return;
    const homeTeam = state.teams.find((t) => t.id === homeId);
    const awayTeam = state.teams.find((t) => t.id === awayId);
    if (!homeTeam || !awayTeam) return;

    const homePlayers = state.players.filter((p) => p.teamId === homeId);
    const awayPlayers = state.players.filter((p) => p.teamId === awayId);
    const scheduledGame = scheduledGameId ? state.games.find((g) => g.id === scheduledGameId) : null;

    onStartGame({
      homeTeam,
      awayTeam,
      homePlayers,
      awayPlayers,
      rules: scheduledGame?.rules ?? state.defaultRules,
      scheduledGameId,
    });
  };

  const toggleTournamentTeam = (id: string) => {
    setSelectedTournamentTeams((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <section className="card manager">
      <div className="manager-header">
        <h2>Game Manager Dashboard</h2>
        <div className="manager-tabs">
          <button className={tab === "teams" ? "active" : ""} onClick={() => setTab("teams")}>Teams</button>
          <button className={tab === "games" ? "active" : ""} onClick={() => setTab("games")}>Games</button>
          <button className={tab === "tournaments" ? "active" : ""} onClick={() => setTab("tournaments")}>Tournaments</button>
          <button className={tab === "stats" ? "active" : ""} onClick={() => setTab("stats")}>Stats</button>
        </div>
      </div>

      {tab === "teams" ? (
        <div className="manager-grid">
          <div className="manager-panel">
            <h3>Create Team</h3>
            <div className="form-grid">
              <input placeholder="Team name" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
              <input placeholder="City" value={teamCity} onChange={(e) => setTeamCity(e.target.value)} />
              <input
                placeholder="Abbreviation"
                maxLength={4}
                value={teamAbbreviation}
                onChange={(e) => setTeamAbbreviation(e.target.value.toUpperCase())}
              />
              <input
                placeholder="Logo URL (https://...)"
                value={teamLogoUrl}
                onChange={(e) => setTeamLogoUrl(e.target.value)}
              />
              <div className="color-row">
                <input type="color" value={teamColor} onChange={(e) => setTeamColor(e.target.value)} />
                <button
                  onClick={async () => {
                    try {
                      const extracted = await extractColorFromImageUrl(teamLogoUrl);
                      setTeamColor(extracted);
                    } catch {
                      window.alert("Could not extract color from logo URL.");
                    }
                  }}
                >
                  Auto
                </button>
              </div>
              <button
                onClick={() => {
                  const name = teamName.trim();
                  if (!name) return;
                  dispatch({
                    type: "ADD_TEAM",
                    name,
                    city: teamCity.trim(),
                    abbreviation: teamAbbreviation.trim() || name.slice(0, 3).toUpperCase(),
                    logoUrl: teamLogoUrl.trim(),
                    color: normalizeHexColor(teamColor),
                  });
                  setTeamName("");
                  setTeamCity("");
                  setTeamAbbreviation("");
                  setTeamLogoUrl("");
                  setTeamColor("#6B7280");
                }}
              >
                Add Team
              </button>
            </div>

            <h3>Teams ({state.teams.length})</h3>
            <div className="list-block">
              {state.teams.map((team) => (
                <div key={team.id} className="list-row">
                  {editTeamId === team.id ? (
                    <div className="edit-stack">
                      <input value={editTeamName} onChange={(e) => setEditTeamName(e.target.value)} />
                      <input value={editTeamCity} onChange={(e) => setEditTeamCity(e.target.value)} />
                      <input
                        maxLength={4}
                        value={editTeamAbbreviation}
                        onChange={(e) => setEditTeamAbbreviation(e.target.value.toUpperCase())}
                      />
                      <input value={editTeamLogoUrl} onChange={(e) => setEditTeamLogoUrl(e.target.value)} />
                      <div className="color-row">
                        <input type="color" value={editTeamColor} onChange={(e) => setEditTeamColor(e.target.value)} />
                        <button
                          onClick={async () => {
                            try {
                              const extracted = await extractColorFromImageUrl(editTeamLogoUrl);
                              setEditTeamColor(extracted);
                            } catch {
                              window.alert("Could not extract color from logo URL.");
                            }
                          }}
                        >
                          Auto
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="team-row-main">
                      {team.logoUrl ? <img src={team.logoUrl} alt={`${team.name} logo`} className="team-logo" /> : null}
                      <div>
                        <strong>{team.name}</strong> ({team.abbreviation})
                        <div className="muted">{team.city || "No city"}</div>
                      </div>
                      <span className="team-color-chip" style={{ background: team.color }} />
                    </div>
                  )}
                  <div className="row-actions">
                    <button onClick={() => setSelectedTeamId(team.id)}>Players</button>
                    {editTeamId === team.id ? (
                      <>
                        <button
                          onClick={() => {
                            const name = editTeamName.trim();
                            if (!name) return;
                            dispatch({
                              type: "UPDATE_TEAM",
                              teamId: team.id,
                              updates: {
                                name,
                                city: editTeamCity.trim(),
                                abbreviation:
                                  editTeamAbbreviation.trim() || name.slice(0, 3).toUpperCase(),
                                logoUrl: editTeamLogoUrl.trim(),
                                color: normalizeHexColor(editTeamColor),
                              },
                            });
                            setEditTeamId(null);
                          }}
                        >
                          Save
                        </button>
                        <button onClick={() => setEditTeamId(null)}>Cancel</button>
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          setEditTeamId(team.id);
                          setEditTeamName(team.name);
                          setEditTeamCity(team.city);
                          setEditTeamAbbreviation(team.abbreviation);
                          setEditTeamLogoUrl(team.logoUrl || "");
                          setEditTeamColor(team.color || "#6B7280");
                        }}
                      >
                        Edit
                      </button>
                    )}
                    <button
                      onClick={() => {
                        const ok = window.confirm(`Delete team ${team.name}? This also removes its players and games.`);
                        if (!ok) return;
                        dispatch({ type: "DELETE_TEAM", teamId: team.id });
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="manager-panel">
            <h3>Players</h3>
            <select value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)}>
              <option value="">Select team</option>
              {teamOptions.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>

            {selectedTeamId ? (
              <>
                <div className="form-grid">
                  <input placeholder="Player name" value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
                  <input
                    type="number"
                    placeholder="Number"
                    value={playerNumber}
                    onChange={(e) => setPlayerNumber(e.target.value)}
                  />
                  <input
                    placeholder="Position"
                    value={playerPosition}
                    onChange={(e) => setPlayerPosition(e.target.value.toUpperCase())}
                  />
                  <input placeholder="Height (e.g. 6 ft 4 in)" value={playerHeight} onChange={(e) => setPlayerHeight(e.target.value)} />
                  <input placeholder="Weight (e.g. 205 lb)" value={playerWeight} onChange={(e) => setPlayerWeight(e.target.value)} />
                  <input placeholder="Hometown" value={playerHometown} onChange={(e) => setPlayerHometown(e.target.value)} />
                  <input placeholder="Image URL" value={playerImageUrl} onChange={(e) => setPlayerImageUrl(e.target.value)} />
                  <button
                    onClick={() => {
                      const name = playerName.trim();
                      if (!name) return;
                      dispatch({
                        type: "ADD_PLAYER",
                        teamId: selectedTeamId,
                        name,
                        number: Number.parseInt(playerNumber || "0", 10) || 0,
                        position: playerPosition.trim() || "G",
                        height: playerHeight.trim(),
                        weight: playerWeight.trim(),
                        imageUrl: playerImageUrl.trim(),
                        hometown: playerHometown.trim(),
                      });
                      setPlayerName("");
                      setPlayerNumber("0");
                      setPlayerPosition("G");
                      setPlayerHeight("");
                      setPlayerWeight("");
                      setPlayerImageUrl("");
                      setPlayerHometown("");
                    }}
                  >
                    Add Player
                  </button>
                </div>

                <div className="list-block">
                  {selectedTeamPlayers.map((p) => (
                    <div key={p.id} className="list-row">
                      {editPlayerId === p.id ? (
                        <div className="edit-stack">
                          <input value={editPlayerName} onChange={(e) => setEditPlayerName(e.target.value)} />
                          <input
                            type="number"
                            value={editPlayerNumber}
                            onChange={(e) => setEditPlayerNumber(e.target.value)}
                          />
                          <input
                            value={editPlayerPosition}
                            onChange={(e) => setEditPlayerPosition(e.target.value.toUpperCase())}
                          />
                          <input value={editPlayerHeight} onChange={(e) => setEditPlayerHeight(e.target.value)} placeholder="Height" />
                          <input value={editPlayerWeight} onChange={(e) => setEditPlayerWeight(e.target.value)} placeholder="Weight" />
                          <input value={editPlayerHometown} onChange={(e) => setEditPlayerHometown(e.target.value)} placeholder="Hometown" />
                          <input value={editPlayerImageUrl} onChange={(e) => setEditPlayerImageUrl(e.target.value)} placeholder="Image URL" />
                        </div>
                      ) : (
                        <div className="player-list-main">
                          {p.imageUrl ? <img src={p.imageUrl} alt={`${p.name} headshot`} className="player-thumb" /> : null}
                          <div>
                            #{p.number} {p.name}
                            <div className="muted">
                              {p.position}
                              {p.height ? ` | ${p.height}` : ""}
                              {p.weight ? ` | ${p.weight}` : ""}
                              {p.hometown ? ` | ${p.hometown}` : ""}
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="row-actions">
                        {editPlayerId === p.id ? (
                          <>
                            <button
                              onClick={() => {
                                const name = editPlayerName.trim();
                                if (!name) return;
                                dispatch({
                                  type: "UPDATE_PLAYER",
                                  playerId: p.id,
                                  updates: {
                                    name,
                                    number: Number.parseInt(editPlayerNumber || "0", 10) || 0,
                                    position: editPlayerPosition.trim() || "G",
                                    height: editPlayerHeight.trim(),
                                    weight: editPlayerWeight.trim(),
                                    imageUrl: editPlayerImageUrl.trim(),
                                    hometown: editPlayerHometown.trim(),
                                  },
                                });
                                setEditPlayerId(null);
                              }}
                            >
                              Save
                            </button>
                            <button onClick={() => setEditPlayerId(null)}>Cancel</button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              setEditPlayerId(p.id);
                              setEditPlayerName(p.name);
                              setEditPlayerNumber(String(p.number));
                              setEditPlayerPosition(p.position);
                              setEditPlayerHeight(p.height || "");
                              setEditPlayerWeight(p.weight || "");
                              setEditPlayerImageUrl(p.imageUrl || "");
                              setEditPlayerHometown(p.hometown || "");
                            }}
                          >
                            Edit
                          </button>
                        )}
                        <button
                          onClick={() => {
                            const ok = window.confirm(`Delete player ${p.name}?`);
                            if (!ok) return;
                            dispatch({ type: "DELETE_PLAYER", playerId: p.id });
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="muted">Choose a team to manage players.</div>
            )}
          </div>
        </div>
      ) : null}

      {tab === "games" ? (
        <div className="manager-grid single">
          <div className="manager-panel">
            <h3>Schedule Game</h3>
            <div className="manager-panel start-game-panel">
              <h3>Game Rules</h3>
              <div className="form-grid form-rules-grid">
                <label>
                  Quarter (min)
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={state.defaultRules.quarterLengthMinutes}
                    onChange={(e) =>
                      dispatch({
                        type: "UPDATE_DEFAULT_RULES",
                        rules: { quarterLengthMinutes: Number.parseInt(e.target.value || "10", 10) || 10 },
                      })
                    }
                  />
                </label>
                <label>
                  Periods
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={state.defaultRules.totalQuarters}
                    onChange={(e) =>
                      dispatch({
                        type: "UPDATE_DEFAULT_RULES",
                        rules: { totalQuarters: Number.parseInt(e.target.value || "4", 10) || 4 },
                      })
                    }
                  />
                </label>
                <label>
                  Shot Clock
                  <input
                    type="number"
                    min={10}
                    max={40}
                    value={state.defaultRules.shotClockDefault}
                    onChange={(e) =>
                      dispatch({
                        type: "UPDATE_DEFAULT_RULES",
                        rules: { shotClockDefault: Number.parseInt(e.target.value || "24", 10) || 24 },
                      })
                    }
                  />
                </label>
                <label>
                  Foul Limit
                  <input
                    type="number"
                    min={3}
                    max={8}
                    value={state.defaultRules.foulLimit}
                    onChange={(e) =>
                      dispatch({
                        type: "UPDATE_DEFAULT_RULES",
                        rules: { foulLimit: Number.parseInt(e.target.value || "5", 10) || 5 },
                      })
                    }
                  />
                </label>
                <label>
                  Timing Mode
                  <select
                    value={state.defaultRules.timingMode}
                    onChange={(e) =>
                      dispatch({
                        type: "UPDATE_DEFAULT_RULES",
                        rules: { timingMode: (e.target.value as "NBA" | "FIBA") || "NBA" },
                      })
                    }
                  >
                    <option value="NBA">NBA</option>
                    <option value="FIBA">FIBA</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="form-grid form-wide">
              <select value={homeTeamId} onChange={(e) => setHomeTeamId(e.target.value)}>
                <option value="">Home team</option>
                {teamOptions.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              <select value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)}>
                <option value="">Away team</option>
                {teamOptions.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              <input placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
              <select value={tournamentId} onChange={(e) => setTournamentId(e.target.value)}>
                <option value="">No tournament</option>
                {state.tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) return;
                  dispatch({
                    type: "SCHEDULE_GAME",
                    homeTeamId,
                    awayTeamId,
                    scheduledAt,
                    location: location.trim() || "TBD",
                    tournamentId: tournamentId || null,
                    rules: state.defaultRules,
                  });
                  setLocation("Main Court");
                }}
              >
                Schedule
              </button>
            </div>

            <h3>Games ({state.games.length})</h3>
            <div className="manager-panel start-game-panel">
              <h3>Start New Game</h3>
              <div className="form-grid form-wide">
                <select value={startHomeTeamId} onChange={(e) => setStartHomeTeamId(e.target.value)}>
                  <option value="">Home team</option>
                  {teamOptions.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
                <select value={startAwayTeamId} onChange={(e) => setStartAwayTeamId(e.target.value)}>
                  <option value="">Away team</option>
                  {teamOptions.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
                <button onClick={() => startGame(startHomeTeamId, startAwayTeamId, null)}>Start New Game</button>
              </div>
            </div>
            <div className="list-block">
              {state.games
                .slice()
                .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
                .map((g) => (
                  <div key={g.id} className="list-row game-row">
                    <div>
                      <strong>
                        {helpers.teamName(g.homeTeamId)} vs {helpers.teamName(g.awayTeamId)}
                      </strong>
                      <div className="muted">
                        {g.scheduledAt || "No date"} | {g.location || "No location"} | {helpers.tournamentName(g.tournamentId)}
                      </div>
                      <div className="muted">
                        {g.rules.quarterLengthMinutes}m x {g.rules.totalQuarters} | Shot {g.rules.shotClockDefault} | Foul {g.rules.foulLimit} | {g.rules.timingMode}
                      </div>
                      {g.status === "final" ? (
                        <div className="muted">
                          Final: {helpers.teamName(g.homeTeamId)} {g.homeScore} - {g.awayScore} {helpers.teamName(g.awayTeamId)}
                          {g.finishedAt ? ` | ${new Date(g.finishedAt).toLocaleString()}` : ""}
                        </div>
                      ) : null}
                      {g.status === "final" && g.leaderboard.length > 0 ? (
                        <div className="muted">
                          Leaderboard:{" "}
                          {g.leaderboard
                            .slice(0, 3)
                            .map((p) => `#${p.number} ${p.playerName} (${p.teamName}) ${p.pts}P ${p.reb}R ${p.ast}A`)
                            .join(" | ")}
                        </div>
                      ) : null}
                    </div>
                    <div className="game-controls">
                      <button
                        onClick={() => {
                          startGame(g.homeTeamId, g.awayTeamId, g.id);
                          dispatch({ type: "UPDATE_GAME", gameId: g.id, status: "live" });
                        }}
                      >
                        Start
                      </button>
                      <select
                        value={g.status}
                        onChange={(e) =>
                          dispatch({ type: "UPDATE_GAME", gameId: g.id, status: e.target.value as "scheduled" | "live" | "final" })
                        }
                      >
                        <option value="scheduled">Scheduled</option>
                        <option value="live">Live</option>
                        <option value="final">Final</option>
                      </select>
                      <input
                        type="number"
                        value={g.homeScore}
                        onChange={(e) =>
                          dispatch({
                            type: "UPDATE_GAME",
                            gameId: g.id,
                            homeScore: Number.parseInt(e.target.value || "0", 10) || 0,
                          })
                        }
                      />
                      <input
                        type="number"
                        value={g.awayScore}
                        onChange={(e) =>
                          dispatch({
                            type: "UPDATE_GAME",
                            gameId: g.id,
                            awayScore: Number.parseInt(e.target.value || "0", 10) || 0,
                          })
                        }
                      />
                      <button
                        onClick={() => {
                          const ok = window.confirm("Delete this game?");
                          if (!ok) return;
                          dispatch({ type: "DELETE_GAME", gameId: g.id });
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "tournaments" ? (
        <div className="manager-grid single">
          <div className="manager-panel">
            <h3>Create Tournament</h3>
            <div className="form-grid form-wide">
              <input
                placeholder="Tournament name"
                value={tournamentName}
                onChange={(e) => setTournamentName(e.target.value)}
              />
              <select value={tournamentFormat} onChange={(e) => setTournamentFormat(e.target.value as TournamentFormat)}>
                <option value="round_robin">Round Robin</option>
                <option value="single_elim">Single Elimination</option>
              </select>
              <input
                type="date"
                value={tournamentStartDate}
                onChange={(e) => setTournamentStartDate(e.target.value)}
              />
            </div>

            <div className="team-picks">
              {state.teams.map((team) => (
                <label key={team.id}>
                  <input
                    type="checkbox"
                    checked={selectedTournamentTeams.includes(team.id)}
                    onChange={() => toggleTournamentTeam(team.id)}
                  />
                  {team.name}
                </label>
              ))}
            </div>

            <button
              onClick={() => {
                if (!tournamentName.trim() || selectedTournamentTeams.length < 2) return;
                dispatch({
                  type: "ADD_TOURNAMENT",
                  name: tournamentName.trim(),
                  format: tournamentFormat,
                  startDate: tournamentStartDate,
                  teamIds: selectedTournamentTeams,
                });
                setTournamentName("");
                setSelectedTournamentTeams([]);
              }}
            >
              Create Tournament
            </button>

            <h3>Tournaments ({state.tournaments.length})</h3>
            <div className="list-block">
              {state.tournaments.map((t) => (
                <div key={t.id} className="list-row">
                  <div>
                    <strong>{t.name}</strong>
                    <div className="muted">
                      {t.format} | {t.status} | Teams: {t.teamIds.length}
                    </div>
                  </div>
                  <div className="row-actions">
                    <button onClick={() => dispatch({ type: "GENERATE_TOURNAMENT_GAMES", tournamentId: t.id })}>
                      Generate Games
                    </button>
                    <button
                      onClick={() => {
                        const ok = window.confirm(`Delete tournament ${t.name}?`);
                        if (!ok) return;
                        dispatch({ type: "DELETE_TOURNAMENT", tournamentId: t.id });
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "stats" ? (
        <div className="manager-grid single">
          <div className="manager-panel">
            <h3>Team Standings (Final Games)</h3>
            <table>
              <thead>
                <tr>
                  <th>Team</th>
                  <th>GP</th>
                  <th>W</th>
                  <th>L</th>
                  <th>PF</th>
                  <th>PA</th>
                  <th>Diff</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row) => (
                  <tr key={row.teamId}>
                    <td>{helpers.teamName(row.teamId)}</td>
                    <td>{row.games}</td>
                    <td>{row.wins}</td>
                    <td>{row.losses}</td>
                    <td>{row.pointsFor}</td>
                    <td>{row.pointsAgainst}</td>
                    <td>{row.pointsFor - row.pointsAgainst}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3>Data Summary</h3>
            <div className="summary-cards">
              <div className="summary-card">
                <div className="k">Teams</div>
                <div className="v">{state.teams.length}</div>
              </div>
              <div className="summary-card">
                <div className="k">Players</div>
                <div className="v">{state.players.length}</div>
              </div>
              <div className="summary-card">
                <div className="k">Games</div>
                <div className="v">{state.games.length}</div>
              </div>
              <div className="summary-card">
                <div className="k">Final Games</div>
                <div className="v">{state.games.filter((g) => g.status === "final").length}</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
