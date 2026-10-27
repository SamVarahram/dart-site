import {
  CHECKOUTS,
  SCORE_PRESETS,
  applyBust,
  applyDart,
  applyManual,
  bustDetail,
  checkoutLabel,
  createDart,
  createMatch,
  currentPlayerIndex,
  describeManual,
  endMatch,
  endVisit,
  formatAverage,
  playerStats,
  shouldOfferWriteIn,
  startNextLeg,
  suggestCheckout,
} from "./game.js";

const KEY = "tavlan.v1";

const app = document.querySelector("#app");
let match = null;
let undo = [];
let history = [];
let settings = { vibrate: true };
let ui = freshUi();
let flashTimer = 0;
let toastTimer = 0;
let lastHit = 0;
let shownPlayer = -1;

function freshUi() {
  return {
    screen: "home",
    setup: freshSetup(),
    mult: 1,
    sheet: null,
    manual: { score: "", darts: 3, finish: null },
    flash: null,
    confirm: null,
    toast: null,
    error: "",
  };
}

function freshSetup() {
  return {
    count: 2,
    names: Array(8).fill(""),
    starter: 0,
    score: 501,
    custom: "",
    checkout: "double",
    legs: 1,
    legStart: "alternate",
  };
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!saved) return;
    if (saved.match?.players?.length) match = saved.match;
    if (Array.isArray(saved.undo)) undo = saved.undo.slice(-40);
    if (Array.isArray(saved.history)) history = saved.history.slice(0, 30);
    if (saved.settings) settings = { vibrate: saved.settings.vibrate !== false };
    ui.screen = saved.screen === "board" && match ? "board" : "home";
  } catch {
    localStorage.removeItem(KEY);
  }
}

function save() {
  localStorage.setItem(KEY, JSON.stringify({ match, undo, history, settings, screen: ui.screen }));
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function chosenScore(setup) {
  if (setup.score === "custom") {
    const value = Number(setup.custom);
    return Number.isInteger(value) ? value : null;
  }
  return setup.score;
}

function playerName(index) {
  return match.players[index]?.name ?? "";
}

function scoreLine() {
  if (match.players.length === 2) return `${match.players[0].legs}–${match.players[1].legs}`;
  return match.players.map((player) => `${player.name} ${player.legs}`).join(" · ");
}

function syncHistory() {
  if (!match) return;
  if (match.phase !== "match") {
    history = history.filter((item) => item.id !== match.id);
    return;
  }
  const summary = {
    id: match.id,
    endedAt: Date.now(),
    createdAt: match.createdAt,
    startScore: match.startScore,
    checkout: match.checkout,
    players: match.players.map((player) => ({
      name: player.name,
      legs: player.legs,
      darts: player.darts,
      points: player.points,
      best: player.best,
      average: player.darts ? (player.points / player.darts) * 3 : null,
    })),
    winner: match.matchWinner == null ? null : match.players[match.matchWinner].name,
    tie: match.tie,
  };
  const index = history.findIndex((item) => item.id === summary.id);
  if (index >= 0) history[index] = summary;
  else history.unshift(summary);
  history = history.slice(0, 30);
}

function showToast(message) {
  ui.toast = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    ui.toast = null;
    render();
  }, 1800);
  render();
}

function clearFlash() {
  clearTimeout(flashTimer);
  ui.flash = null;
}

function showFlash(event) {
  ui.flash = event;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    ui.flash = null;
    render();
  }, 1200);
}

function buzz(pattern) {
  if (!settings.vibrate) return;
  navigator.vibrate?.(pattern);
}

function withUndo(run) {
  const result = run(match);
  if (result.error) {
    showToast(result.error);
    return;
  }
  if (!result.state || result.state === match) return;
  undo.push(structuredClone(match));
  if (undo.length > 40) undo.shift();
  match = result.state;
  ui.sheet = null;
  ui.confirm = null;
  ui.error = "";
  if (result.event && result.event.type !== "dart") ui.mult = 1;
  if (result.event?.type === "bust") {
    showFlash(result.event);
    buzz([28, 36, 28]);
  } else if (result.event?.type === "checkout") {
    clearFlash();
    buzz([16, 20, 16, 20, 48]);
  } else {
    clearFlash();
  }
  syncHistory();
  save();
  render();
}

