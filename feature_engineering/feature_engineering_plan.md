# Feature Engineering Plan — Detecting the Institutional Footprint in OIPulse Trending OI

## Objective

Turn raw Trending OI snapshots into features that expose **what large institutions are actually doing** — where they are defending, absorbing, trapping, or driving price — and hand the LLM *evidence* instead of raw cumulative numbers it has to guess from.

Two consumers of these features:

1. **You / analysis** — read the hidden pattern directly (who controls, where the walls are, is a move real or a trap).
2. **The LLM** — receives compact, pre-reasoned signals so its phase report stops hallucinating intent.

The guiding belief (matches `data/prompt.md`): **OI flow is intention, price is only confirmation, strength is conviction.** Every feature below exists to make one of those three legible.

---

## 0. Ground truth — verified field semantics (read first)

Empirically checked on a real 77-bar snapshot. This section is what makes the plan foolproof: build on verified meaning, not assumptions.

| Field | Verified meaning | Decision |
| --- | --- | --- |
| `ltp` | Underlying spot price | **Keep** — price confirmation |
| `netPCR` | Put/Call OI ratio (regime) | **Keep** — regime |
| `strength` | Net positioning oscillator (~ −110…+35 seen); 0 at open | **Keep** — conviction |
| `chngInCallOI` | **Cumulative** call-OI change from open (can fall / go negative) | **Keep, differentiate** → `d_call_oi` |
| `chngInPutOI` | **Cumulative** put-OI change from open | **Keep, differentiate** → `d_put_oi` |
| `diffInOI` | **Exactly `chngInPutOI − chngInCallOI`** (0/77 violations). `+` = put-led, `−` = call-led | **Redundant level**; keep only its sign as `oi_side` |
| `chngInDirection` | **Already = bar-over-bar Δ of `diffInOI`** = *net fresh OI flow this bar* | **Elevate** — this is the single most important raw signal; do NOT re-derive |
| `chngInDirectionPct` | % change of `diffInOI` bar-over-bar; explodes near zero | **Drop** (numerically unstable, low info) |
| `dayHLBreak` | e.g. `D.H.B. (24626.5)` / `D.L.B. (24529.2)` | **Keep, parse** → event + level |
| `directionOfChng` | Always `null` in data | **Drop (dead field)** |
| `dayHighLowDiffInOI` | Always `null` in data | **Drop (dead field)** |
| `sentiment` | Only `Bullish`/`Bearish`; provided label ≈ sign of flow | **Keep as cross-check only**, not a feature input |
| `date`, `time` | `07-08-2026`, `HH:MM:SS`, plus one `EOD` row | **Keep**; sort ascending, isolate `EOD` |

**Key consequences**
- The feed *already ships* net incremental flow (`chngInDirection`). We still split it into legs via `d_call_oi`, `d_put_oi` to tell *writing vs unwinding on each side*.
- `diffInOI` and `sentiment` carry no information beyond call/put + strength — never feed both raw and derived versions to the LLM (duplication invites overconfidence).
- Two fields are dead — any feature depending on them is impossible; don't design around them.

---

## 1. The institutional-reading model (what the features must capture)

A professional reads five things off this tape. Every feature ties back to one:

1. **Direction of intent** — who is writing (selling) options and where net OI flow points.
2. **Conviction** — how hard, vs the day's own baseline (aggressive or token).
3. **Absorption vs initiative** — is a big player *soaking* flow at a level (defense) or *driving* price (initiative)? This is the core of "hidden footprint".
4. **Location** — the price buckets where writing concentrates = the institution's line in the sand (walls / defense zones).
5. **Trap / exhaustion** — breaks that reverse, or conviction peaking as flow decelerates = smart money doing the opposite of the crowd.

If a feature doesn't sharpen one of these, it's noise and gets cut.

---

## 2. Design principles

1. **Differentiate cumulative series** — flow (Δ) reveals fresh action; levels hide flips.
2. **Normalize conviction within the day** (later across days) — "aggressive" must be relative, not an absolute OI count.
3. **Strictly causal for live features** — anything fed to the LLM per bar may use only past+current bars. Look-ahead features (acceptance, traps confirmed later) are **evaluation-only** and clearly quarantined (§7).
4. **Categorical + short scores over big numeric tables** — the LLM reasons better on `absorption@24600` than on 40 floats.
5. **Every institutional claim needs ≥2 confirming signals** (mirrors the prompt) — encode that as combined scores, not single-metric triggers.
6. **Ship the footprint detectors early** — they are the objective, not a Tier-C nicety.

---

## 3. Robustness / data-quality rules (foolproof foundation)

