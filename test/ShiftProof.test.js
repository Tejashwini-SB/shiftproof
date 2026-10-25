const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// ---------- shared test data (all values in Wh) ----------
const METER = ethers.encodeBytes32String("METER-1");
const EVENT_DAY = 100;
const HIST_DAYS = [93, 86, 79, 72]; // eventDay - 7, -14, -21, -28 (same weekday)
const MASK = (1 << 11) | (1 << 12) | (1 << 13) | (1 << 14); // eligible solar hours 11:00-14:59
const CAP = 10000;

// canonical hash: keccak256(abi.encodePacked(bytes32 meterId, uint32 dayId, uint32[24] readings))
const hashDay = (day, arr) =>
  ethers.solidityPackedKeccak256(["bytes32", "uint32", "uint32[24]"], [METER, day, arr]);

// Normal day: 1000 Wh every hour, 4000 Wh in the evening (18-21). Total = 36,000 Wh.
function baseDay() {
  const a = Array(24).fill(1000);
  for (let h = 18; h <= 21; h++) a[h] = 4000;
  return a;
}
// Honest shift: evening drops to 2000, solar hours (11-14) rise to 3000. Total unchanged.
function honestActual() {
  const a = baseDay();
  for (let h = 18; h <= 21; h++) a[h] = 2000;
  for (let h = 11; h <= 14; h++) a[h] = 3000;
  return a;
}
const history = () => HIST_DAYS.map(() => baseDay());

async function deploy() {
  const [, oracle, operator, user] = await ethers.getSigners();
  const Factory = await ethers.getContractFactory("ShiftProof");
  const sp = await Factory.deploy(oracle.address, operator.address);
  return { sp, oracle, operator, user };
}
async function anchorHistory(f, days = HIST_DAYS) {
  for (const d of days) await f.sp.connect(f.oracle).anchorDay(METER, d, hashDay(d, baseDay()));
}
async function announce(f, cap = CAP) {
  const deadline = (await time.latest()) + 86400;
  await f.sp.connect(f.operator).announceEvent(1, EVENT_DAY, MASK, cap, deadline);
}
async function anchorActual(f, arr) {
  await f.sp.connect(f.oracle).anchorDay(METER, EVENT_DAY, hashDay(EVENT_DAY, arr));
}
// full happy-path setup, ready for settle()
async function scenario({ cap = CAP, actual = honestActual() } = {}) {
  const f = await deploy();
  await anchorHistory(f);
  await announce(f, cap);
  await anchorActual(f, actual);
  return f;
}

