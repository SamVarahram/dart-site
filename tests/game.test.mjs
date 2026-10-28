import assert from "node:assert/strict";
import test from "node:test";
import {
  applyBust,
  applyDart,
  applyManual,
  canBustThisVisit,
  createDart,
  createMatch,
  currentPlayerIndex,
  describeManual,
  endMatch,
  endVisit,
  isPossibleScore,
  isValidFinish,
  playerStats,
  shouldOfferWriteIn,
  startNextLeg,
  suggestCheckout,
} from "../js/game.js";

function match(overrides = {}) {
  return createMatch({
    names: ["Anna", "Björn"],
    startScore: 501,
    checkout: "double",
    legsToWin: 2,
    ...overrides,
  });
}

test("en trippel tjugo räknas av och turen går vidare efter tre pilar", () => {
  let state = match();
  for (let i = 0; i < 3; i += 1) {
    state = applyDart(state, createDart(20, 3)).state;
  }
  assert.equal(state.scores[0], 321);
  assert.equal(state.scores[1], 501);
  assert.equal(currentPlayerIndex(state), 1);
  assert.equal(state.players[0].darts, 3);
  assert.equal(state.players[0].points, 180);
  assert.equal(state.players[0].best, 180);
  assert.equal(playerStats(state, 0).average, 180);
});

test("pilar ändrar inte tidigare tillstånd", () => {
  const state = match({ startScore: 40 });
  const snapshot = structuredClone(state);
  applyDart(state, createDart(20, 1));
  assert.deepEqual(state, snapshot);
});

test("för högt, kvar på 1 och fel utgång stryker hela rundan", () => {
  const over = applyDart(match({ startScore: 40 }), createDart(20, 3));
  assert.equal(over.event.reason, "over");
  assert.equal(over.state.scores[0], 40);
  assert.equal(over.state.players[0].points, 0);
  assert.equal(over.state.players[0].darts, 1);
  assert.equal(currentPlayerIndex(over.state), 1);

  let stuck = match({ startScore: 2 });
  stuck = applyDart(stuck, createDart(1, 1));
  assert.equal(stuck.event.reason, "stuck");
  assert.equal(stuck.state.scores[0], 2);

  const wrong = applyDart(match({ startScore: 20 }), createDart(20, 1));
  assert.equal(wrong.event.reason, "finish");
  assert.equal(wrong.state.scores[0], 20);
  assert.equal(wrong.state.phase, "play");
});

test("delträffar stryks också när sista pilen bustar", () => {
  let state = match({ startScore: 100 });
  state = applyDart(state, createDart(20, 1)).state;
  state = applyDart(state, createDart(20, 1)).state;
  assert.equal(state.scores[0], 60);
  const busted = applyDart(state, createDart(20, 3));
  assert.equal(busted.event.reason, "finish");
  assert.equal(busted.state.scores[0], 100);
  assert.equal(busted.state.players[0].darts, 3);
  assert.equal(busted.state.players[0].points, 0);
  assert.equal(currentPlayerIndex(busted.state), 1);
});

test("dubbel, trippel och inget krav avgör vem som går ut", () => {
  const doubleOut = applyDart(match({ startScore: 40 }), createDart(20, 2));
  assert.equal(doubleOut.event.type, "checkout");
  assert.equal(doubleOut.state.phase, "leg");
  assert.equal(doubleOut.state.players[0].legs, 1);
  assert.equal(doubleOut.state.players[0].darts, 1);

  const bull = applyDart(match({ startScore: 50 }), createDart(25, 2));
  assert.equal(bull.event.type, "checkout");

  const tripleOut = applyDart(match({ startScore: 60, checkout: "triple" }), createDart(20, 3));
  assert.equal(tripleOut.event.type, "checkout");

  const tripleWrong = applyDart(match({ startScore: 40, checkout: "triple" }), createDart(20, 2));
  assert.equal(tripleWrong.event.reason, "finish");

  const any = applyDart(match({ startScore: 20, checkout: "none" }), createDart(20, 1));
  assert.equal(any.event.type, "checkout");

  let early = match({ startScore: 32 });
  early = applyDart(early, createDart(16, 1)).state;
  const ended = endVisit(early);
  assert.equal(ended.state.scores[0], 16);
  assert.equal(currentPlayerIndex(ended.state), 1);
  assert.equal(ended.state.players[0].darts, 1);
});