function undoLast() {
  const previous = undo.pop();
  if (!previous) return;
  match = previous;
  clearFlash();
  ui.sheet = null;
  syncHistory();
  save();
  render();
}

function render() {
  const scroller = document.querySelector(".columns");
  const keepScroll = scroller?.scrollLeft ?? 0;
  const current = match && ui.screen === "board" ? currentPlayerIndex(match) : -1;
  app.innerHTML = ui.screen === "board" && match ? renderBoard() : ui.screen === "setup" ? renderSetup() : renderHome();
  const nextScroller = document.querySelector(".columns");
  if (nextScroller && current === shownPlayer) nextScroller.scrollLeft = keepScroll;
  if (nextScroller && current !== shownPlayer) {
    const column = document.querySelector(".col.is-current");
    if (column) {
      nextScroller.scrollLeft = column.offsetLeft - (nextScroller.clientWidth - column.clientWidth) / 2;
    }
    shownPlayer = current;
  }
  document.querySelectorAll(".visits").forEach((list) => {
    list.scrollTop = list.scrollHeight;
  });
  const live = document.querySelector("#live");
  if (live && match && ui.screen === "board" && match.phase === "play") {
    const index = currentPlayerIndex(match);
    live.textContent = `${playerName(index)}, ${match.scores[index]} kvar.`;
  }
  document.title = titleFor();
}

function titleFor() {
  if (!match || ui.screen !== "board") return "Tavlan";
  if (match.phase === "match") return "Matchen är över · Tavlan";
  const index = match.phase === "leg" ? match.legWinner : currentPlayerIndex(match);
  return `${playerName(index)} ${match.scores[index]} · Tavlan`;
}

function renderHome() {
  const resume = match ? `
    <article class="resume">
      <p class="eyebrow">Sparad på den här telefonen</p>
      <strong>${esc(match.players.map((player) => player.name).join(" · "))}</strong>
      <p class="meta">${esc(scoreLine())} · leg ${match.legNumber} · ${esc(checkoutLabel(match.checkout))}</p>
      <div class="stack">
        <button type="button" class="btn btn-primary" data-action="resume">Fortsätt matchen</button>
        <button type="button" class="btn btn-danger" data-action="ask-discard">Släng matchen</button>
      </div>
    </article>` : "";
  const past = history.length ? `
    <section class="history">
      <h2>Senaste matcher</h2>
      <ul>
        ${history.map((item) => `
          <li>
            <span>${esc(item.winner ? `${item.winner} vann` : "Oavgjort")}<small class="meta"><br>${esc(item.players.map((player) => `${player.name} ${player.legs}`).join(" · "))}</small></span>
            <span class="meta">${esc(formatWhen(item.endedAt))}</span>
          </li>`).join("")}
      </ul>
      <button type="button" class="btn btn-ghost" data-action="clear-history">Rensa historik</button>
    </section>` : "";
  return `
    <main class="home">
      <header class="hero">
        <div class="dartboard" aria-hidden="true"></div>
        <h1 class="word">TAVLAN</h1>
        <p class="lede">Räkna matchen i telefonen. Inget konto, ingen server — tavlan ligger kvar om du stänger sidan.</p>
      </header>
      <button type="button" class="btn btn-primary" data-action="new">Ny match</button>
      ${resume}
      ${past}
    </main>`;
}