describe("ShiftProof", () => {
  it("1. honest shift is rewarded (8,000 Wh)", async () => {
    const f = await scenario();
    await expect(f.sp.connect(f.user).settle(1, METER, history(), honestActual()))
      .to.emit(f.sp, "Settled")
      .withArgs(1, METER, 8000);
    expect(await f.sp.rewardWh(1, METER)).to.equal(8000n);
  });

  it("2. reward is capped at the event cap", async () => {
    const f = await scenario({ cap: 5000 });
    await f.sp.connect(f.user).settle(1, METER, history(), honestActual());
    expect(await f.sp.rewardWh(1, METER)).to.equal(5000n);
  });

  it("3. rebound (higher total use) reduces the reward", async () => {
    const actual = honestActual();
    for (let h = 0; h <= 5; h++) actual[h] += 500; // +3000 Wh extra overall
    const f = await scenario({ actual });
    await f.sp.connect(f.user).settle(1, METER, history(), actual);
    expect(await f.sp.rewardWh(1, METER)).to.equal(5000n); // 8000 - 3000
  });

  it("4. inflated baseline is rejected", async () => {
    const f = await scenario();
    const inflated = baseDay();
    for (let h = 18; h <= 21; h++) inflated[h] = 8000; // claims a bigger "normal" evening
    await expect(
      f.sp.connect(f.user).settle(1, METER, [inflated, inflated, inflated, inflated], honestActual())
    )
      .to.be.revertedWithCustomError(f.sp, "HashMismatch")
      .withArgs(93);
  });

  it("5. altered history reading is rejected", async () => {
    const f = await scenario();
    const h = history();
    h[2][20] += 1; // edit one hour of the day-79 record
    await expect(f.sp.connect(f.user).settle(1, METER, h, honestActual()))
      .to.be.revertedWithCustomError(f.sp, "HashMismatch")
      .withArgs(79);
  });

  it("6. duplicate settlement is rejected", async () => {
    const f = await scenario();
    await f.sp.connect(f.user).settle(1, METER, history(), honestActual());
    await expect(
      f.sp.connect(f.user).settle(1, METER, history(), honestActual())
    ).to.be.revertedWithCustomError(f.sp, "AlreadySettled");
  });

  it("7. late settlement (after deadline) is rejected", async () => {
    const f = await scenario();
    await time.increase(86400 + 10);
    await expect(
      f.sp.connect(f.user).settle(1, METER, history(), honestActual())
    ).to.be.revertedWithCustomError(f.sp, "DeadlinePassed");
  });

  it("8. history anchored AFTER the event announcement is rejected", async () => {
    const f = await deploy();
    await anchorHistory(f, [93, 86, 79]);
    await announce(f);
    await anchorHistory(f, [72]); // too late: event already announced
    await anchorActual(f, honestActual());
    await expect(f.sp.connect(f.user).settle(1, METER, history(), honestActual()))
      .to.be.revertedWithCustomError(f.sp, "HistoryAnchoredLate")
      .withArgs(72);
  });

  it("9. cherry-picked (decoy) history days are rejected", async () => {
    const f = await deploy();
    await anchorHistory(f);
    const decoy = baseDay();
    for (let h = 18; h <= 21; h++) decoy[h] = 9000; // high-usage days the user hopes to use
    for (const d of [99, 98, 97, 96]) {
      await f.sp.connect(f.oracle).anchorDay(METER, d, hashDay(d, decoy));
    }
    await announce(f);
    await anchorActual(f, honestActual());
    // contract insists on days 93/86/79/72, so decoy data cannot match
    await expect(
      f.sp.connect(f.user).settle(1, METER, [decoy, decoy, decoy, decoy], honestActual())
    )
      .to.be.revertedWithCustomError(f.sp, "HashMismatch")
      .withArgs(93);
  });

  it("10. unanchored event-day readings are rejected", async () => {
    const f = await deploy();
    await anchorHistory(f);
    await announce(f); // oracle never anchors the event day
    await expect(
      f.sp.connect(f.user).settle(1, METER, history(), honestActual())
    ).to.be.revertedWithCustomError(f.sp, "ActualNotAnchored");
  });

  it("11. missing history day is rejected", async () => {
    const f = await deploy();
    await anchorHistory(f, [93, 86, 79]); // day 72 missing
    await announce(f);
    await anchorActual(f, honestActual());
    await expect(f.sp.connect(f.user).settle(1, METER, history(), honestActual()))
      .to.be.revertedWithCustomError(f.sp, "HistoryNotAnchored")
      .withArgs(72);
  });

  it("12. access control and double anchoring", async () => {
    const f = await deploy();
    await expect(
      f.sp.connect(f.user).anchorDay(METER, 93, hashDay(93, baseDay()))
    ).to.be.revertedWithCustomError(f.sp, "NotOracle");
    const deadline = (await time.latest()) + 86400;
    await expect(
      f.sp.connect(f.user).announceEvent(1, EVENT_DAY, MASK, CAP, deadline)
    ).to.be.revertedWithCustomError(f.sp, "NotOperator");
    await f.sp.connect(f.oracle).anchorDay(METER, 93, hashDay(93, baseDay()));
    await expect(
      f.sp.connect(f.oracle).anchorDay(METER, 93, hashDay(93, baseDay()))
    ).to.be.revertedWithCustomError(f.sp, "AlreadyAnchored");
  });
});