Handle before any feature:

- **Sort** ascending by parsed time; source is newest-first.
- **EOD row**: exclude from intraday flow (its "delta" spans the close gap); keep for a separate end-of-day summary.
- **First bar**: deltas are undefined → set to 0/NaN explicitly, never forward-fill flow.
- **Missing / irregular bars**: expected cadence ~5 min; flag gaps so a "delta" isn't silently treated as one bar when it's three.
- **Negative / cumulative OI**: expected (unwinding below open) — do not clip.
- **Redundancy guard**: recompute `diffInOI == chngInPutOI − chngInCallOI`; if it ever breaks, the feed changed — fail loud.
- **Duplicate / multi-day files**: dedupe by `(date,time)`; never mix two dates into one flow series.
- **Numeric hygiene**: divide-by-zero guards (ε) for all ratios (efficiency, PCR slopes, pct).
- **Units**: keep OI in raw counts internally; convert to millions only at the LLM-export boundary (prompt wants `M`).

---

## 4. Pipeline

```text
data/snapshots/*.json
   │  1. load → dedupe → sort asc → split intraday/EOD → gap-flag
   ▼
2. base flow      d_call_oi, d_put_oi, net_flow(=chngInDirection), d_ltp, d_pcr, d_strength, accel
   ▼
3. regime         pcr/strength/oi_side buckets + transition flags
   ▼
4. FOOTPRINT      absorption vs initiative, defense walls, flow_state, vol-selling, skew, exhaustion
   ▼
5. context        persistence, session bucket, phase-candidate score
   ▼
6. LLM payload    compact per-bar table + day synopsis + wall/level map
   ▼
   prompt.md + payload → prediction.md
```

---

## Tier A — Core flow & regime (build first, foundation)

### A1. Flow decomposition (per bar)

| Feature | Definition | Reads |
| --- | --- | --- |
| `d_call_oi` | Δ`chngInCallOI` | Fresh call writing (`+`) vs call covering (`−`) |
| `d_put_oi` | Δ`chngInPutOI` | Fresh put writing (`+`) vs put covering (`−`) |
| `net_flow` | `chngInDirection` (already provided) = `d_put_oi − d_call_oi` | Net side that gained control this bar |
| `flow_accel` | Δ`net_flow` | Institutions stepping on the gas vs easing off |
| `d_ltp`, `d_ltp_pct` | Δ price | Confirmation input |
| `d_pcr`, `d_strength` | Δ regime / Δ conviction | Regime & conviction velocity |

> `net_flow` comes straight from `chngInDirection` — validate equality once, then trust it.

### A2. Regime state + transition flags

| Feature | Definition | Reads |
| --- | --- | --- |
| `pcr_regime` | ≥1.05 bull / ≤0.95 bear / else neutral | Regime |
| `strength_regime` | signed buckets (+strong/+mild/flat/−mild/−strong) via day-relative thresholds | Conviction tier |
| `oi_side` | sign of `diffInOI`: put_led / call_led / balanced | Book ownership |
| `pcr_cross_1`, `strength_flip_0`, `oi_side_flip` | crossing flags | Regime-change triggers |
| `regime_combo` | token e.g. `PUT_LED+PCR_BULL+STR_POS` | One-token state for phase logic |

---

## Tier B — Institutional footprint detectors (the heart: hidden patterns)

This is the tier that answers *"what are the big players doing?"* Build immediately after Tier A.

### B1. Absorption vs Initiative vs Vacuum (the core footprint)

How much OI it took to move price 1 point separates a defending whale from a thin drift.

| Feature | Definition | Institutional read |
| --- | --- | --- |
| `oi_per_point` | `|net_flow| / max(|d_ltp|, ε)` | High = heavy hands; low = thin tape |
| `move_class` | terciles of `|net_flow|` × `|d_ltp|` (day-relative) | see matrix below |

`move_class` matrix:

| Net flow | Price move | Class | Meaning |
| --- | --- | --- | --- |
| High | Low | **ABSORPTION** | Big player soaking flow at a level → defense / accumulation footprint |
| High | High (aligned) | **INITIATIVE** | Institution actively driving price → trend leg |
| Low | High | **VACUUM** | Thin/retail/news move, no institutional backing → fade risk |
| Low | Low | **INVENTORY** | Balancing / quiet |

This single feature is the biggest lever for "hidden pattern": absorption is exactly where big players hide.

### B2. Flow-state matrix (writing vs unwinding × price) — long/short build-up logic

Cross each leg's Δ sign with price direction:

| Condition | `flow_state` | Institutional read |
| --- | --- | --- |
| put writing (`d_put_oi>0`) + price ↑ | `bull_initiative` | Real bid; put writers defending higher |
| call writing (`d_call_oi>0`) + price ↓ | `bear_initiative` | Real offer; call writers capping |
| put unwinding (`d_put_oi<0`) + price ↓ | `bull_capitulation` | Bulls abandoning → bearish |
| call unwinding (`d_call_oi<0`) + price ↑ | `short_covering` | Weaker up-move, prone to fade |
| both writing | `vol_selling` (see B4) | Range / premium selling |
| both unwinding | `two_sided_unwind` | Square-off (esp. EOD) |

Emit `flow_state` + `flow_state_confidence` (magnitude vs day percentile). Feeds prompt's **Institutional Activity** with intent, not just "OI increased".

### B3. Defense walls / repeated-level detection (finds THE big-player level)

Where writing concentrates by price is where institutions drew a line.

- Bucket price into bins (e.g. 10-pt). Accumulate **put-writing** and **call-writing** per bin across the day.
- `put_wall` = bin with max cumulative put writing → institutional **support** they defend.
- `call_wall` = bin with max cumulative call writing → institutional **resistance / cap**.
- `defense_revisits` = times price returned to a wall bin *and* same-side writing re-expanded → each revisit is hard evidence of a real defender.
- `wall_break` = price accepted beyond a wall while that side unwinds → the defender capitulated (regime change).

Directly powers **Levels** and **Big Player** with *evidence counts*, which is what stops the model inventing zones.

### B4. Volatility-selling vs directional conviction

| Feature | Definition | Read |
| --- | --- | --- |
| `both_writing` | `d_call_oi>0 & d_put_oi>0` | Straddle/strangle sellers present |
| `vol_selling` | `both_writing` + small `|d_ltp|` (day-relative) | Premium selling / range creation, NOT directional |
| `skew_pressure` | `(d_put_oi − d_call_oi)` normalized by total writing | Which side institutions lean → forming directional bet |

Prevents the classic error of tagging two-sided build as bullish/bearish.

### B5. Exhaustion / climax (smart money vs the crowd)

| Feature | Definition | Read |
| --- | --- | --- |
| `strength_extreme` | `|strength|` at day-max percentile | Conviction stretched |
| `flow_decel` | `net_flow` same sign but `flow_accel` flips against it | Drivers easing while price still runs |
| `exhaustion_flag` | `strength_extreme` **and** `flow_decel` | Trend running on fumes → reversal watch |

### B6. Conviction persistence

| Feature | Definition | Read |
| --- | --- | --- |
| `flow_run` | run length of same-sign `net_flow` | Sustained one-way institutional pressure |
| `cum_session_flow` | cumulative `net_flow` (≈ `diffInOI`) | Net day positioning anchor |
| `oi_intensity_z` | z-score of `|net_flow|` vs day so far | Objective "aggressive" |

---

## Tier C — Context & phase scaffolding (build third)

### C1. Structural levels

`session_high/low`, `dist_to_high/low` (pts & %), `range_high/low` (local swing envelope). Combine with B3 walls so "levels" are OI-backed, not just price extremes.

### C2. Session context

`mins_from_open`, `session_bucket` (open/mid/power/close), `eod_squareoff_flag` (late + `two_sided_unwind`) — stops the model reading EOD covering as a bullish regime flip (a real error seen in `latest.md` Phase 6).

### C3. Phase-candidate detector (LLM scaffolding, not hard phases)

`phase_boundary_score` (0–1) from: regime transition flags (A2) + `flow_state` change (B2) + `wall_break` (B3) + HL event (§7). Emit `is_phase_candidate` + `candidate_reason` (e.g. `PCR_CROSS+STR_FLIP+CALL_WALL_BREAK`). Requiring ≥2 confirmations enforces the prompt's "fewer meaningful phases" rule objectively.

---

## Tier D — Cross-day & statistical rigor (later, once single-day is solid)

- **Multi-day baselines**: typical open strength, normal PCR path, average writing pace → makes "aggressive" comparable across days (upgrade the within-day z-scores of B6/B1).
- **Change-point detection** (`ruptures` PELT / binary segmentation on `net_flow`/`strength`) → statistically defensible phase boundaries to validate C3.
- **Wall persistence across days**: repeated defense of the same strike zone over sessions = a standing institutional level.

**Cut from scope** (was noise for this objective): sequence embeddings, generic regime clustering, strike/IV features (not in the feed). Revisit only if the JSON gains strike-level data.

---

## 5. Causality / leakage guard (critical for "live thinking")

