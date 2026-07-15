import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function Badge({ children, color = 'slate' }) {
  const map = {
    slate:   'bg-slate-700 text-slate-200',
    emerald: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    amber:   'bg-amber-500/20 text-amber-300 border border-amber-500/30',
    rose:    'bg-rose-500/20 text-rose-300 border border-rose-500/30',
    sky:     'bg-sky-500/20 text-sky-300 border border-sky-500/30',
  }
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${map[color] || map.slate}`}>
      {children}
    </span>
  )
}

function FieldRow({ label, value, mono = false }) {
  if (value === undefined || value === null || value === '') return null
  const display = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 py-2 border-b border-slate-800/60 last:border-0">
      <div className="text-xs uppercase tracking-[0.15em] text-slate-500 pt-0.5 leading-5">{label}</div>
      <div className={`text-sm text-slate-200 leading-6 ${mono ? 'font-mono text-xs whitespace-pre-wrap' : ''}`}>
        {display}
      </div>
    </div>
  )
}

function Pill({ label, severity }) {
  const color =
    severity === 'HIGH' || severity === 'CRITICAL' ? 'rose'
    : severity === 'MEDIUM' ? 'amber'
    : severity === 'LOW' ? 'sky'
    : 'slate'
  return <Badge color={color}>{label}</Badge>
}

// ---------------------------------------------------------------------------
// Panel wrapper — collapsible
// ---------------------------------------------------------------------------
function Panel({ index, title, subtitle, badge, badgeColor = 'slate', defaultOpen = false, children, missing = false }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`rounded-3xl border ${missing ? 'border-slate-700/40 opacity-60' : 'border-slate-700'} bg-slate-900 overflow-hidden`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-slate-800/40 transition"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex-none w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-400">
            {index}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">{title}</div>
            {subtitle && <div className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-none">
          {badge && <Badge color={badgeColor}>{badge}</Badge>}
          {missing && <Badge color="slate">No data</Badge>}
          <span className="text-slate-500 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-slate-800">
          {missing ? (
            <p className="text-sm text-slate-500 italic py-3">
              This pipeline stage did not produce output in this session.
            </p>
          ) : children}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Panel 1 — Observation
// ---------------------------------------------------------------------------
function ObservationPanel({ data }) {
  const cluster = data?.observation_cluster
  const missing = !cluster

  const severity = cluster?.cluster_severity
  const color = severity === 'CRITICAL' ? 'rose' : severity === 'HIGH' ? 'amber' : 'sky'

  return (
    <Panel
      index={1} title="Observation" subtitle="Signal clustering & primary cause"
      badge={severity} badgeColor={color}
      defaultOpen={true}
      missing={missing}
    >
      {cluster && (
        <div className="space-y-1 mt-3">
          <FieldRow label="Primary signal" value={cluster.primary_signal} />
          <FieldRow label="Cluster severity" value={cluster.cluster_severity} />
          <FieldRow label="Observation count" value={cluster.observation_count} />
          {cluster.primary_signal?.cause !== undefined && (
            <FieldRow label="Cause" value={cluster.primary_signal.cause} />
          )}
          {cluster.signals && (
            <div className="mt-3">
              <div className="text-xs uppercase tracking-[0.15em] text-slate-500 mb-2">Signals</div>
              <div className="space-y-1">
                {(Array.isArray(cluster.signals) ? cluster.signals : []).map((s, i) => (
                  <div key={i} className="rounded-2xl bg-slate-800/60 px-3 py-2 text-xs text-slate-300">{typeof s === 'string' ? s : JSON.stringify(s)}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Panel 2 — Diagnosis
// ---------------------------------------------------------------------------
function DiagnosisPanel({ data }) {
  const diag = data?.diagnosis
  const surviving = data?.surviving_hypotheses
  const missing = !diag

  const conf = diag?.confidence
  const confPct = conf !== undefined ? Math.round(conf * 100) : null
  const confColor = confPct >= 70 ? 'emerald' : confPct >= 50 ? 'amber' : 'rose'

  return (
    <Panel
      index={2} title="Diagnosis" subtitle="Root cause & causal chain"
      badge={confPct !== null ? `${confPct}% confidence` : undefined}
      badgeColor={confColor}
      missing={missing}
    >
      {diag && (
        <div className="space-y-1 mt-3">
          <FieldRow label="Actionable root cause" value={diag.actionable_root_cause ?? diag.root_cause} />
          <FieldRow label="Confidence" value={confPct !== null ? `${confPct}%` : undefined} />

          {diag.causal_chain?.length > 0 && (
            <div className="mt-4">
              <div className="text-xs uppercase tracking-[0.15em] text-slate-500 mb-2">Causal chain</div>
              <ol className="space-y-2">
                {diag.causal_chain.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm text-slate-300">
                    <span className="flex-none w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 text-xs flex items-center justify-center font-semibold">{i + 1}</span>
                    <span>{typeof step === 'string' ? step : JSON.stringify(step)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {diag.five_whys?.length > 0 && (
            <div className="mt-4">
              <div className="text-xs uppercase tracking-[0.15em] text-slate-500 mb-2">Five Whys</div>
              <ol className="space-y-2">
                {diag.five_whys.map((why, i) => (
                  <li key={i} className="flex gap-3 text-sm text-slate-300">
                    <span className="flex-none w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 text-xs flex items-center justify-center font-semibold">{i + 1}</span>
                    <span>{typeof why === 'string' ? why : JSON.stringify(why)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {diag.eliminated?.length > 0 && (
            <div className="mt-4">
              <div className="text-xs uppercase tracking-[0.15em] text-slate-500 mb-2">Eliminated hypotheses</div>
              <div className="flex flex-wrap gap-2">
                {diag.eliminated.map((h, i) => (
                  <span key={i} className="rounded-full bg-slate-800 border border-slate-700 px-3 py-1 text-xs text-slate-400 line-through">
                    {typeof h === 'string' ? h : JSON.stringify(h)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {surviving?.length > 0 && (
            <div className="mt-4">
              <div className="text-xs uppercase tracking-[0.15em] text-slate-500 mb-2">Surviving hypotheses</div>
              <div className="flex flex-wrap gap-2">
                {surviving.map((h, i) => (
                  <span key={i} className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs text-emerald-300">
                    {typeof h === 'string' ? h : JSON.stringify(h)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Panel 3 — Impact
// ---------------------------------------------------------------------------
function ImpactPanel({ data }) {
  const matrix = data?.impact_matrix
  const missing = !matrix

  const dimensions = matrix
    ? Object.entries(matrix).filter(([k]) => k !== 'dominant_dimension')
    : []

  const dominant = matrix?.dominant_dimension

  return (
    <Panel
      index={3} title="Impact Matrix" subtitle="Multi-dimension impact scoring"
      badge={dominant ? `Dominant: ${dominant}` : undefined}
      badgeColor="amber"
      missing={missing}
    >
      {matrix && (
        <div className="mt-3 space-y-3">
          {dimensions.map(([dim, val]) => {
            const mag = typeof val === 'object' ? val?.magnitude : typeof val === 'number' ? val : null
            const pct = mag !== null ? Math.min(100, (mag / 10) * 100) : 0
            const color = pct >= 70 ? 'bg-rose-500' : pct >= 40 ? 'bg-amber-500' : 'bg-emerald-500'
            return (
              <div key={dim} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300 capitalize">{dim.replace(/_/g, ' ')}</span>
                  <span className="font-semibold text-white">{mag !== null ? mag.toFixed(1) : '—'}<span className="text-slate-500 text-xs">/10</span></span>
                </div>
                <div className="h-2 rounded-full bg-slate-800">
                  <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                </div>
                {typeof val === 'object' && val?.sacrifice_statement && (
                  <div className="text-xs text-slate-500 italic">{val.sacrifice_statement}</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Panel 4 — Tradeoffs
// ---------------------------------------------------------------------------
function TradeoffsPanel({ data }) {
  const tm = data?.tradeoff_matrix
  const missing = !tm

  const options = tm?.options ?? []

  return (
    <Panel
      index={4} title="Tradeoff Matrix" subtitle="Decision options compared"
      badge={options.length ? `${options.length} options` : undefined}
      badgeColor="sky"
      missing={missing}
    >
      {tm && (
        <div className="mt-3 space-y-3">
          {options.map((opt, i) => (
            <div key={i} className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-sm font-semibold text-white">{opt.label ?? opt.name ?? `Option ${i + 1}`}</span>
                {opt.net_expected_value !== undefined && (
                  <span className={`text-sm font-bold ${opt.net_expected_value > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    EV: {opt.net_expected_value > 0 ? '+' : ''}{opt.net_expected_value?.toFixed(2)}
                  </span>
                )}
              </div>
              {opt.rejection_reason && (
                <div className="text-xs text-slate-400 italic">Rejected: {opt.rejection_reason}</div>
              )}
              {opt.description && (
                <div className="text-xs text-slate-300 mt-1">{opt.description}</div>
              )}
            </div>
          ))}
          {options.length === 0 && (
            <div className="text-sm text-slate-500 py-2">No tradeoff options recorded.</div>
          )}
        </div>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Panel 5 — Decision