function renderSetup() {
  const setup = ui.setup;
  const names = Array.from({ length: setup.count }, (_, index) => `
    <label class="names">
      <span class="meta">Spelare ${index + 1}</span>
      <input type="text" maxlength="18" autocapitalize="words" autocomplete="off" placeholder="Spelare ${index + 1}" data-name="${index}" value="${esc(setup.names[index])}">
    </label>`).join("");
  const starters = setup.count > 1 ? `
    <div class="block">
      <h2>Vem börjar</h2>
      <div class="chips">
        ${Array.from({ length: setup.count }, (_, index) => `
          <button type="button" class="chip${setup.starter === index ? " is-on" : ""}" data-action="starter" data-index="${index}">${esc(setup.names[index].trim() || `Spelare ${index + 1}`)}</button>`).join("")}
      </div>
    </div>` : "";
  const nextLeg = setup.count > 1 ? `
    <div class="block">
      <h2>Nästa leg startas av</h2>
      <div class="choices">
        <button type="button" class="choice${setup.legStart === "alternate" ? " is-on" : ""}" data-action="leg-start" data-value="alternate">Varannan</button>
        <button type="button" class="choice${setup.legStart === "winner" ? " is-on" : ""}" data-action="leg-start" data-value="winner">Vinnaren</button>
      </div>
    </div>` : "";
  return `
    <main class="setup">
      <div class="top">
        <button type="button" class="icon-btn" data-action="home" aria-label="Hem">Hem</button>
        <div class="brand">NY MATCH</div>
        <span></span>
      </div>
      <div class="block">
        <h2>Antal spelare</h2>
        <div class="stepper">
          <button type="button" class="step" data-action="count" data-delta="-1" aria-label="Färre spelare">−</button>
          <strong>${setup.count}</strong>
          <button type="button" class="step" data-action="count" data-delta="1" aria-label="Fler spelare">+</button>
        </div>
      </div>
      <div class="block names">${names}</div>
      ${starters}
      <div class="block">
        <h2>Startpoäng</h2>
        <div class="chips">
          ${SCORE_PRESETS.map((score) => `
            <button type="button" class="chip${setup.score === score ? " is-on" : ""}" data-action="score" data-score="${score}">${score}</button>`).join("")}
        </div>
        <label class="names" style="margin-top:8px">
          <span class="meta">Egen poäng</span>
          <input type="text" inputmode="numeric" maxlength="4" placeholder="2–1001" data-custom="1" class="${setup.score === "custom" ? "is-on" : ""}" value="${esc(setup.custom)}">
        </label>
      </div>
      <div class="block">
        <h2>Måste gå ut på</h2>
        <div class="stack">
          ${CHECKOUTS.map((item) => `
            <button type="button" class="choice${setup.checkout === item.id ? " is-on" : ""}" data-action="checkout" data-value="${item.id}">
              <strong>${item.label}</strong><br><span class="meta">${item.hint}</span>
            </button>`).join("")}
        </div>
      </div>
      <div class="block">
        <h2>Först till</h2>
        <div class="chips">
          ${[1, 2, 3, 5].map((legs) => `
            <button type="button" class="chip${setup.legs === legs ? " is-on" : ""}" data-action="legs" data-legs="${legs}">${legs} ${legs === 1 ? "leg" : "legs"}</button>`).join("")}
          <button type="button" class="chip${setup.legs == null ? " is-on" : ""}" data-action="legs" data-legs="open">Fri lek</button>
        </div>
      </div>
      ${nextLeg}
      <p class="error">${esc(ui.error)}</p>
      <button type="button" class="btn btn-primary" data-action="start">Kasta igång</button>
    </main>`;
}

function renderBoard() {
  const index = currentPlayerIndex(match);
  const playing = match.phase === "play";
  return `
    <main class="board">
      <p id="live" class="sr" aria-live="polite"></p>
      <header class="top">
        <button type="button" class="icon-btn" data-action="home">Hem</button>
        <div class="brand">TAVLAN</div>
        <button type="button" class="icon-btn" data-action="open-stats">Stat</button>
      </header>
      <p class="legline">
        <span>Leg ${match.legNumber}${match.legsToWin ? ` · först till ${match.legsToWin}` : " · fri lek"}</span>
        <span>${esc(scoreLine())}</span>
      </p>
      <div class="columns">
        ${match.players.map((player, playerIndex) => renderColumn(player, playerIndex, index)).join("")}
      </div>
      ${playing ? renderThrow(index) : renderResult()}
      ${renderSheet()}
      ${renderFlash()}
      ${renderConfirm()}
      ${ui.toast ? `<div class="toast" role="status">${esc(ui.toast)}</div>` : ""}
    </main>`;
}