test("skriv in blir tjock vid fel krav och ut vid rätt", () => {
  const wrong = describeManual({
    remaining: 20,
    checkout: "double",
    scored: 20,
    darts: 1,
    finish: "single",
  });
  assert.equal(wrong.status, "bust");
  assert.equal(wrong.reason, "finish");

  const applied = applyManual(match({ startScore: 20 }), {
    scored: 20,
    darts: 1,
    finish: "single",
  });
  assert.equal(applied.state.scores[0], 20);
  assert.equal(currentPlayerIndex(applied.state), 1);
  assert.equal(applied.state.log.at(-1).result, "bust");

  const right = applyManual(match({ startScore: 40, legsToWin: 1 }), {
    scored: 40,
    darts: 1,
    finish: "double",
  });
  assert.equal(right.event.type, "checkout");
  assert.equal(right.state.phase, "match");
  assert.equal(right.state.matchWinner, 0);

  const high = describeManual({ remaining: 40, checkout: "double", scored: 180, darts: 3, finish: null });
  assert.equal(high.reason, "over");
  const impossible = describeManual({ remaining: 501, checkout: "double", scored: 179, darts: 3, finish: null });
  assert.equal(impossible.status, "invalid");
});

test("skriv in erbjuds bara innan rundan och bara när tjock är möjlig", () => {
  assert.equal(canBustThisVisit(501, "double"), false);
  assert.equal(canBustThisVisit(182, "double"), false);
  assert.equal(canBustThisVisit(181, "double"), true);
  assert.equal(canBustThisVisit(180, "double"), true);
  assert.equal(canBustThisVisit(180, "triple"), false);
  assert.equal(canBustThisVisit(180, "none"), false);
  assert.equal(canBustThisVisit(179, "none"), true);
  assert.equal(canBustThisVisit(1, "triple"), true);

  const ready = match({ startScore: 40 });
  assert.equal(shouldOfferWriteIn(ready), true);
  const started = applyDart(ready, createDart(1, 1)).state;
  assert.equal(shouldOfferWriteIn(started), false);
  assert.equal(shouldOfferWriteIn(match({ startScore: 501 })), false);
});

test("markera tjock utan poäng stryker rundan", () => {
  const state = applyBust(match({ startScore: 40 }), 2).state;
  assert.equal(state.scores[0], 40);
  assert.equal(state.players[0].darts, 2);
  assert.equal(state.players[0].points, 0);
  assert.equal(currentPlayerIndex(state), 1);
});

test("legs, startspelare och matchslut", () => {
  let decided = match({ startScore: 40, legsToWin: 1 });
  decided = applyDart(decided, createDart(20, 2)).state;
  assert.equal(decided.phase, "match");
  assert.equal(decided.matchWinner, 0);

  let state = match({ startScore: 40, legsToWin: 2, legStart: "alternate" });
  state = applyDart(state, createDart(20, 2)).state;
  assert.equal(state.phase, "leg");
  assert.equal(state.players[0].legs, 1);
  state = startNextLeg(state).state;
  assert.equal(state.legNumber, 2);
  assert.equal(state.starterIndex, 1);
  assert.equal(state.scores[1], 40);
  assert.equal(currentPlayerIndex(state), 1);
  state = applyDart(state, createDart(20, 2)).state;
  assert.equal(state.phase, "leg");
  assert.equal(state.players[1].legs, 1);

  let winnerStarts = match({ startScore: 40, legsToWin: null, legStart: "winner" });
  winnerStarts = applyDart(winnerStarts, createDart(1, 1)).state;
  winnerStarts = applyDart(winnerStarts, createDart(1, 1)).state;
  winnerStarts = applyDart(winnerStarts, createDart(1, 1)).state;
  winnerStarts = applyDart(winnerStarts, createDart(20, 2)).state;
  assert.equal(winnerStarts.legWinner, 1);
  winnerStarts = startNextLeg(winnerStarts).state;
  assert.equal(winnerStarts.starterIndex, 1);

  const open = endMatch(match({ legsToWin: null }));
  assert.equal(open.state.phase, "match");
  assert.equal(open.state.tie, true);
});

