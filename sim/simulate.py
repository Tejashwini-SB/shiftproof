"""ShiftProof off-chain simulation (SIMULATED data, clearly labelled).
1) hourly campus load (Wh) with weekday patterns
2) solar generation + ML forecast (the AI advisor: recommends eligible hours)
3) robust anomaly flag for suspicious history days
Writes data/sim.json, which the contract scenarios and dashboard use."""
import json, numpy as np
from pathlib import Path
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score

# Always write to <repo_root>/data/sim.json regardless of where the script is run from
OUT_PATH = Path(__file__).parent.parent / "data" / "sim.json"


rng = np.random.default_rng(42)
EVENT_DAY, HIST = 100, [93, 86, 79, 72]
DAYS = list(range(0, 101))

def load_day(d):
    a = np.full(24, 1000.0)
    a[6:9] += 400 + 60 * (d % 7)          # weekday-dependent morning load
    a[18:22] += 3000 + 120 * (d % 7)      # flexible evening load (pump + EV charging)
    return a + rng.normal(0, 40, 24)

CLOUD = {d: float(np.clip(rng.beta(2, 5), 0, 0.7)) for d in DAYS}
def solar_day(d):
    h = np.arange(24)
    clear = np.clip(np.sin(np.pi * (h - 6) / 12), 0, None)
    return 7000 * clear * (1 - CLOUD[d])  # Wh

# ---- AI advisor: solar forecast from hour + forecast cloud cover ----
def feats(d):
    h = np.arange(24)
    cf = np.clip(CLOUD[d] + rng.normal(0, 0.06), 0, 1)  # noisy cloud FORECAST
    return np.c_[h, np.full(24, cf), np.sin(np.pi * (h - 6) / 12).clip(0)]
train, test = [d for d in DAYS if d < 93], [d for d in DAYS if 93 <= d < 100]
Xtr = np.vstack([feats(d) for d in train]); ytr = np.concatenate([solar_day(d) for d in train])
Xte = np.vstack([feats(d) for d in test]);  yte = np.concatenate([solar_day(d) for d in test])
model = GradientBoostingRegressor(random_state=0).fit(Xtr, ytr)
mae, r2 = mean_absolute_error(yte, model.predict(Xte)), r2_score(yte, model.predict(Xte))
pred = model.predict(feats(EVENT_DAY)).clip(0)

# ---- history, baseline (same fixed rule as the contract), eligible hours ----
hist = [np.round(load_day(d)).astype(int) for d in HIST]
baseline = (sum(h.astype(int) for h in hist)) // 4
nonflex = baseline.copy(); nonflex[18:22] = 1000
surplus = pred - nonflex
eligible = sorted(int(h) for h in np.argsort(-surplus)[:4])
mask = sum(1 << h for h in eligible)

# honest actual: move 60% of the evening flexible load into the eligible hours
actual = baseline.copy().astype(int)
moved = int(0.6 * (baseline[18:22].sum() - 4000)) // 4  # per evening hour
for h in range(18, 22): actual[h] -= moved
for h in eligible: actual[h] += moved
actual = actual + np.round(rng.normal(0, 20, 24)).astype(int)
actual = np.clip(actual, 0, None)

# ---- anomaly flag: robust z-score vs same-weekday totals (injected test) ----
tot = {d: float(load_day(d).sum()) for d in DAYS}
inj = {d: tot[d] * 1.4 for d in (62, 76, 83, 90)}   # injected inflation (+40%)
tot.update(inj)
def flagged(d):
    peers = [tot[p] for p in range(d - 49, d, 7) if p in tot]
    med = np.median(peers); mad = np.median(np.abs(np.array(peers) - med)) or 1.0
    return abs(tot[d] - med) > max(3.5 * 1.4826 * mad, 0.15 * med)  # robust z, with a 15% floor
cand = [d for d in DAYS if d >= 56]
tp = sum(flagged(d) for d in cand if d in inj); fp = sum(flagged(d) for d in cand if d not in inj)
fn = sum((not flagged(d)) for d in cand if d in inj)

prec = tp / (tp + fp) if tp + fp else 1.0; rec = tp / (tp + fn) if tp + fn else 1.0
out = dict(
  eventDay=EVENT_DAY, historyDays=HIST, eligibleHours=eligible, eligibleMask=mask, capWh=10000,
  history=[h.tolist() for h in hist], actual=actual.tolist(), baseline=baseline.tolist(),
  forecastWh=np.round(pred).tolist(), solarActualWh=np.round(solar_day(EVENT_DAY)).tolist(),
  metrics=dict(forecast_mae_wh=round(float(mae), 1), forecast_r2=round(float(r2), 3),
               anomaly_tp=int(tp), anomaly_fp=int(fp), anomaly_fn=int(fn), anomaly_precision=round(prec, 2), anomaly_recall=round(rec, 2),
               note="simulated data; anomalies were injected by us, so this is a sanity check, not real-world accuracy"))
json.dump(out, open(OUT_PATH, "w"))
print("eligible hours:", eligible, "mask:", mask)
print("forecast MAE (Wh):", out["metrics"]["forecast_mae_wh"], "R2:", out["metrics"]["forecast_r2"])
print("anomaly TP/FP/FN:", tp, fp, fn, "precision", round(prec,2), "recall", round(rec,2))
print("baseline evening:", baseline[18:22].tolist(), "actual evening:", actual[18:22].tolist())