function renderColumn(player, playerIndex, current) {
  const stats = playerStats(match, playerIndex);
  const visits = match.log.filter((entry) => entry.leg === match.legNumber && entry.player === playerIndex);
  const pending = playerIndex === current && match.darts.length ? `
    <li class="visit is-pending"><span>${esc(match.darts.map((dart) => dart.label).join(" "))}</span><span>…</span></li>` : "";
  return `
    <section class="col${playerIndex === current && match.phase === "play" ? " is-current" : ""}">
      <div class="col-name">
        <span>${esc(player.name)}</span>
        ${playerIndex === current && match.phase === "play" ? `<span class="tur">Tur</span>` : `<span class="meta">${player.legs}</span>`}
      </div>
      <div class="col-score">${match.scores[playerIndex]}</div>
      <p class="avg">Snitt ${formatAverage(stats.average)} · ${player.legs} ${player.legs === 1 ? "leg" : "legs"}</p>
      <ol class="visits">
        ${visits.map(renderVisit).join("")}
        ${pending}
      </ol>
    </section>`;
}

function renderVisit(entry) {
  const bust = entry.result === "bust";
  const out = entry.result === "checkout";
  const value = bust ? "Tjock" : out ? "Ut" : entry.total;
  return `<li class="visit${bust ? " is-bust" : ""}${out ? " is-out" : ""}"><span>${value}</span><small>${esc(entry.labels.join(" "))}</small></li>`;
}

function renderThrow(index) {
  const remaining = match.scores[index];
  const dartsLeft = 3 - match.darts.length;
  const suggestion = suggestCheckout(remaining, match.checkout, dartsLeft);
  const offer = shouldOfferWriteIn(match);
  const sum = match.darts.reduce((total, dart) => total + dart.score, 0);
  return `
    <section class="throw">
      <div class="throw-head">
        <h2>${esc(playerName(index))}</h2>
        <p class="meta">Pil ${match.darts.length + 1} av 3${sum ? ` · ${sum}` : ""}</p>
      </div>
      <div class="slots">
        ${[0, 1, 2].map((slot) => {
          const dart = match.darts[slot];
          return dart
            ? `<div class="slot">${esc(dart.label)}<small>${dart.score}</small></div>`
            : `<div class="slot is-empty">${slot + 1}</div>`;
        }).join("")}
      </div>
      <p class="hint">${suggestion ? `Förslag <strong>${esc(suggestion.map((dart) => dart.label).join(" · "))}</strong>` : remaining <= 180 ? "Ingen utgång på pilarna som är kvar." : ""}</p>
      <div class="mult" role="group" aria-label="Multiplikator">
        ${[["Enkel", 1], ["Dubbel", 2], ["Trippel", 3]].map(([label, mult]) => `
          <button type="button" class="${ui.mult === mult ? "is-on" : ""}" data-action="mult" data-mult="${mult}" aria-pressed="${ui.mult === mult}">${label}</button>`).join("")}
      </div>
      <div class="pad" data-mult="${ui.mult}">
        ${Array.from({ length: 20 }, (_, sector) => sector + 1).map((sector) => {
          const dart = createDart(sector, ui.mult);
          const face = ui.mult === 1 ? `<strong>${sector}</strong>` : `<strong>${esc(dart.label)}</strong><small>${dart.score}</small>`;
          return `<button type="button" class="key" data-action="hit" data-sector="${sector}" aria-label="${esc(dart.label)}">${face}</button>`;
        }).join("")}
      </div>
      <div class="aux">
        <button type="button" class="key" data-action="miss">Bom</button>
        <button type="button" class="key" data-action="bull" data-mult="1" aria-label="Ytterbull 25"><strong>25</strong></button>
        <button type="button" class="key" data-action="bull" data-mult="2" aria-label="Bull"><strong>Bull</strong></button>
      </div>
      <div class="actions${match.darts.length || offer ? " two" : ""}">
        <button type="button" class="btn btn-ghost" data-action="undo"${undo.length ? "" : " disabled"}>Ångra</button>
        ${match.darts.length ? `<button type="button" class="btn" data-action="end-visit">Avsluta rundan</button>` : ""}
        ${offer ? `<button type="button" class="btn" data-action="open-manual">Skriv in</button>` : ""}
      </div>
      ${offer ? `<p class="bust-note">Den här rundan kan bli tjock. Skriv in poängen om ni inte kastar pil för pil.</p>` : ""}
    </section>`;
}