test("förslag är riktiga utgångar", () => {
  assert.deepEqual(suggestCheckout(170, "double").map((dart) => dart.label), ["T20", "T20", "Bull"]);
  assert.deepEqual(suggestCheckout(167, "double").map((dart) => dart.label), ["T20", "T19", "Bull"]);
  assert.deepEqual(suggestCheckout(160, "double").map((dart) => dart.label), ["T20", "T20", "D20"]);
  assert.deepEqual(suggestCheckout(100, "double").map((dart) => dart.label), ["T20", "D20"]);
  assert.deepEqual(suggestCheckout(60, "double").map((dart) => dart.label), ["20", "D20"]);
  assert.deepEqual(suggestCheckout(50, "double").map((dart) => dart.label), ["Bull"]);
  assert.deepEqual(suggestCheckout(40, "double").map((dart) => dart.label), ["D20"]);
  assert.equal(suggestCheckout(1, "double"), null);
  assert.deepEqual(suggestCheckout(180, "triple").map((dart) => dart.label), ["T20", "T20", "T20"]);
  assert.deepEqual(suggestCheckout(60, "none").map((dart) => dart.label), ["T20"]);

  for (const checkout of ["double", "triple", "none"]) {
    for (let remaining = 2; remaining <= 170; remaining += 1) {
      const path = suggestCheckout(remaining, checkout, 3);
      if (!path) continue;
      let left = remaining;
      path.forEach((dart, index) => {
        const next = left - dart.score;
        const last = index === path.length - 1;
        if (!last) {
          assert.ok(next > 0, `${checkout} ${remaining} lämnade ${next}`);
          if (checkout === "double") assert.notEqual(next, 1);
        } else {
          assert.equal(next, 0, `${checkout} ${remaining} -> ${path.map((item) => item.label).join(" ")}`);
          assert.equal(isValidFinish(dart, checkout), true);
        }
        left = next;
      });
    }
  }

  const oneLeft = suggestCheckout(100, "double", 1);
  assert.equal(oneLeft, null);
  assert.deepEqual(suggestCheckout(40, "double", 1).map((dart) => dart.label), ["D20"]);
});

test("omöjliga tresiffriga rundor saknas", () => {
  for (const score of [163, 166, 169, 172, 173, 175, 176, 178, 179]) {
    assert.equal(isPossibleScore(score, 3), false, String(score));
  }
  assert.equal(isPossibleScore(180, 3), true);
  assert.equal(isPossibleScore(164, 3), true);
  assert.equal(isPossibleScore(170, 3), true);
  assert.equal(isPossibleScore(60, 1), true);
  assert.equal(isPossibleScore(100, 1), false);
  assert.equal(isPossibleScore(0, 3), true);
});

test("stjärna kräver att just den pilen kan gå ut", () => {
  let state = match({ startScore: 55, loa: true, legsToWin: 5 });
  assert.equal(state.visitStar, false);
  state = applyDart(state, createDart(25, 1)).state;
  assert.equal(state.scores[0], 30);
  assert.equal(state.visitStar, true);
  const busted = applyDart(state, createDart(20, 3));
  assert.equal(busted.event.reason, "over");
  assert.equal(busted.state.scores[0], 55);
  assert.equal(busted.state.players[0].stars, 1);

  state = match({ startScore: 100, loa: true });
  state = applyDart(state, createDart(20, 1)).state;
  assert.equal(state.visitStar, false);
  state = applyDart(state, createDart(20, 1)).state;
  assert.equal(state.visitStar, false);
  state = applyDart(state, createDart(20, 1)).state;
  assert.equal(state.players[0].stars, 0);
  assert.equal(state.scores[0], 40);
  state = applyDart(state, createDart(1, 1)).state;
  state = applyDart(state, createDart(1, 1)).state;
  state = applyDart(state, createDart(1, 1)).state;
  assert.equal(state.players[1].stars, 0);
  assert.equal(currentPlayerIndex(state), 0);
  assert.equal(state.visitStar, true);

  state = match({ startScore: 70, loa: true, legsToWin: 5 });
  state = applyDart(state, createDart(20, 1)).state;
  assert.equal(state.scores[0], 50);
  assert.equal(state.visitStar, true);
  state = applyDart(state, createDart(1, 1)).state;
  state = applyDart(state, createDart(1, 1)).state;
  assert.equal(state.players[0].stars, 1);
});

