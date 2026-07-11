# Recommendation-to-Forecast Influence Matrix

This matrix reframes recommendations around the four forecast levers used by the deterministic forecast engine in [PHASE_2/backend/app/engines/forecast_engine.py](PHASE_2/backend/app/engines/forecast_engine.py):

- Remaining effort (`adjusted_remaining`)
- Effective velocity (`projected_velocity` / `base_velocity`)
- Blocker delay (`remaining_days_blocker_loss`)
- Critical-path / spillover delay (`spillover_delay_days` and critical-path-driven schedule pressure)

The core modeling principle is simple: every simulated recommendation should change one or more of those four levers. If it does not, it should be treated as informational rather than simulated.

## Recommendation matrix

| Recommendation | Forecast lever(s) it should change | How it changes the forecast | Why that change is justified | Does simulation currently apply it? | Missing implementation |
|---|---|---|---|---|---|
| Resolve Blocker | Blocker delay | Removes blocker-induced delay by resolving the blocker and unblocking impacted work items. | Blockers prevent work from progressing, so clearing them should reduce schedule slippage. | Yes | None |
| Add Resource | Effective velocity | Increases available capacity and raises effective sprint velocity. | More capacity should shorten the time to finish remaining work. | Yes | None |
| Split Task | Remaining effort | Lowers the effective remaining work for the target item. | Smaller work chunks reduce execution friction and make the work easier to complete. | Yes | None |
| Parallelize Tasks | Critical-path / spillover delay | Reduces dependency lag and shortens the critical-path chain by allowing work to overlap. | Parallel execution should remove serial waiting and reduce overall duration. | Yes | None |
| Reduce Scope | Remaining effort | Lowers the effort required to complete the targeted work. | Less work should reduce duration and delay. | Yes | None |
| Reassign Work | Effective velocity (conditionally) | Only improves the forecast when the destination resource has capacity, the required skill, lower utilization, and no new bottleneck. | Reassignment only helps when the new assignment is actually a better fit. | Partially | The current simulation only changes ownership. It does not yet model a measurable productivity gain or a zero-benefit fallback. |
| Cross Train | Effective velocity | Increases future effective capacity by reducing single-point-of-failure risk and improving staffing flexibility. | Cross-training should improve future throughput and reduce the chance that a bottleneck causes spillover delay. | No | The simulation should apply a future-capacity uplift or temporary velocity gain rather than a new forecast variable. |
| Review Gate | Remaining effort | Reduces expected future effort growth by adding a quality checkpoint before work is treated as done. | Review gates can prevent downstream rework and reduce effort growth later. | No | The simulation should reduce the target item’s effective remaining effort or prevent scope growth from compounding. |
| Ramp-up | Effective velocity (temporary) | Applies a temporary productivity penalty early in a new resource’s tenure, then ramps back up over time. | New team members typically contribute less at first, so the forecast should reflect that. | No | The simulation should apply sprint-specific velocity modifiers rather than a permanent penalty. |
| Swarm | Critical-path / spillover delay, with a trade-off in secondary work | Shortens the critical path by applying extra effort to a bottleneck item, while increasing duration on the work that the swarming resource had to leave behind. | Swarming is believable only when it shows the trade-off between shortening a bottleneck and delaying other work. | No | The simulation should model a targeted critical-path reduction plus a secondary-work duration increase. |
| Re-estimate | Remaining effort | Updates the estimate to a more realistic effort value, which may increase or decrease the forecasted remaining work. | A more realistic estimate can expose hidden effort and increase delay, even though it improves forecast truthfulness. | No | The simulation should directly update the target item’s estimate or remaining effort based on a realistic adjustment factor. |
| Resequence Work | Critical-path / spillover delay | Reduces dependency waiting and avoids unnecessary spillover by changing task order when dependencies allow. | Better sequencing can remove waiting time without adding people. | No | The simulation should adjust dependency timing or task ordering to reduce spillover and critical-path inflation. |

## Suggested evidence chain for each recommendation

The strongest recommendations are those that can show a clear chain of evidence:

1. Historical pattern
2. Project constraint
3. Forecast lever
4. Recommendation
5. Simulated effect

Examples:

- Repeated estimation bias → remaining effort inaccurate → adjusted_remaining → Re-estimate
- Single owner / capacity bottleneck → effective velocity constrained → projected_velocity → Cross Train or Reassign Work
- Dependency waiting / blocked handoff → critical-path inflation → spillover_delay → Resequence Work or Parallelize Tasks

## Recommended hackathon simplification

For the hackathon, the cleanest approach is to keep the forecast engine as the single source of truth and ensure every recommendation modifies one or more of these existing inputs:

- Remaining effort
- Effective velocity
- Blocker delay
- Critical-path / spillover delay

If a recommendation cannot answer all of the following, it should not be simulated yet:

1. Which historical pattern triggered it?
2. Which forecast lever does it change?
3. How much does it change that lever?
4. Does the simulation apply that change?
5. Does the recalculated forecast actually improve?

## Current implementation status

The current simulation logic in [PHASE_2/backend/app/engines/simulation_engine.py](PHASE_2/backend/app/engines/simulation_engine.py) already supports direct application for:

- Resolve Blocker
- Add Resource
- Reduce Scope
- Parallelize Tasks
- Reassign Work
- Move Blocker Items Forward
- Split Task
- Critical Path Optimization

The biggest modeling gaps are:

- conditional benefit for Reassign Work,
- temporary and sprint-specific ramp-up effects,
- cross-training as a future-capacity effect,
- review gate as effort-growth control,
- swarm as a critical-path trade-off,
- re-estimate as an estimate-adjustment effect,
- and resequence work as a dependency-ordering effect.
