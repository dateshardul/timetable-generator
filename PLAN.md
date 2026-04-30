# Timetable Generator — Implementation Plan

## Overview

A quantum-capable timetable generator that models scheduling as a **game-theoretic problem**. Events (lectures) are players, timeslots are strategies, and a conflict-free timetable corresponds to a Nash equilibrium in a weighted congestion game.

## Architecture

```
src/
├── models/          # Data models (Course, Event, TimeSlot, Room, Teacher, etc.)
├── graph/           # Conflict graph builder (inverted indexes, O(N*k) construction)
├── solvers/         # Solver backends (classical, vectorized, D-Wave stub, QAOA stub)
├── game/            # Game theory foundation (potential function, Nash verification, welfare)
├── engine/          # Orchestrator, validator, metrics, feasibility checker
├── api/             # Flask REST API + D3.js visualization + stakeholder portal
└── cli/             # Click CLI (generate, validate, serve)

tests/               # 49 tests (models, graph, solver, game theory, scale, API)
```

## Game-Theoretic Model

### Why Game Theory?

Graph coloring IS a game. Each event is a player choosing a timeslot (color). Conflicts are encoded as edge weights. The solver finds a Nash equilibrium — a stable assignment where no player can improve by unilaterally switching.

This framing gives us:
- **Provable convergence** via the potential function (exact potential game)
- **Stakeholder fairness** — Nash equilibrium is inherently fair
- **Transparency** — every move has a payoff-based explanation
- **Natural rescheduling** — freeze some players, let others re-negotiate

### Formal Definition

```
Game G = (N, {S_i}, {u_i})
  N = set of events (players)
  S_i = set of available timeslots (strategies)
  u_i = payoff function:
    payoff = 0.60 * timeslot_preference      (configurable via UI)
           + 0.25 * teacher_student_fit
           + 0.15 * course_preference
           - conflict_penalty                  (edge weights for same-slot neighbors)
           - spread_penalty                    (same-section on same day)
           - transition_penalty                (room-to-room movement cost)
           - disruption_penalty                (cost of changing existing assignment)
```

### Potential Function

```
Phi(sigma) = sum_i pref(i, sigma_i) - sum_{(i,j) in E} w_ij * [sigma_i = sigma_j] - sum_i spread(i)
```

**Key property**: When player i switches from s to s', the change in Phi exactly equals the change in u_i. This makes it an exact potential game, guaranteeing:
1. Every best-response move strictly increases Phi
2. Phi is bounded above -> convergence in finite steps
3. Every local maximum of Phi is a Nash equilibrium

### Algorithm: 3-Phase Solver

**Phase A — Greedy Initial Assignment (Welsh-Powell)**
1. Order events by conflict degree (most constrained first)
2. Assign best-payoff timeslot for each event
3. Optional randomness for demo mode (creates conflicts for animation)

**Phase B — Iterative Best-Response Dynamics**
1. Shuffle events randomly (avoids cycles)
2. Each event evaluates payoff for all timeslots
3. Switch to highest-payoff timeslot if better than current
4. Repeat until no event improves (Nash equilibrium)

**Phase C — Room Assignment (decoupled, greedy)**
1. Group events by timeslot
2. Sort by student count (best-fit decreasing)
3. Score candidate rooms by: capacity fit (50%) + teacher room preference (30%) + student room preference (20%)

**Phase D — Game-Theoretic Verification**
- Nash equilibrium check (no player can improve)
- Potential function value
- Social welfare (sum of payoffs)
- Jain's fairness index, Gini coefficient
- Price of Anarchy estimate
- Per-stakeholder utility breakdown

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Events as players, not stakeholders | Keeps strategy space manageable (each event picks one timeslot). Stakeholders are reflected in the payoff function via multi-dimensional preferences. |
| Room assignment decoupled | Joint timeslot+room optimization would square the strategy space. Decoupling is standard practice and works well. |
| Inverted indexes for graph construction | O(N * max_conflicts) instead of O(N^2). Scales to 1000+ events. |
| Numpy vectorized solver | 17x speedup over Python-loop solver. Enables 1000 events in ~3 seconds. |
| Demo mode with greedy randomness | Optimal solver converges instantly (no conflicts to show). Random initial placement creates conflicts that best-response resolves — better for demos. |
| Feasibility check skips max_clique for >500 nodes | NetworkX max_clique approximation takes 117s on 1000-node dense graphs. Per-teacher/group clique checks catch the same issues faster. |