function renderResult() {
  const wonLeg = match.phase === "leg";
  const winner = wonLeg ? match.legWinner : match.matchWinner;
  const last = match.log.at(-1);
  const title = match.phase === "match"
    ? (match.tie || winner == null ? "Oavgjort" : `${playerName(winner)} vinner`)
    : `${playerName(winner)} går ut`;
  const stats = match.players.map((player, index) => {
    const row = playerStats(match, index);
    return `<li><span>${esc(player.name)}</span><span>${player.legs} · snitt ${formatAverage(row.average)} · bäst ${player.best}</span></li>`;
  }).join("");
  return `
    <section class="result">
      <p class="eyebrow">${wonLeg ? `Leg ${match.legNumber}` : "Match"}</p>
      <h2>${esc(title)}</h2>
      <p class="meta">${last ? `${esc(last.labels.join(" "))} · ${last.darts} ${last.darts === 1 ? "pil" : "pilar"}` : ""}</p>
      <p>${esc(scoreLine())} · ${esc(checkoutLabel(match.checkout))} · ${match.startScore}</p>
      <ul class="stats">${stats}</ul>
      <div class="stack" style="margin-top:12px">
        ${wonLeg ? `<button type="button" class="btn btn-primary" data-action="next-leg">Nästa leg</button>` : `<button type="button" class="btn btn-primary" data-action="new">Ny match</button>`}
        ${wonLeg ? `<button type="button" class="btn" data-action="ask-end">Avsluta matchen</button>` : `<button type="button" class="btn" data-action="home">Hem</button>`}
        <button type="button" class="btn btn-ghost" data-action="undo"${undo.length ? "" : " disabled"}>Ångra</button>
      </div>
    </section>`;
}

function renderSheet() {
  if (ui.sheet === "manual") return renderManual();
  if (ui.sheet === "stats") return renderStats();
  if (ui.sheet === "rules") return renderRules();
  return "";
}

function renderManual() {
  const index = currentPlayerIndex(match);
  const described = describeManual({
    remaining: match.visitStart,
    checkout: match.checkout,
    scored: ui.manual.score,
    darts: ui.manual.darts,
    finish: ui.manual.finish,
  });
  const exact = ui.manual.score !== "" && Number(ui.manual.score) === match.visitStart && match.checkout !== "none";
  const canSave = ["ok", "bust", "checkout"].includes(described.status);
  const label = described.status === "checkout" ? "Gå ut" : described.status === "bust" ? "Stryk rundan" : "Spara runda";
  const tone = described.status === "bust" ? "is-bust" : described.status === "checkout" ? "is-out" : "";
  return `
    <div class="sheet-back">
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="manual-title">
        <p class="eyebrow">Innan rundan</p>
        <h2 id="manual-title">Skriv in</h2>
        <p class="meta">${esc(playerName(index))} har ${match.visitStart} kvar. Exakt utgång med fel krav blir tjock och rundan stryks.</p>
        <div class="draft">${esc(ui.manual.score || "0")}</div>
        <p class="preview ${tone}">${esc(described.message || "")}</p>
        <div class="choices" aria-label="Antal pilar">
          ${[1, 2, 3].map((count) => `
            <button type="button" class="choice${ui.manual.darts === count ? " is-on" : ""}" data-action="darts" data-darts="${count}">${count} ${count === 1 ? "pil" : "pilar"}</button>`).join("")}
        </div>
        ${exact ? `
          <div class="block">
            <h2>Sista pilen</h2>
            <div class="choices">
              ${[["single", "Enkel"], ["double", "Dubbel"], ["triple", "Trippel"]].map(([id, text]) => `
                <button type="button" class="choice${ui.manual.finish === id ? " is-on" : ""}" data-action="finish" data-finish="${id}">${text}</button>`).join("")}
            </div>
            <p class="help">${match.checkout === "double" ? "Bull räknas som dubbel. 25 räknas som enkel." : "Bara en trippel går ut."}</p>
          </div>` : ""}
        <div class="numpad">
          ${["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((key) => `
            <button type="button" class="key" data-action="${key === "C" ? "clear-score" : key === "⌫" ? "manual-back" : "digit"}" ${key !== "C" && key !== "⌫" ? `data-digit="${key}"` : ""}><strong>${key}</strong></button>`).join("")}
        </div>
        <div class="stack">
          <button type="button" class="btn btn-primary" data-action="save-manual"${canSave ? "" : " disabled"}>${label}</button>
          <button type="button" class="btn btn-danger" data-action="mark-bust">Bara tjock, utan poäng</button>
          <button type="button" class="btn btn-ghost" data-action="close-sheet">Stäng</button>
        </div>
      </section>
    </div>`;
}