test("LoA ger en stjärna per runda och behåller den vid tjock", () => {
  let state = match({ startScore: 40, loa: true, legsToWin: 5 });
  assert.equal(state.visitStar, true);
  state = applyDart(state, createDart(20, 1)).state;
  assert.equal(state.scores[0], 20);
  assert.equal(state.visitStar, true);
  const busted = applyDart(state, createDart(20, 3));
  assert.equal(busted.event.reason, "over");
  assert.equal(busted.state.scores[0], 40);
  assert.equal(busted.state.players[0].stars, 1);

  state = match({ startScore: 40, loa: true });
  state = applyDart(state, createDart(1, 1)).state;
  state = applyDart(state, createDart(1, 1)).state;
  state = applyDart(state, createDart(1, 1)).state;
  assert.equal(state.players[0].stars, 1);
  assert.equal(state.scores[0], 37);

  state = match({ startScore: 501, loa: true });
  state = applyDart(state, createDart(20, 3)).state;
  state = applyDart(state, createDart(20, 3)).state;
  state = applyDart(state, createDart(20, 3)).state;
  assert.equal(state.players[0].stars, 0);
  assert.equal(state.visitStar, false);
});

test("två stjärnor ger enkel utgång resten av legget", () => {
  let state = match({ startScore: 20, loa: true, legsToWin: 5 });
  const bust = (current) => applyDart(current, createDart(20, 1)).state;
  const threeSingles = (current) => {
    let next = applyDart(current, createDart(1, 1)).state;
    next = applyDart(next, createDart(1, 1)).state;
    return applyDart(next, createDart(1, 1)).state;
  };
  state = bust(state);
  state = bust(state);
  state = bust(state);
  assert.equal(state.players[0].stars, 2);
  state = bust(state);
  assert.equal(currentPlayerIndex(state), 0);
  assert.equal(state.visitAllowSingle, true);
  assert.equal(state.players[0].stars, 2);

  state = threeSingles(state);
  assert.equal(state.players[0].stars, 2);
  assert.equal(state.scores[0], 17);
  state = threeSingles(state);
  assert.equal(currentPlayerIndex(state), 0);
  assert.equal(state.visitAllowSingle, true);
  assert.equal(state.players[0].stars, 2);
  const out = applyDart(state, createDart(17, 1));
  assert.equal(out.event.type, "checkout");
  assert.equal(out.state.players[0].stars, 2);
  assert.equal(out.state.players[0].legs, 1);

  const nextLeg = startNextLeg(out.state).state;
  assert.equal(nextLeg.players[0].stars, 0);
  assert.equal(nextLeg.players[1].stars, 0);
  assert.equal(nextLeg.visitAllowSingle, false);
  assert.equal(applyDart(nextLeg, createDart(20, 1)).event.reason, "finish");

  const stillDouble = applyDart(match({ startScore: 20, loa: true }), createDart(20, 1));
  assert.equal(stillDouble.event.reason, "finish");

  state = match({ startScore: 20, loa: true, legsToWin: 5 });
  const bustAgain = (current) => applyDart(current, createDart(20, 1)).state;
  state = bustAgain(state);
  state = bustAgain(state);
  state = bustAgain(state);
  state = bustAgain(state);
  state = applyDart(state, createDart(19, 1)).state;
  assert.equal(state.scores[0], 1);
  const one = applyDart(state, createDart(1, 1));
  assert.equal(one.event.type, "checkout");
  assert.equal(one.state.players[0].stars, 2);
});

test("LoA på trippel släpper igenom enkel först när stjärnorna räcker", () => {
  let state = match({ startScore: 21, checkout: "triple", loa: true, legsToWin: 5 });
  const bust = (current) => applyDart(current, createDart(20, 3)).state;
  state = bust(state);
  assert.equal(state.scores[0], 21);
  assert.equal(state.players[0].stars, 1);
  state = bust(state);
  state = bust(state);
  state = bust(state);
  assert.equal(state.visitAllowSingle, true);
  state = applyDart(state, createDart(1, 1)).state;
  const out = applyDart(state, createDart(20, 1));
  assert.equal(out.event.type, "checkout");
});
