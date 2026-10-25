// Runs 8 scenarios against the REAL ShiftProof contract (local Hardhat network)
// using data/sim.json, and writes dashboard/results.json for the dashboard.
const hre = require("hardhat");
const { ethers } = hre;
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const fs = require("fs");

const sim = JSON.parse(fs.readFileSync("data/sim.json"));
const METER = ethers.encodeBytes32String("METER-1");
const hashDay = (d, arr) => ethers.solidityPackedKeccak256(["bytes32", "uint32", "uint32[24]"], [METER, d, arr]);
const baselineOf = (hist) => Array.from({ length: 24 }, (_, h) => Math.floor(hist.reduce((s, r) => s + r[h], 0) / 4));
const scaleEvening = (arr, k) => arr.map((v, h) => (h >= 18 && h <= 21 ? Math.round(v * k) : v));

async function run(sc) {
  const [, oracle, operator, user] = await ethers.getSigners();
  const sp = await (await ethers.getContractFactory("ShiftProof")).deploy(oracle.address, operator.address);
  const A = (d, arr) => sp.connect(oracle).anchorDay(METER, d, hashDay(d, arr));
  for (let i = 0; i < 4; i++) if (sim.historyDays[i] !== sc.lateDay) await A(sim.historyDays[i], sim.history[i]);
  for (const [d, arr] of sc.decoys || []) await A(d, arr);
  const deadline = (await time.latest()) + 86400;
  await sp.connect(operator).announceEvent(1, sim.eventDay, sim.eligibleMask, sim.capWh, deadline);
  if (sc.lateDay) await A(sc.lateDay, sim.history[sim.historyDays.indexOf(sc.lateDay)]);
  await A(sim.eventDay, sc.anchoredActual || sim.actual);
  const hist = sc.claimedHistory || sim.history, act = sc.claimedActual || sc.anchoredActual || sim.actual;
  const out = { id: sc.id, title: sc.title, story: sc.story, attack: !!sc.attack,
    anchoredBaseline: baselineOf(sim.history), claimedBaseline: baselineOf(hist),
    actual: act, eligibleHours: sim.eligibleHours, capWh: sim.capWh };
  try {
    await sp.connect(user).settle(1, METER, hist, act);
    if (sc.double) await sp.connect(user).settle(1, METER, hist, act);
    out.outcome = { status: "rewarded", rewardWh: Number(await sp.rewardWh(1, METER)) };
  } catch (e) {
    const m = e.message.match(/custom error '([^'(]+)\(([^)]*)\)'/);
    const name = e.revert?.name || (m && m[1]) || "Reverted";
    const args = e.revert?.args?.length ? e.revert.args.map(String) : m && m[2] ? m[2].split(",").map((x) => x.trim()) : [];
    out.outcome = { status: "rejected", error: name, args };
    if (sc.double) out.outcome.firstRewardWh = Number(await sp.rewardWh(1, METER));
  }
  return out;
}

(async () => {
  const H = sim.history, rebound = sim.actual.map((v, h) => (h <= 5 ? v + 700 : v));
  const noShift = sim.baseline.slice();
  const decoyDays = [99, 98, 97, 96].map((d) => [d, scaleEvening(H[0], 1.8)]);
  const edited = H.map((r) => r.slice()); edited[2] = scaleEvening(edited[2], 1.4);
  const scenarios = [
    { id: 1, title: "Honest shift", story: "Evening load moved into solar hours. Rules apply the fixed baseline." },
    { id: 2, title: "Inflated baseline", attack: true, story: "User claims a bigger 'normal' evening (+80%) to fake savings.", claimedHistory: H.map((r) => scaleEvening(r, 1.8)) },
    { id: 3, title: "Edited history", attack: true, story: "User edits one old day (+40% evening) after seeing the event rules.", claimedHistory: edited },
    { id: 4, title: "Fake savings", attack: true, story: "Meter shows no shift, but the user submits readings with a big shift.", anchoredActual: noShift, claimedActual: sim.actual },
    { id: 5, title: "Cherry-picked days", attack: true, story: "User submits high-usage decoy days instead of the required weekdays.", decoys: decoyDays, claimedHistory: [1, 2, 3, 4].map(() => scaleEvening(H[0], 1.8)) },
    { id: 6, title: "Duplicate claim", attack: true, story: "User settles the same event twice.", double: true },
    { id: 7, title: "Late-anchored history", attack: true, story: "History day anchored after the event was announced.", lateDay: sim.historyDays[3] },
    { id: 8, title: "Rebound", story: "User shifts load but also uses more energy overall, so the reward shrinks.", anchoredActual: rebound },
  ];
  const results = [];
  for (const sc of scenarios) { const r = await run(sc); results.push(r); console.log(r.id, r.title, JSON.stringify(r.outcome)); }
  fs.writeFileSync("dashboard/results.json", JSON.stringify({ sim: { eligibleHours: sim.eligibleHours, forecastWh: sim.forecastWh, solarActualWh: sim.solarActualWh, metrics: sim.metrics, capWh: sim.capWh, eventDay: sim.eventDay }, results }));
})();