function renderStats() {
  const rows = match.players.map((player, index) => {
    const stats = playerStats(match, index);
    return `<li><span>${esc(player.name)}</span><span>${formatAverage(stats.average)} · ${stats.darts} pilar · bäst ${player.best}</span></li>`;
  }).join("");
  return `
    <div class="sheet-back">
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="stats-title">
        <h2 id="stats-title">Matchen</h2>
        <p class="meta">${match.startScore} · ${esc(checkoutLabel(match.checkout))} · ${esc(scoreLine())}</p>
        <ul class="stats">${rows}</ul>
        <div class="stack" style="margin-top:14px">
          <button type="button" class="btn" data-action="vibrate" aria-pressed="${settings.vibrate}">Vibration ${settings.vibrate ? "på" : "av"}</button>
          <button type="button" class="btn" data-action="open-rules">Regler</button>
          ${match.phase !== "match" ? `<button type="button" class="btn btn-danger" data-action="ask-end">Avsluta matchen</button>` : ""}
          <button type="button" class="btn btn-ghost" data-action="close-sheet">Stäng</button>
        </div>
      </section>
    </div>`;
}

function renderRules() {
  return `
    <div class="sheet-back">
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="rules-title">
        <h2 id="rules-title">Regler</h2>
        <p>En runda är högst tre pilar. Poängen dras från det som är kvar.</p>
        <p><strong>Dubbel.</strong> Sista pilen måste vara dubbel eller bull. Lämnar man 1 är det tjock direkt.</p>
        <p><strong>Trippel.</strong> Sista pilen måste vara trippel.</p>
        <p><strong>Inget krav.</strong> Exakt noll räcker, oavsett pil.</p>
        <p>Tjock — för högt, kvar på 1, eller utgång med fel krav — stryker hela rundan. Poängen går tillbaka till rundans start och turen går vidare.</p>
        <p>När en tjock är möjlig redan innan rundan kan ni skriva in poängen. Skriv exakt det som är kvar och ange sista pilen. Stämmer den inte med kravet blir rundan tjock.</p>
        <button type="button" class="btn" data-action="open-stats">Tillbaka</button>
      </section>
    </div>`;
}

function renderFlash() {
  if (!ui.flash || ui.flash.type !== "bust") return "";
  const name = playerName(ui.flash.player);
  return `
    <div class="flash" data-action="dismiss-flash">
      <div class="stamp">TJOCK<small>${esc(name)}. ${esc(bustDetail(ui.flash.reason, match.checkout))}</small></div>
    </div>`;
}

function renderConfirm() {
  if (!ui.confirm) return "";
  return `
    <div class="confirm-back">
      <section class="confirm" role="dialog" aria-modal="true">
        <h2>${esc(ui.confirm.title)}</h2>
        <p>${esc(ui.confirm.body)}</p>
        <div class="stack">
          <button type="button" class="btn btn-danger" data-action="confirm-yes">${esc(ui.confirm.confirmLabel)}</button>
          <button type="button" class="btn btn-ghost" data-action="confirm-no">Avbryt</button>
        </div>
      </section>
    </div>`;
}