## Completed Phases

### Phase 1: Core Implementation (L1-L8)
- [x] Data models (Course, Section, TimeSlot, Room, Teacher, StudentGroup, Event, Preferences, Costs)
- [x] Conflict graph builder (hard/soft/prerequisite/equipment edges)
- [x] Classical solver (3-phase with transition/disruption costs)
- [x] Validator, metrics, orchestrator pipeline
- [x] D-Wave QUBO and QAOA Ising stubs
- [x] Flask API (8 endpoints) + Click CLI
- [x] D3.js visualization (conflict graph, solver animation, timetable grid)
- [x] Stakeholder portal (/portal)
- [x] 49 tests passing

### Phase 2: Game Theory Foundation
- [x] Formal game model (src/game/game.py)
- [x] Potential function with convergence proof (src/game/potential.py)
- [x] Nash equilibrium verification (src/game/equilibrium.py)
- [x] Welfare analysis with PoA estimation (src/game/welfare.py)
- [x] Multi-dimensional preferences (timeslot, room, teacher, course)
- [x] Configurable payoff weights via UI sliders

### Phase 3: Scale & Robustness
- [x] Scale test: 60-1000 events benchmarked
- [x] Numpy vectorized solver (17x faster)
- [x] Infeasibility detection (teacher/group overload, clique bounds, density)
- [x] Rescheduling with frozen events and pre-loaded assignments
- [x] Portal preferences wired end-to-end into solver

### Phase 4: Visualization
- [x] Step-by-step timetable filling animation with narration
- [x] Player arena sidebar (replaced with integrated views)
- [x] Force-directed bipartite graph (players vs resources)
  - Thinking visualization, satisfaction arcs, Nash sweep, demand heatmap
  - Click-to-highlight
- [x] Auction house animation
  - Lot spotlight, bidder cards, gavel animation, ticker
- [x] Demo mode toggle for conflict-rich scenarios

## Upcoming Phases

### Phase 5: Quantum Backends
- [ ] D-Wave QUBO implementation using `dwave-neal` (simulated annealing, no hardware needed)
- [ ] Compare solution quality: classical Nash vs quantum annealing
- [ ] Hybrid solver: classical decomposition + quantum for dense sub-problems
- [ ] QAOA implementation on Qiskit Aer simulator

### Phase 6: Production Readiness
- [ ] PostgreSQL database for persistent storage
- [ ] User authentication (JWT)
- [ ] Docker / docker-compose deployment
- [ ] Calendar integration (iCal export)

### Phase 7: Advanced Features
- [ ] Interactive auction bidding (stakeholders override solver in real-time)
- [ ] Simulated annealing post-processing to escape local optima
- [ ] Backtracking when greedy fails (infeasible instances)
- [ ] Problem decomposition for 5000+ events

## Scale Benchmarks

| Events | Solver | Time | Conflicts | Notes |
|--------|--------|------|-----------|-------|
| 60 | Classical | 0.16s | 0 | Small department |
| 60 | Vectorized | 0.04s | 0 | 3.8x speedup |
| 200 | Classical | 1.24s | 0 | Medium department |
| 200 | Vectorized | 0.08s | 0 | 15.1x speedup |
| 500 | Classical | 9.89s | 270 | Tight instance |
| 500 | Vectorized | 0.57s | 270 | 17.2x speedup |
| 1000 | Vectorized | 3.1s | — | Large department |

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/generate` | Generate timetable (add `?demo=1` for demo mode) |
| POST | `/api/v1/regenerate` | Re-run with updated preferences |
| POST | `/api/v1/reschedule` | Partial re-solve with frozen events |
| POST | `/api/v1/validate` | Validate timetable constraints |
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/solvers` | List available solvers |
| GET | `/api/v1/submissions` | List stakeholder submissions |
| POST | `/api/v1/submissions` | Create submission from portal |
| POST | `/api/v1/submissions/clear` | Clear all submissions |
| DELETE | `/api/v1/submissions/:id` | Delete one submission |

## Running

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[test]"
python -m pytest tests/              # 49 tests
python -m src.cli.main serve         # http://localhost:5000
python -m src.cli.main generate --input data.json --output result.json
```