// ---------------------------------------------------------------------------
function DecisionPanel({ data }) {
  const decision = data?.decision
  const missing = !decision

  const chosen = decision?.chosen_option
  const confPct = decision?.confidence !== undefined ? Math.round(decision.confidence * 100) : null
  const confColor = confPct >= 70 ? 'emerald' : confPct >= 50 ? 'amber' : 'rose'

  return (
    <Panel
      index={5} title="Decision" subtitle="Chosen action & rejected alternatives"
      badge={confPct !== null ? `${confPct}% confidence` : undefined}
      badgeColor={confColor}
      missing={missing}
    >
      {decision && (
        <div className="space-y-4 mt-3">
          {chosen && (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-4">
              <div className="text-xs uppercase tracking-[0.15em] text-emerald-400 mb-1">Chosen action</div>
              <div className="text-sm font-semibold text-white">{chosen.label ?? chosen.name ?? chosen.action ?? JSON.stringify(chosen)}</div>
              {chosen.net_expected_value !== undefined && (
                <div className="mt-2 text-xs text-emerald-300">Expected value: {chosen.net_expected_value > 0 ? '+' : ''}{chosen.net_expected_value?.toFixed(2)}</div>
              )}
            </div>
          )}

          {decision.rejected_alternatives?.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-[0.15em] text-slate-500 mb-2">Rejected alternatives</div>
              <div className="space-y-2">
                {decision.rejected_alternatives.map((alt, i) => (
                  <div key={i} className="rounded-2xl border border-slate-700 bg-slate-800/40 p-3">
                    <div className="text-sm text-slate-300">{alt.label ?? alt.name ?? JSON.stringify(alt)}</div>
                    {alt.rejection_reason && (
                      <div className="text-xs text-slate-500 mt-1 italic">{alt.rejection_reason}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {decision.null_option !== undefined && (
            <FieldRow label="Null option" value={typeof decision.null_option === 'object' ? JSON.stringify(decision.null_option) : String(decision.null_option)} />
          )}
        </div>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Panel 6 — Recovery Plans
// ---------------------------------------------------------------------------
function RecoveryPlansPanel({ data }) {
  const plans = data?.recovery_plans
  const arr = Array.isArray(plans) ? plans : []
  const missing = arr.length === 0 && !plans

  return (
    <Panel
      index={6} title="Recovery Plans" subtitle="Archetype-based remediation plans"
      badge={arr.length ? `${arr.length} plans` : undefined}
      badgeColor="sky"
      missing={missing}
    >
      {arr.length > 0 && (
        <div className="mt-3 space-y-3">
          {arr.map((plan, i) => {
            const prob = plan?.score?.deadline_probability ?? plan?.deadline_probability
            const actions = plan?.actions ?? plan?.recommended_actions ?? []
            return (
              <div key={i} className="rounded-2xl border border-slate-700 bg-slate-800/50 p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-sm font-semibold text-white">{plan.archetype ?? plan.name ?? `Plan ${i + 1}`}</span>
                  {prob !== undefined && (
                    <span className={`text-sm font-bold ${prob >= 0.7 ? 'text-emerald-400' : prob >= 0.4 ? 'text-amber-400' : 'text-rose-400'}`}>
                      {Math.round(prob * 100)}% on-time
                    </span>
                  )}
                </div>
                {actions.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {actions.slice(0, 4).map((a, j) => (
                      <li key={j} className="text-xs text-slate-400 flex gap-2">
                        <span className="text-slate-600">•</span>
                        <span>{typeof a === 'string' ? a : (a?.action ?? a?.description ?? JSON.stringify(a))}</span>
                      </li>
                    ))}
                    {actions.length > 4 && (
                      <li className="text-xs text-slate-600 pl-4">+{actions.length - 4} more actions</li>
                    )}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
      {!missing && arr.length === 0 && (
        <p className="text-sm text-slate-500 py-3">No recovery plans available.</p>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Panel 7 — Recovery State Machine
// ---------------------------------------------------------------------------
const STATE_ORDER = ['HEALTHY', 'WATCH', 'WARNING', 'RECOVERY', 'CRITICAL']
const STATE_COLOR = {
  HEALTHY:  { bg: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-emerald-500', badge: 'emerald' },
  WATCH:    { bg: 'bg-sky-500',     text: 'text-sky-400',     border: 'border-sky-500',     badge: 'sky'     },
  WARNING:  { bg: 'bg-amber-500',   text: 'text-amber-400',   border: 'border-amber-500',   badge: 'amber'   },
  RECOVERY: { bg: 'bg-orange-500',  text: 'text-orange-400',  border: 'border-orange-500',  badge: 'amber'   },
  CRITICAL: { bg: 'bg-rose-500',    text: 'text-rose-400',    border: 'border-rose-500',    badge: 'rose'    },
}

function RecoveryStatePanel({ data }) {
  const rsm = data?.recovery_state_machine
  const missing = !rsm

  const current = rsm?.current_state
  const colors = STATE_COLOR[current] ?? STATE_COLOR.WATCH

  return (
    <Panel
      index={7} title="Recovery State Machine" subtitle="Current project health state"
      badge={current} badgeColor={colors.badge}
      missing={missing}
    >
      {rsm && (
        <div className="mt-4 space-y-4">
          {/* State pipeline visualiser */}
          <div className="flex items-center gap-1">
            {STATE_ORDER.map((state, i) => {
              const isCurrent = state === current
              const isPast = STATE_ORDER.indexOf(current) > i
              const c = STATE_COLOR[state]
              return (
                <React.Fragment key={state}>
                  <div className={`flex-1 rounded-2xl py-2 px-1 text-center text-xs font-semibold transition
                    ${isCurrent ? `${c.bg} text-white shadow-lg` : isPast ? 'bg-slate-700 text-slate-400' : 'bg-slate-800/60 text-slate-600'}`}>
                    {state}
                  </div>
                  {i < STATE_ORDER.length - 1 && (
                    <span className="text-slate-700 text-xs flex-none">→</span>
                  )}
                </React.Fragment>
              )
            })}
          </div>

          <div className="space-y-1">
            <FieldRow label="Current state" value={current} />
            {rsm.previous_state && <FieldRow label="Previous state" value={rsm.previous_state} />}
            {rsm.transition_reason && <FieldRow label="Transition reason" value={rsm.transition_reason} />}
            {rsm.days_in_state !== undefined && <FieldRow label="Days in state" value={rsm.days_in_state} />}
          </div>

          {rsm.allowed_transitions?.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-[0.15em] text-slate-500 mb-2">Allowed next transitions</div>
              <div className="flex flex-wrap gap-2">
                {rsm.allowed_transitions.map(t => (
                  <Badge key={t} color={STATE_COLOR[t]?.badge ?? 'slate'}>{t}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Panel 8 — AI Advisor
// ---------------------------------------------------------------------------
function AdvisorPanel({ data }) {
  const output = data?.advisor_output
  const missing = !output

  const status = output?.status
  const isFallback = status === 'fallback'

  return (
    <Panel
      index={8} title="AI Advisor" subtitle="Reasoning explanation & decision narrative"
      badge={isFallback ? 'Deterministic fallback' : 'LLM'}
      badgeColor={isFallback ? 'amber' : 'emerald'}
      missing={missing}
    >
      {output && (
        <div className="mt-3 space-y-4">
          {output.executive_summary && (
            <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-4">
              <div className="text-xs uppercase tracking-[0.15em] text-amber-400 mb-2">Executive summary</div>
              <p className="text-sm text-slate-200 leading-6">{output.executive_summary}</p>
            </div>
          )}
          {output.reasoning_explanation && (
            <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-4">
              <div className="text-xs uppercase tracking-[0.15em] text-sky-400 mb-2">Reasoning explanation</div>
              <p className="text-sm text-slate-300 leading-6">{output.reasoning_explanation}</p>
            </div>
          )}
          {output.decision_explanation && (
            <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-4">
              <div className="text-xs uppercase tracking-[0.15em] text-emerald-400 mb-2">Decision explanation</div>
              <p className="text-sm text-slate-300 leading-6">{output.decision_explanation}</p>
            </div>
          )}
          {output.confidence_statement && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="text-xs uppercase tracking-[0.15em] text-amber-400 mb-2">Confidence statement</div>
              <p className="text-sm text-amber-200 leading-6">{output.confidence_statement}</p>
            </div>
          )}
          {isFallback && (
            <p className="text-xs text-slate-500 italic">
              Generated by deterministic fallback renderer — LLM path unavailable or not configured.
            </p>
          )}
        </div>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Export button
// ---------------------------------------------------------------------------
function ExportButton({ traceData, sessionId }) {
  const handleExport = () => {
    const payload = JSON.stringify(traceData, null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reasoning_trace_${sessionId || 'session'}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <button
      onClick={handleExport}
      className="rounded-2xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700 transition flex items-center gap-2"
    >
      <span>⬇</span> Export JSON
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function ReasoningTrace({ session }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [trace, setTrace] = useState(null)

  const sessionId = session?.project_summary?.session_id || ''

  const load = useCallback(() => {
    if (!sessionId) {
      setError(new Error('Missing session id'))
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    api.reasoningTrace(sessionId)
      .then(data => { setTrace(data); setLoading(false) })
      .catch(err => { setError(err); setLoading(false) })
  }, [sessionId])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <section className="rounded-3xl border border-slate-700 bg-slate-900 p-8 text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Reasoning Trace</p>
        <p className="mt-3 text-sm text-slate-400">Loading pipeline reasoning trace…</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="rounded-3xl border border-rose-600 bg-rose-900/10 p-6">
        <p className="text-sm uppercase tracking-[0.3em] text-rose-400">Reasoning Trace</p>
        <h2 className="mt-2 text-xl font-semibold text-rose-100">Unable to load reasoning trace</h2>
        <p className="mt-2 text-sm text-rose-300">{error.message || 'GET /api/reasoning-trace failed'}</p>
        <p className="mt-2 text-xs text-rose-400">
          Make sure Phase 3 is deployed: <code className="font-mono">GET /api/reasoning-trace</code> must exist.
        </p>
        <button
          onClick={load}
          className="mt-4 rounded-2xl border border-rose-500 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200"
        >
          Retry
        </button>
      </section>
    )
  }

  if (!trace) return null

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="rounded-3xl border border-slate-700 bg-slate-950/90 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Reasoning Trace</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Full Pipeline Reasoning</h2>
            <p className="mt-1 text-sm text-slate-400">
              8 collapsible stages — observe the engine's complete reasoning chain from signal to advisor output.
            </p>
          </div>
          <ExportButton traceData={trace} sessionId={sessionId} />
        </div>

        {/* Quick stats strip */}
        <div className="mt-5 flex flex-wrap gap-3">
          {[
            { label: 'Observation', key: 'observation_cluster' },
            { label: 'Diagnosis',   key: 'diagnosis' },
            { label: 'Impact',      key: 'impact_matrix' },
            { label: 'Tradeoffs',   key: 'tradeoff_matrix' },
            { label: 'Decision',    key: 'decision' },
            { label: 'Plans',       key: 'recovery_plans' },
            { label: 'State',       key: 'recovery_state_machine' },
            { label: 'Advisor',     key: 'advisor_output' },
          ].map(({ label, key }) => {
            const present = trace[key] !== undefined && trace[key] !== null &&
              !(Array.isArray(trace[key]) && trace[key].length === 0)
            return (
              <div
                key={key}
                className={`rounded-2xl px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5
                  ${present ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-500 border border-slate-700'}`}
              >
                <span>{present ? '✓' : '○'}</span>
                {label}
              </div>
            )
          })}
        </div>
      </section>

      {/* 8 panels */}
      <ObservationPanel data={trace} />
      <DiagnosisPanel data={trace} />
      <ImpactPanel data={trace} />
      <TradeoffsPanel data={trace} />
      <DecisionPanel data={trace} />
      <RecoveryPlansPanel data={trace} />
      <RecoveryStatePanel data={trace} />
      <AdvisorPanel data={trace} />

      <div className="flex justify-end">
        <button
          onClick={load}
          className="rounded-2xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition"
        >
          Refresh trace
        </button>
      </div>
    </div>
  )
}

export default ReasoningTrace