function formatWhen(value) {
  try {
    return new Date(value).toLocaleString("sv-SE", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "";
  }
}

function ask(title, body, confirmLabel, onConfirm) {
  ui.confirm = { title, body, confirmLabel, onConfirm };
  render();
}

function startMatch() {
  const setup = ui.setup;
  const startScore = chosenScore(setup);
  if (!Number.isInteger(startScore) || startScore < 2 || startScore > 1001) {
    ui.error = "Startpoäng måste vara ett heltal mellan 2 och 1001.";
    render();
    return;
  }
  const names = setup.names.slice(0, setup.count);
  match = createMatch({
    names,
    startScore,
    checkout: setup.checkout,
    legsToWin: setup.legs,
    starter: Math.min(setup.starter, setup.count - 1),
    legStart: setup.legStart,
  });
  undo = [];
  ui.screen = "board";
  ui.mult = 1;
  ui.error = "";
  ui.sheet = null;
  clearFlash();
  save();
  render();
}

function onClick(event) {
  if (event.target.classList?.contains("sheet-back")) {
    ui.sheet = null;
    render();
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button || !app.contains(button)) return;
  const action = button.dataset.action;
  if (action === "confirm-no" || action === "close-sheet" || action === "dismiss-flash") {
    if (action === "dismiss-flash") clearFlash();
    if (action === "close-sheet") ui.sheet = null;
    if (action === "confirm-no") ui.confirm = null;
    render();
    return;
  }
  if (action === "confirm-yes") {
    const run = ui.confirm?.onConfirm;
    ui.confirm = null;
    run?.();
    return;
  }
  if (action === "home") {
    ui.screen = "home";
    ui.sheet = null;
    render();
    return;
  }
  if (action === "resume") {
    ui.screen = "board";
    render();
    return;
  }
  if (action === "new") {
    if (match && match.phase !== "match") {
      ask("Ny match?", "Den sparade matchen slängs från den här telefonen.", "Släng och börja om", () => {
        match = null;
        undo = [];
        ui = { ...freshUi(), screen: "setup", setup: ui.setup };
        save();
        render();
      });
      return;
    }
    match = null;
    undo = [];
    ui.screen = "setup";
    ui.error = "";
    save();
    render();
    return;
  }
  if (action === "ask-discard") {
    ask("Släng matchen?", "Den försvinner från telefonen. Historiken rörs inte.", "Släng", () => {
      match = null;
      undo = [];
      ui.screen = "home";
      save();
      render();
    });
    return;
  }
  if (action === "clear-history") {
    history = [];
    save();
    render();
    return;
  }
  if (action === "count") {
    ui.setup.count = Math.min(8, Math.max(1, ui.setup.count + Number(button.dataset.delta)));
    if (ui.setup.starter > ui.setup.count - 1) ui.setup.starter = 0;
    render();
    return;
  }
  if (action === "starter") {
    ui.setup.starter = Number(button.dataset.index);
    render();
    return;
  }
  if (action === "score") {
    ui.setup.score = Number(button.dataset.score);
    render();
    return;
  }
  if (action === "checkout") {
    ui.setup.checkout = button.dataset.value;
    render();
    return;
  }
  if (action === "legs") {
    ui.setup.legs = button.dataset.legs === "open" ? null : Number(button.dataset.legs);
    render();
    return;
  }
  if (action === "leg-start") {
    ui.setup.legStart = button.dataset.value;
    render();
    return;
  }
  if (action === "start") {
    if (match && match.phase !== "match") {
      ask("Ersätt sparad match?", "Den pågående matchen slängs.", "Starta ändå", startMatch);
      return;
    }
    startMatch();
    return;
  }
  if (!match) return;
  if (action === "mult") {
    ui.mult = Number(button.dataset.mult);
    render();
    return;
  }
  if (action === "undo") {
    undoLast();
    return;
  }
  if (action === "open-stats") {
    ui.sheet = "stats";
    render();
    return;
  }
  if (action === "open-rules") {
    ui.sheet = "rules";
    render();
    return;
  }
  if (action === "vibrate") {
    settings.vibrate = !settings.vibrate;
    save();
    render();
    return;
  }
  if (action === "ask-end") {
    ui.sheet = null;
    ask("Avsluta matchen?", "Den som har flest legs vinner. Lika många blir oavgjort.", "Avsluta", () => {
      withUndo(endMatch);
    });
    return;
  }
  if (action === "next-leg") {
    withUndo(startNextLeg);
    return;
  }
  if (action === "end-visit") {
    withUndo(endVisit);
    return;
  }
  if (action === "open-manual") {
    ui.manual = { score: "", darts: 3, finish: null };
    ui.sheet = "manual";
    render();
    return;
  }
  if (action === "digit") {
    ui.manual.score = `${ui.manual.score}${button.dataset.digit}`.replace(/^0+(?=\d)/, "").slice(0, 3);
    ui.manual.finish = null;
    render();
    return;
  }
  if (action === "manual-back") {
    ui.manual.score = ui.manual.score.slice(0, -1);
    ui.manual.finish = null;
    render();
    return;
  }
  if (action === "clear-score") {
    ui.manual.score = "";
    ui.manual.finish = null;
    render();
    return;
  }
  if (action === "darts") {
    ui.manual.darts = Number(button.dataset.darts);
    ui.manual.finish = null;
    render();
    return;
  }
  if (action === "finish") {
    ui.manual.finish = button.dataset.finish;
    render();
    return;
  }
  if (action === "save-manual") {
    const draft = { ...ui.manual, scored: ui.manual.score === "" ? "" : Number(ui.manual.score) };
    withUndo((state) => applyManual(state, draft));
    return;
  }
  if (action === "mark-bust") {
    withUndo((state) => applyBust(state, ui.manual.darts));
    return;
  }
  if (action === "hit" || action === "miss" || action === "bull") {
    const now = Date.now();
    if (now - lastHit < 140) return;
    lastHit = now;
    const dart = action === "miss"
      ? createDart(0)
      : action === "bull"
        ? createDart(25, Number(button.dataset.mult))
        : createDart(Number(button.dataset.sector), ui.mult);
    withUndo((state) => applyDart(state, dart));
  }
}

function onInput(event) {
  const target = event.target;
  if (target.dataset.name != null) {
    const index = Number(target.dataset.name);
    ui.setup.names[index] = target.value;
    const starter = document.querySelector(`[data-action="starter"][data-index="${index}"]`);
    if (starter) starter.textContent = target.value.trim() || `Spelare ${index + 1}`;
    return;
  }
  if (target.dataset.custom != null) {
    ui.setup.custom = target.value.replace(/[^\d]/g, "").slice(0, 4);
    target.value = ui.setup.custom;
    ui.setup.score = "custom";
    document.querySelectorAll("[data-action='score']").forEach((chip) => chip.classList.remove("is-on"));
    target.classList.add("is-on");
  }
}

function onKey(event) {
  if (event.target.matches("input, textarea")) return;
  if (event.key === "Escape") {
    ui.sheet = null;
    ui.confirm = null;
    clearFlash();
    render();
    return;
  }
  if (ui.sheet === "manual") {
    if (/^\d$/.test(event.key)) {
      ui.manual.score = `${ui.manual.score}${event.key}`.replace(/^0+(?=\d)/, "").slice(0, 3);
      ui.manual.finish = null;
      render();
    } else if (event.key === "Backspace") {
      ui.manual.score = ui.manual.score.slice(0, -1);
      ui.manual.finish = null;
      render();
    } else if (event.key === "Enter") {
      const draft = { ...ui.manual, scored: ui.manual.score === "" ? "" : Number(ui.manual.score) };
      withUndo((state) => applyManual(state, draft));
    }
    return;
  }
  if (event.key === "Backspace" && match && ui.screen === "board") {
    event.preventDefault();
    undoLast();
  }
}

app.addEventListener("click", onClick);
app.addEventListener("input", onInput);
document.addEventListener("keydown", onKey);
load();
render();
