export const CHECKOUTS = [
  {
    id: "double",
    label: "Dubbel",
    hint: "Sista pilen måste vara dubbel eller bull.",
  },
  {
    id: "triple",
    label: "Trippel",
    hint: "Sista pilen måste vara trippel.",
  },
];

export const SCORE_PRESETS = [101, 301, 501, 701];

const ONE_DART = [0];
for (let sector = 1; sector <= 20; sector += 1) {
  ONE_DART.push(sector, sector * 2, sector * 3);
}
ONE_DART.push(25, 50);

const REACHABLE = [new Set([0])];
for (let darts = 1; darts <= 3; darts += 1) {
  const next = new Set();
  for (const previous of REACHABLE[darts - 1]) {
    for (const score of ONE_DART) next.add(previous + score);
  }
  REACHABLE.push(next);
}

const DARTS = [];
for (let sector = 1; sector <= 20; sector += 1) {
  DARTS.push(createDart(sector, 1), createDart(sector, 2), createDart(sector, 3));
}
DARTS.push(createDart(25, 1), createDart(25, 2));

const FINISH_RANK = {
  double: new Map([
    [40, 100],
    [32, 96],
    [36, 92],
    [24, 88],
    [20, 84],
    [16, 80],
    [50, 78],
    [8, 74],
    [28, 70],
  ]),
};

const suggestionCache = new Map();

export function createDart(sector, mult = 1) {
  if (sector === 0) return { sector: 0, mult: 1, score: 0, label: "Bom" };
  if (sector === 25) {
    const bull = mult >= 2;
    return bull
      ? { sector: 25, mult: 2, score: 50, label: "Bull" }
      : { sector: 25, mult: 1, score: 25, label: "25" };
  }
  const safe = mult === 3 ? 3 : mult === 2 ? 2 : 1;
  const score = sector * safe;
  const label = safe === 3 ? `T${sector}` : safe === 2 ? `D${sector}` : String(sector);
  return { sector, mult: safe, score, label };
}

export function isPossibleScore(score, darts) {
  if (!Number.isInteger(score) || !Number.isInteger(darts)) return false;
  if (darts < 1 || darts > 3) return false;
  return REACHABLE[darts].has(score);
}

export function isValidFinish(dart, checkout, allowSingle = false) {
  if (!dart || dart.score <= 0) return false;
  if (allowSingle && dart.mult === 1) return true;
  if (checkout === "none") return true;
  if (checkout === "double") {
    return dart.mult === 2 && (dart.sector === 25 || (dart.sector >= 1 && dart.sector <= 20));
  }
  if (checkout === "triple") return dart.mult === 3 && dart.sector >= 1 && dart.sector <= 20;
  return false;
}

export function canBustThisVisit(remaining, checkout) {
  if (!Number.isInteger(remaining) || remaining <= 0) return false;
  if (checkout === "double") return remaining <= 181;
  return remaining <= 179;
}

export function shouldOfferWriteIn(state) {
  return state.phase === "play"
    && state.darts.length === 0
    && canBustThisVisit(state.visitStart, state.checkout);
}

