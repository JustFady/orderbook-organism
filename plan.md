# Agent-Driven Build Plan v2: Organism-Only Market Replay

## Mission
Build a high-impact prototype where the full market day from `parsed_scaled/levels.csv` is shown only through a living organism.
No classic charts in the main demo view. Data must be visible through anatomy, blood flow, pulse, deformation, and state transitions.

This plan is designed for:
- 2 humans (you + teammate)
- multiple AI agents doing scoped work in parallel
- fast iteration to a visually bold demo

## Creative Thesis (Locked)
- The market is a biological entity.
- Orders are blood cells moving through vascular channels.
- Every timestamp is a heartbeat.
- Stress, liquidity, gamma, and manipulation change body behavior in real time.
- Date/time progression is part of the organism life cycle (growth, fatigue, recovery).

## Product Definition (What Exactly We Build)
1. One hero organism scene (full-screen).
2. Deterministic replay from first to last timestamp.
3. Organism-only encoding of data (no primary chart panels).
4. Health state labels: `stable`, `stressed`, `critical`.
5. Toggleable force layers:
- gamma metabolism
- manipulation spasms
- liquidity perfusion
- kinetic drift
6. Counterfactual ghost mode as a second translucent organism:
- `Observed`
- `No-Gamma`
- `No-Manipulation`

## Non-Goals (To Prevent Scope Creep)
- No heavy backend.
- No database.
- No auth.
- No streaming infra.
- No causal claims beyond model-based what-if.
- No separate "dashboard of charts" in the hero experience.

## Data-to-Biology Mapping Contract (Core)
- `mbo_total_size` -> blood volume in vessels (flow thickness)
- `mbo_order_count` -> blood cell density/particle count
- `side` -> split flow polarity (two blood chemistries)
- `future_strike` -> vessel lane index / vertical vessel routing
- `gamma_total` -> heartbeat frequency + glow intensity
- `mbo_pulling_stacking` -> vessel spasms, turbulence, micro-flicker
- `liquidity_density_factor` -> vessel radius and perfusion coverage
- `price_kinetic_factor` -> body tilt and directional drift
- `health_score` -> global organism color and stability

## Experience Flow (2-3 minute demo)
1. Calm intro: low pulse, even perfusion.
2. Stress build-up: gamma pulse rises, local spasms appear.
3. Manipulation event: turbulence spikes, flow irregularity visible.
4. Counterfactual ghost: show divergence from observed body.
5. End-state label + caveat: simulation, not causal proof.

## Creative Features Backlog

### Must-Have (P0)
- Pulsing heart core synced to replay time.
- Blood river system where order flow visibly travels.
- Stress scars: short-lived glowing marks where manipulation spikes occurred.
- Health aura ring with three states (`stable`, `stressed`, `critical`).

### High Impact (P1)
- Circadian phenotype: body appearance shifts by intraday phase.
- Memory tail: last N seconds remain as fading vascular trails.
- Arrhythmia mode: irregular heartbeat under extreme manipulation.
- Bioluminescent gamma bloom around active tissue.

### Showcase (P2)
- Twin-organism split mode (`Observed` vs counterfactual ghost).
- Vessel collapse/recovery animation at liquidity extremes.
- "Metabolic storm" event when multiple factors peak together.

## Architecture Decision: Streamlit or Not?

## Recommendation (Final Demo)
Use **React + React Three Fiber + Drei + Zustand** for the hero organism scene.

Why:
- better animation control and stable 60fps behavior
- full control over shader/material/deformation effects
- easier to produce a non-generic, high-creativity visual identity
- cleaner handling of layered scenes and ghost organism mode

## Role of Streamlit
Keep Streamlit as a **support tool only**:
- data QA/debug
- factor sanity checks
- quick internal inspection panels

Do **not** use Streamlit as the main final-render engine for this concept.

## Fallback (if timeline becomes tight)
Streamlit-only lite mode is allowed only if:
- team cannot complete React scene in time
- we accept lower visual ambition and reduced animation complexity

## Team Model

### Human A (Technical Lead)
- Owns data semantics and formulas.
- Reviews scripts and validates caveats.
- Signs off on simulation wording.

### Human B (Experience Lead)
- Owns organism behavior, visual language, interaction, narrative.
- Signs off on usability and demo quality.

### AI Agents
- Scoped per stage with clear file outputs.
- Reproducible CLI-first deliverables.

## Repository Target Structure
```text
cpsc481_project/
  parsed_scaled/
  analysis/
    cleaned/
    factors/
    counterfactual/
    replay/
  scripts/
    build_clean_features.py
    build_state_indices.py
    build_counterfactual.py
    export_replay_frames.py
  app/                        # Streamlit support/debug (not hero)
  webapp/                     # React + R3F hero organism
  docs/
    factor_definitions.md
    organism_mapping.md
    limitations.md
    demo_script.md
  plan.md
```

## Global Rules for Every Agent
- Keep everything reproducible from command line.
- Never overwrite raw data.
- Log assumptions in code comments or markdown.
- Prefer explicit data contracts over implicit behavior.
- If uncertain, default to model-based what-if.

## Stage Plan

## Stage 0: Scope Lock + Platform Gate (Half day)
Objective:
- Lock `organism-only` scope and architecture decision.