The prompt forbids justifying a phase with future events. Therefore:

- **Live (LLM-facing) features**: only past+current bar. Break handling is *"break not yet accepted"* — we do NOT tell the model it held.
- **Evaluation-only (quarantined) features** — never in the per-bar LLM payload, only for scoring/backtests:
  - `hl_accepted_next_k`, `hl_rejected_next_k` (needs future bars)
  - `bull_trap` / `bear_trap` (break then reversal + opposite writing) — confirmable only in hindsight
- Any as-of feature that peeks forward must be suffixed `_eval` and stripped before export. This separation is the difference between a real edge and a backtest illusion.

---

## 6. LLM payload format (after features exist)

Do **not** dump raw cumulative JSON or 40 columns. Provide three compact artifacts:

**(a) Per-bar signal table** (only decision columns):

```text
time | ltp | d_ltp | pcr | strength | net_flow(M) | flow_state | move_class | oi_side | poi | hl | cand
09:20|24592| +0   |1.00 |  0       | +0.00       | open_bal    | INVENTORY | balanced | -  | - | -
09:25|24612| +20  |1.13 | +12      | +1.87       | bull_init   | INITIATIVE| put_led  | ✓  |DHB| 1
```

**(b) Wall / level map** (B3):

```json
{"put_wall": 24600, "put_wall_revisits": 3,
 "call_wall": 24620, "call_wall_revisits": 4,
 "walls_broken": [{"time":"10:10","side":"put","level":24600}]}
```

**(c) Day synopsis**:

```json
{"n_bars":77,"pcr_crosses":["10:10"],"strength_flips":["10:15"],
 "dhb_times":["09:25","09:50","10:00"],"dlb_times":["14:15"],
 "phase_candidates":[{"time":"10:10","reason":"PCR_CROSS+STR_FLIP+CALL_WRITE"}],
 "eod_squareoff":true}
```

Feed the LLM: `prompt.md` + (a)+(b)+(c). Never the raw redundant fields.

---

## 7. Validation (how we know it detects institutions, not noise)

1. **Footprint sanity** — on the `2026-08-08` snapshot, `put_wall`/`call_wall` and `absorption` bars should sit at the levels named in `data/predictions/latest.md` (support 24590–24600, resistance 24620–24626, day-low absorption ~24530). If walls don't match a human read, the detector is wrong.
2. **Boundary alignment** — `is_phase_candidate` should cluster near the human phase cuts (~10:05, 11:55, 12:30, 14:10, 14:25), not scatter every bar.
3. **Ablation** — same model+prompt, three inputs: raw JSON / +Tier A / +Tier A–C footprint. Score: phase count sanity, transition quality, and specific error rates.
4. **Error taxonomy to drive** ↓: oversplit phases, EOD-cover-as-bullish, DHB misread as acceptance, VACUUM move called institutional.

---

## 8. Implementation order

| Step | Deliverable | Status |
| --- | --- | --- |
| 0 | `feature_engineering/` + uv venv + packages | done |
| 1 | This plan | done |
| 2 | Notebook: load/dedupe/sort, verify field semantics (§0), gap-flag | next |
| 3 | Tier A flow + regime → `src/features_core.py` | pending |
| 4 | Tier B footprint (absorption, flow_state, walls) → `src/footprint.py` | pending |
| 5 | Charts: price + walls + absorption/initiative overlay vs `latest.md` | pending |
| 6 | Tier C phase candidates + LLM payload export | pending |
| 7 | Ablation experiment: raw vs enriched prompt | pending |
| 8 | (later) Tier D cross-day baselines + change-point | pending |

---

## 9. Package stack (installed via uv)

- `pandas`, `numpy` — wrangling & deltas
- `matplotlib`, `seaborn` — wall / absorption / regime visuals
- `scipy`, `scikit-learn` — slopes, z-scores, later change-point/baselines
- (later) `ruptures` — change-point detection for Tier D
- `jupyter` / `jupyterlab` / `ipykernel`

```bash
cd feature_engineering
source .venv/bin/activate   # or: uv run jupyter lab
```

---

## 10. First actions next session

1. In the notebook, **assert** the §0 semantics on the latest snapshot (redundancy, dead fields, `chngInDirection == Δ diffInOI`) — fail loud if broken.
2. Build Tier A `d_*`, `net_flow`, `flow_accel`.
3. Build B1 `move_class` + B2 `flow_state` + B3 walls.
4. Plot price with `put_wall`/`call_wall` lines and color bars by `move_class`; eyeball against `latest.md`.
5. Only after the footprint visually matches a human read, wire the LLM payload export.