export function createMatch({ names, startScore, checkout, legsToWin = null, starter = 0, legStart = "alternate", loa = false }) {
  if (!Array.isArray(names) || names.length < 1 || names.length > 8) {
    throw new Error("Antal spelare måste vara 1–8.");
  }
  if (!Number.isInteger(startScore) || startScore < 2 || startScore > 1001) {
    throw new Error("Startpoäng måste vara 2–1001.");
  }
  if (checkout !== "double" && checkout !== "triple" && checkout !== "none") {
    throw new Error("Ogiltig utgång.");
  }
  if (legsToWin != null && (!Number.isInteger(legsToWin) || legsToWin < 1 || legsToWin > 15)) {
    throw new Error("Ogiltigt legantal.");
  }
  const players = names.map((name, index) => ({
    name: String(name || "").trim() || `Spelare ${index + 1}`,
    legs: 0,
    darts: 0,
    points: 0,
    best: 0,
    stars: 0,
  }));
  const starterIndex = ((starter % players.length) + players.length) % players.length;
  return beginTurn({
    id: `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
    startScore,
    checkout,
    legsToWin,
    legStart: legStart === "winner" ? "winner" : "alternate",
    loa: Boolean(loa) && checkout !== "none",
    players,
    starterIndex,
    legNumber: 1,
    scores: players.map(() => startScore),
    turnIndex: 0,
    visitStart: startScore,
    darts: [],
    visitAllowSingle: false,
    visitStar: false,
    log: [],
    phase: "play",
    legWinner: null,
    matchWinner: null,
    tie: false,
  }, 0);
}

export function currentPlayerIndex(state) {
  return (state.starterIndex + state.turnIndex) % state.players.length;
}

export function formatAverage(value) {
  if (value == null || Number.isNaN(value)) return "–";
  return value.toFixed(1).replace(".", ",");
}

export function playerStats(state, index) {
  let points = state.players[index].points;
  let darts = state.players[index].darts;
  if (state.phase === "play" && currentPlayerIndex(state) === index) {
    darts += state.darts.length;
    const gained = state.visitStart - state.scores[index];
    if (gained > 0) points += gained;
  }
  return {
    points,
    darts,
    average: darts ? (points / darts) * 3 : null,
    best: state.players[index].best,
    legs: state.players[index].legs,
  };
}

export function checkoutLabel(checkout) {
  return CHECKOUTS.find((item) => item.id === checkout)?.label ?? checkout;
}

export function bustDetail(reason, checkout, allowSingle = false) {
  if (reason === "finish") {
    if (allowSingle && checkout === "double") return "Fel krav — den här rundan går enkel, dubbel eller bull.";
    if (allowSingle && checkout === "triple") return "Fel krav — den här rundan går enkel eller trippel.";
    if (checkout === "double") return "Fel krav — måste gå ut på dubbel eller bull.";
    if (checkout === "triple") return "Fel krav — måste gå ut på trippel.";
    return "Fel krav.";
  }
  if (reason === "stuck") return "1 poäng kvar går inte att gå ut på.";
  if (reason === "over") return "För högt. Rundan stryks.";
  return "Rundan stryks.";
}

export function applyDart(state, dart) {
  if (state.phase !== "play") return { state, event: null };
  const player = currentPlayerIndex(state);
  const remaining = state.scores[player];
  const next = remaining - dart.score;
  const darts = [...state.darts, dart];
  const allowSingle = Boolean(state.visitAllowSingle);

  if (next < 0) return bust(state, player, darts, "over");
  if (next === 0 && !isValidFinish(dart, state.checkout, allowSingle)) return bust(state, player, darts, "finish");
  if (state.checkout === "double" && next === 1 && !allowSingle) return bust(state, player, darts, "stuck");

  const scores = state.scores.slice();
  scores[player] = next;
  if (next === 0) {
    return {
      state: commitVisit({ ...state, scores }, {
        player,
        labels: darts.map((item) => item.label),
        darts: darts.length,
        total: state.visitStart,
        left: 0,
        result: "checkout",
      }),
      event: { type: "checkout", player },
    };
  }
  if (darts.length >= 3) {
    return {
      state: commitVisit({ ...state, scores }, {
        player,
        labels: darts.map((item) => item.label),
        darts: darts.length,
        total: state.visitStart - next,
        left: next,
        result: "score",
      }),
      event: { type: "score", player },
    };
  }
  const open = { ...state, scores, darts };
  return { state: markStar(open, next), event: { type: "dart", player } };
}

export function endVisit(state) {
  if (state.phase !== "play" || state.darts.length === 0) return { state, event: null };
  const player = currentPlayerIndex(state);
  const left = state.scores[player];
  return {
    state: commitVisit(state, {
      player,
      labels: state.darts.map((item) => item.label),
      darts: state.darts.length,
      total: state.visitStart - left,
      left,
      result: "score",
    }),
    event: { type: "score", player },
  };
}

export function describeManual({ remaining, checkout, scored, darts, finish, allowSingle = false }) {
  if (scored === "" || scored == null) return { status: "empty", message: "Skriv in poängen." };
  const value = Number(scored);
  if (!Number.isInteger(value) || value < 0 || value > 180) {
    return { status: "invalid", message: "Skriv en poäng mellan 0 och 180." };
  }
  if (!isPossibleScore(value, darts)) {
    return { status: "invalid", message: `${value} går inte med ${darts} ${darts === 1 ? "pil" : "pilar"}.` };
  }
  if (value > remaining) {
    return { status: "bust", reason: "over", message: "Tjock — för högt. Poängen står kvar." };
  }
  const left = remaining - value;
  if (checkout === "double" && left === 1 && !allowSingle) {
    return { status: "bust", reason: "stuck", message: "Tjock — 1 går inte att lämna." };
  }
  if (left === 0) {
    if (checkout === "none") return { status: "checkout", message: "Ut!" };
    if (!finish) return { status: "need-finish", message: "Ange sista pilen. Fel krav blir tjock." };
    if (!canFinishWith(value, darts, finish)) {
      return { status: "invalid", message: "Den poängen kan inte sluta så." };
    }
    if (!finishSatisfies(finish, checkout, allowSingle)) {
      const need = allowSingle
        ? (checkout === "double" ? "enkel, dubbel eller bull" : "enkel eller trippel")
        : (checkout === "double" ? "dubbel eller bull" : "trippel");
      return { status: "bust", reason: "finish", message: `Tjock — fel krav. Måste gå ut på ${need}.` };
    }
    return { status: "checkout", message: "Ut!" };
  }
  return { status: "ok", message: `Kvar: ${left}` };
}

export function applyManual(state, input) {
  if (state.phase !== "play") return { state, error: "Rundan är inte igång." };
  if (state.darts.length) return { state, error: "Rundan har redan startat." };
  const described = describeManual({
    remaining: state.visitStart,
    checkout: state.checkout,
    scored: input.scored,
    darts: input.darts,
    finish: input.finish,
    allowSingle: Boolean(state.visitAllowSingle),
  });
  if (described.status === "invalid" || described.status === "empty" || described.status === "need-finish") {
    return { state, error: described.message };
  }
  const scored = Number(input.scored);
  const player = currentPlayerIndex(state);
  const suffix = input.finish ? ` · ${finishName(input.finish)}` : "";
  const labels = [`${scored}${suffix}`];
  if (described.status === "bust") {
    return {
      state: commitVisit(state, {
        player,
        labels,
        darts: input.darts,
        total: 0,
        left: state.visitStart,
        result: "bust",
      }),
      event: { type: "bust", reason: described.reason, player, allowSingle: Boolean(state.visitAllowSingle) },
    };
  }
  if (described.status === "checkout") {
    return {
      state: commitVisit(state, {
        player,
        labels,
        darts: input.darts,
        total: state.visitStart,
        left: 0,
        result: "checkout",
      }),
      event: { type: "checkout", player },
    };
  }
  return {
    state: commitVisit(state, {
      player,
      labels,
      darts: input.darts,
      total: scored,
      left: state.visitStart - scored,
      result: "score",
    }),
    event: { type: "score", player },
  };
}

export function applyBust(state, darts = 3) {
  if (state.phase !== "play" || state.darts.length) return { state, error: "Rundan har redan startat." };
  if (!canBustThisVisit(state.visitStart, state.checkout)) return { state, error: "Tjock är inte möjlig." };
  const count = darts === 1 || darts === 2 ? darts : 3;
  const player = currentPlayerIndex(state);
  return {
    state: commitVisit(state, {
      player,
      labels: ["Tjock"],
      darts: count,
      total: 0,
      left: state.visitStart,
      result: "bust",
    }),
    event: { type: "bust", reason: "marked", player },
  };
}

export function startNextLeg(state) {
  if (state.phase !== "leg") return { state, event: null };
  const starterIndex = state.legStart === "winner"
    ? state.legWinner
    : (state.starterIndex + 1) % state.players.length;
  return {
    state: beginTurn({
      ...state,
      starterIndex,
      legNumber: state.legNumber + 1,
      scores: state.players.map(() => state.startScore),
      players: state.players.map((player) => ({ ...player, stars: 0 })),
      legWinner: null,
    }, 0),
    event: { type: "leg" },
  };
}

export function endMatch(state) {
  if (state.phase === "match") return { state, event: null };
  const top = Math.max(...state.players.map((player) => player.legs));
  const leaders = state.players.map((player, index) => (player.legs === top ? index : -1)).filter((index) => index >= 0);
  return {
    state: {
      ...state,
      phase: "match",
      matchWinner: leaders.length === 1 ? leaders[0] : null,
      tie: leaders.length !== 1,
    },
    event: { type: "match" },
  };
}

export function suggestCheckout(remaining, checkout, maxDarts = 3, allowSingle = false) {
  const key = `${checkout}:${remaining}:${maxDarts}:${allowSingle ? 1 : 0}`;
  if (suggestionCache.has(key)) return suggestionCache.get(key)?.map((dart) => ({ ...dart })) ?? null;
  const path = findCheckout(remaining, checkout, maxDarts, allowSingle);
  suggestionCache.set(key, path);
  return path?.map((dart) => ({ ...dart })) ?? null;
}

export function canCheckout(remaining, checkout, dartsLeft, allowSingle = false) {
  return dartsLeft > 0 && suggestCheckout(remaining, checkout, dartsLeft, allowSingle) != null;
}

function bust(state, player, darts, reason) {
  return {
    state: commitVisit(state, {
      player,
      labels: darts.map((item) => item.label),
      darts: darts.length,
      total: 0,
      left: state.visitStart,
      result: "bust",
    }),
    event: { type: "bust", reason, player, allowSingle: Boolean(state.visitAllowSingle) },
  };
}

function commitVisit(state, visit) {
  const scores = state.scores.slice();
  scores[visit.player] = visit.left;
  const counted = visit.result === "bust" ? 0 : visit.total;
  const earned = earnedStar(state, visit);
  const players = state.players.map((player, index) => {
    if (index !== visit.player) return player;
    return {
      ...player,
      darts: player.darts + visit.darts,
      points: player.points + counted,
      best: Math.max(player.best, counted),
      visits: (player.visits || 0) + 1,
      stars: nextStars(player.stars || 0, earned),
    };
  });
  const log = [...state.log, {
    leg: state.legNumber,
    player: visit.player,
    labels: visit.labels,
    total: visit.result === "bust" ? 0 : visit.total,
    result: visit.result,
    darts: visit.darts,
    star: Boolean(state.loa && earned),
  }];
  if (visit.result === "checkout") {
    const withLegs = players.map((player, index) => (
      index === visit.player ? { ...player, legs: player.legs + 1 } : player
    ));
    const won = state.legsToWin != null && withLegs[visit.player].legs >= state.legsToWin;
    return {
      ...state,
      players: withLegs,
      scores,
      darts: [],
      log,
      phase: won ? "match" : "leg",
      legWinner: visit.player,
      matchWinner: won ? visit.player : null,
      tie: false,
    };
  }
  const turnIndex = (state.turnIndex + 1) % state.players.length;
  return beginTurn({ ...state, players, scores, log }, turnIndex);
}

function nextStars(stars, earned) {
  if (!earned) return stars;
  return Math.min(2, stars + 1);
}

function earnedStar(state, visit) {
  if (!state.loa) return false;
  return Boolean(state.visitStar) || visit.result === "checkout";
}

function beginTurn(state, turnIndex) {
  const player = (state.starterIndex + turnIndex) % state.players.length;
  const visitStart = state.scores[player];
  const allow = Boolean(state.loa) && (state.players[player].stars || 0) >= 2;
  return markStar({
    ...state,
    turnIndex,
    darts: [],
    visitStart,
    visitAllowSingle: allow,
    visitStar: false,
    phase: "play",
  }, visitStart);
}

function markStar(state, remaining) {
  if (!state.loa || state.visitStar) return state;
  if (!finishLookup(remaining, state.checkout, Boolean(state.visitAllowSingle))) return state;
  return { ...state, visitStar: true };
}

function finishName(finish) {
  if (finish === "single") return "enkel";
  if (finish === "double") return "dubbel";
  if (finish === "triple") return "trippel";
  return "";
}

function finishSatisfies(finish, checkout, allowSingle = false) {
  if (allowSingle && finish === "single") return true;
  if (checkout === "double") return finish === "double";
  if (checkout === "triple") return finish === "triple";
  return true;
}

function canFinishWith(score, darts, finish) {
  const lasts = finishScores(finish);
  for (const last of lasts) {
    if (last > score) continue;
    const rest = score - last;
    if (darts === 1) {
      if (rest === 0) return true;
      continue;
    }
    if (REACHABLE[darts - 1].has(rest)) return true;
  }
  return false;
}

function finishScores(finish) {
  if (finish === "single") return [...Array(20)].map((_, index) => index + 1).concat(25);
  if (finish === "double") return [...Array(20)].map((_, index) => (index + 1) * 2).concat(50);
  if (finish === "triple") return [...Array(20)].map((_, index) => (index + 1) * 3);
  return [];
}

function rankFinish(dart, checkout, allowSingle = false) {
  if (checkout === "double" && isValidFinish(dart, "double")) {
    return FINISH_RANK.double.get(dart.score) ?? 40 + (dart.sector === 25 ? 10 : dart.sector);
  }
  if (checkout === "triple" && isValidFinish(dart, "triple")) return 50 + dart.sector;
  if (checkout === "none") return dart.score + (dart.mult === 1 ? 0.2 : 0);
  if (allowSingle && dart.mult === 1 && dart.score > 0) return 12;
  return -1;
}

function rankSetup(dart) {
  if (dart.mult === 3) return 300 + dart.sector;
  if (dart.label === "Bull") return 220;
  if (dart.sector === 25) return 90;
  if (dart.mult === 2) return 40 + dart.sector;
  return 100 + dart.sector;
}

const bestFinish = {
  double: new Map(),
  triple: new Map(),
  none: new Map(),
};
for (const checkout of Object.keys(bestFinish)) {
  for (const dart of DARTS) {
    const rank = rankFinish(dart, checkout);
    if (rank < 0) continue;
    const previous = bestFinish[checkout].get(dart.score);
    if (!previous || rank > previous.rank) bestFinish[checkout].set(dart.score, { dart, rank });
  }
}

const bestSingle = new Map();
for (const dart of DARTS) {
  if (dart.mult !== 1 || dart.score <= 0) continue;
  const previous = bestSingle.get(dart.score);
  if (!previous || dart.sector > previous.sector) bestSingle.set(dart.score, dart);
}

function finishLookup(score, checkout, allowSingle) {
  const normal = bestFinish[checkout]?.get(score)?.dart ?? null;
  if (!allowSingle) return normal;
  return normal ?? bestSingle.get(score) ?? null;
}

function findCheckout(remaining, checkout, maxDarts, allowSingle = false) {
  if (!Number.isInteger(remaining) || remaining <= 0 || remaining > 180) return null;
  let best = null;
  let bestScore = -Infinity;
  const skipStuck = checkout === "double" && !allowSingle;
  const consider = (path) => {
    const last = path[path.length - 1];
    const finishRank = rankFinish(last, checkout, allowSingle);
    if (finishRank < 0) return;
    let score = (4 - path.length) * 10000 + finishRank * 40;
    for (let index = 0; index < path.length - 1; index += 1) score += rankSetup(path[index]);
    if (!betterPath(score, path, bestScore, best)) return;
    best = path;
    bestScore = score;
  };

  if (maxDarts >= 1) {
    const finish = finishLookup(remaining, checkout, allowSingle);
    if (finish) consider([finish]);
    if (best) return best;
  }
  if (maxDarts >= 2) {
    for (const first of DARTS) {
      const left = remaining - first.score;
      if (first.score <= 0 || left <= 0) continue;
      if (skipStuck && left === 1) continue;
      const finish = finishLookup(left, checkout, allowSingle);
      if (finish) consider([first, finish]);
    }
    if (best) return best;
  }
  if (maxDarts >= 3) {
    for (const first of DARTS) {
      const left = remaining - first.score;
      if (first.score <= 0 || left <= 0) continue;
      if (skipStuck && left === 1) continue;
      for (const second of DARTS) {
        const rest = left - second.score;
        if (second.score <= 0 || rest <= 0) continue;
        if (skipStuck && rest === 1) continue;
        const finish = finishLookup(rest, checkout, allowSingle);
        if (finish) consider([first, second, finish]);
      }
    }
  }
  return best;
}

function betterPath(score, path, bestScore, best) {
  if (!best || score > bestScore) return true;
  if (score < bestScore) return false;
  for (let index = 0; index < path.length; index += 1) {
    if (path[index].score === best[index].score) continue;
    return path[index].score > best[index].score;
  }
  return false;
}