Outputs:
- `docs/organism_mapping.md` skeleton
- platform decision note in `docs/limitations.md`
- schema contract confirmation for replay frames

Acceptance checks:
- Team agrees: no chart-first UI in hero mode.
- Team agrees: React/R3F is primary, Streamlit is support.

## Stage 1: Data Audit and Cleanup (Day 1)
Objective:
- Build a stable feature layer from `parsed_scaled/levels.csv`.

Outputs:
- `scripts/build_clean_features.py`
- `analysis/cleaned/clean_features.csv`
- `analysis/cleaned/feature_pruning_report.csv`

Required fixes:
- rename `cans ll_delta` -> `call_delta`
- prune constant/duplicate/near-duplicate columns

Acceptance checks:
- script runs end-to-end
- all removed fields have documented reason

## Stage 2: Factor + Replay Frame Engine (Day 2)
Objective:
- Convert cleaned features into normalized biology factors and frame-ready replay data.

Outputs:
- `scripts/build_state_indices.py`
- `analysis/factors/state_indices.csv`
- `scripts/export_replay_frames.py`
- `analysis/replay/replay_frames.json`
- `docs/factor_definitions.md`

Required factors:
- `liquidity_density_factor`
- `gamma_metabolism_factor`
- `manipulation_factor`
- `price_kinetic_factor`
- `health_score`

Acceptance checks:
- factors in `[0,1]`
- replay frames deterministic and gap-safe

## Stage 3: Organism Render Core (Days 3-4)
Objective:
- Implement hero organism scene with time replay.

Outputs:
- `webapp/` scene scaffold
- heartbeat core
- vessel network base
- timeline controls (play/pause/speed/scrub)

Acceptance checks:
- smooth frame interpolation
- no crashes on aggressive scrubbing
- readable state at normal laptop performance

## Stage 4: Bloodflow Behavior Layer (Day 5)
Objective:
- Encode order flow as blood motion.

Outputs:
- blood cell particles
- vessel turbulence model
- stress scar system

Acceptance checks:
- order flow is visually obvious without charts
- manipulation spikes are visible as biological events

## Stage 5: Counterfactual Ghost Organism (Day 6)
Objective:
- Add lightweight what-if twin organism.

Outputs:
- `scripts/build_counterfactual.py`
- `analysis/counterfactual/counterfactual.csv`
- ghost rendering mode (`Observed` vs `No-Gamma` vs `No-Manipulation`)

Acceptance checks:
- trajectories diverge non-trivially
- all text labels include "model-based simulation"

## Stage 6: Narrative and Demo Packaging (Days 7-8)
Objective:
- Turn visuals into a coherent story.

Outputs:
- `docs/demo_script.md`
- caption copy for each key state transition
- final camera beats and timing

Acceptance checks:
- viewer understands value in one pass
- no overclaiming in language

## Stage 7: QA and Hardening (Day 9)
Objective:
- Remove failure points before submission.

Outputs:
- prioritized issue list
- reproducibility checklist
- finalized limitations

Acceptance checks:
- clean setup-to-demo run
- no critical issues left

## Stage 8: Final Freeze (Day 10)
Objective:
- ship a reliable final artifact.

Outputs:
- tagged commit
- final artifacts list
- quickstart commands in README

Acceptance checks:
- teammate can run demo from clean environment

## Parallel Work Matrix
- Day 1: Human A + cleanup pipeline; Human B + organism art direction prototypes.
- Day 2: Human A + factor/replay export; Human B + scene skeleton.
- Days 3-4: Human B + render core; Human A + mapping validation.
- Day 5: bloodflow behavior + performance tuning in parallel.
- Day 6: counterfactual model + ghost visuals in parallel.
- Days 7-8: narrative polish + UX labels.
- Days 9-10: QA + release.

## Minimal Technical Stack
- Python: pandas, numpy for feature and factor scripts.
- Hero frontend: React, @react-three/fiber, @react-three/drei, Zustand.
- Support app: Streamlit for internal debug views.

## Commands to Standardize
```bash
python scripts/build_clean_features.py --input parsed_scaled/levels.csv --out analysis/cleaned
python scripts/build_state_indices.py --input analysis/cleaned/clean_features.csv --out analysis/factors
python scripts/export_replay_frames.py --input analysis/factors/state_indices.csv --out analysis/replay
python scripts/build_counterfactual.py --input analysis/factors/state_indices.csv --out analysis/counterfactual
```

## Quality Bar (Definition of Excellent)
- No generic dashboard feeling; visual identity is deliberate and memorable.
- Full day is understandable through organism behavior alone.
- Counterfactual mode is clear and honestly labeled.
- Demo story lands in under 3 minutes.

## Risk Controls
- Scope risk: protect organism-only core; cut P2 first.
- Performance risk: precompute replay frames and cap particle counts.
- Overclaim risk: simulation caveat text always visible.
- Delivery risk: Streamlit fallback remains available for baseline demo.

## Next Immediate Actions
1. Lock Stage 0 decisions in docs (`organism-only`, platform gate, caveats).
2. Start Stage 1 cleanup + Stage 3 visual prototype in parallel.
3. By end of Day 2, validate that replay frames already drive visible heartbeat changes.
