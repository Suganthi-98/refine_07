import React, {useState, useEffect} from 'react'
import { api } from '../api/client'
import RecoveryPlansPage from './components/RecoveryPlans'
import { ReasoningTrace } from './components/ReasoningTrace'
import { SprintHealth } from './components/SprintHealth'

const tabs = [
  { key: 'overview', label: 'Overview' },
  { key: 'risk', label: 'Risk' },
  { key: 'critical-path', label: 'Critical Path' },
  { key: 'forecast', label: 'Forecast' },
  { key: 'recovery-plans', label: 'Recovery Plans' },
  { key: 'actions', label: 'Actions' },
  { key: 'compare', label: '📊 Compare' },
  { key: 'sprint-health', label: '🏥 Sprint Health' },
  { key: 'reasoning-trace', label: '🧠 Reasoning Trace' },
]

function MetricCard({label, value}){
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
      <div className="text-sm uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className="mt-3 text-2xl font-semibold text-white">{value}</div>
    </div>
  )
}

function OverviewPage({ session, onNavigate }) {
  const summary = session.project_summary
  return (
    <div>
      <HeroBanner session={session} onNavigate={onNavigate} />
      <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-inner shadow-black/20 mt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Project Overview</p>
            <h2 className="mt-2 text-3xl font-extrabold text-white">{summary.project_name}</h2>
            <p className="mt-2 text-sm text-slate-400">{summary.customer} · Managed by {summary.project_manager}</p>
          </div>

        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Sprints" value={`${summary.completed_sprints ?? '—'} / ${summary.total_sprints ?? '—'}`} />
          <MetricCard label="Blockers active" value={summary.total_blockers ?? '—'} />
          <MetricCard label="Work items" value={summary.total_work_items ?? '—'} />
          <MetricCard label="Dependencies" value={summary.total_dependencies ?? '—'} />
        </div>
      </section>
    </div>
  )
}

function HeroBanner({ session, onNavigate }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [snap, setSnap] = useState(null)
  const sessionId = session?.project_summary?.session_id || ''

  const fetchData = async () => {
    if (!sessionId) { setError(new Error('Missing session id')); setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      // Single call returns forecast + MC + risk + EMIOS strip
      const s = await api.sessionSnapshot(sessionId)
      setSnap(s)
      setLoading(false)
    } catch (err) {
      setError(err)
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [sessionId])

  if (loading) return (
    <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-inner shadow-black/20">
      <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Project status</p>
      <h2 className="mt-2 text-3xl font-extrabold text-white">Computing forecast…</h2>
      <p className="mt-2 text-sm text-slate-400">Running Monte Carlo simulation</p>
    </section>
  )

  if (error) return (
    <section className="rounded-3xl border border-rose-600 bg-rose-900/10 p-6">
      <p className="text-sm uppercase tracking-[0.3em] text-rose-400">Project status</p>
      <h2 className="mt-2 text-3xl font-extrabold text-rose-200">Status unavailable</h2>
      <p className="mt-2 text-sm text-rose-300">{error.message || 'Failed to load forecast or Monte Carlo results'}</p>
      <button onClick={fetchData} className="mt-4 rounded-2xl border border-rose-500 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200">Retry</button>
    </section>
  )

  const mc = snap?.monte_carlo || {}
  const forecast = snap?.forecast || {}
  const strip = snap?.emios_strip || {}

  const prob = mc.on_time_probability !== undefined ? Math.round(mc.on_time_probability * 100) : null
  const expected = typeof forecast.expected_delay_days === 'number' ? Math.round(forecast.expected_delay_days) : null
  const riskLevel = snap?.risk?.overall_risk_level || mc.on_time_risk_level || null

  const probColor = prob === null ? 'text-slate-400'
    : prob >= 70 ? 'text-emerald-400'
    : prob >= 40 ? 'text-amber-400'
    : 'text-rose-400'

  const probLabel = prob === null ? 'No data'
    : prob >= 70 ? 'On track'
    : prob >= 40 ? 'At risk'
    : 'Critical risk'

  const delayText = expected === null ? null
    : expected < 0 ? `${Math.abs(expected)} days ahead of schedule`
    : expected === 0 ? 'On schedule'
    : `${expected} days late`

  return (
    <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-inner shadow-black/20">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-end gap-5">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400">On-time probability</p>
            <div className={`mt-1 text-8xl font-extrabold leading-none ${probColor}`}>
              {prob !== null ? `${prob}%` : '—'}
            </div>
            <div className={`mt-2 text-sm font-semibold uppercase tracking-[0.15em] ${probColor}`}>{probLabel}</div>
            {expected !== null && expected > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-rose-500"></span>
                <span className="text-sm text-rose-300 font-semibold">{delayText}</span>
              </div>
            )}
            {expected !== null && expected <= 0 && (
              <div className="mt-2 text-sm text-emerald-400">{delayText}</div>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => onNavigate && onNavigate('actions')}
            className="rounded-2xl border border-amber-500 bg-amber-500/15 px-6 py-3 text-sm font-bold text-amber-200 hover:bg-amber-500/25 transition text-center"
          >
            What should I do? →
          </button>
          <button
            onClick={() => onNavigate && onNavigate('recovery-plans')}
            className="rounded-2xl border border-sky-500 bg-sky-500/10 px-6 py-3 text-sm font-semibold text-sky-200 hover:bg-sky-500/20 transition text-center"
          >
            Recovery Plans →
          </button>
          <button
            onClick={() => onNavigate && onNavigate('reasoning-trace')}
            className="rounded-2xl border border-slate-600 bg-slate-800 px-6 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-700 transition text-center"
          >
            🧠 Why? →
          </button>
          {riskLevel && (
            <div className="text-center text-xs uppercase tracking-[0.2em] text-slate-500">
              Risk level: <span className={`font-semibold ${probColor}`}>{riskLevel}</span>
            </div>
          )}
        </div>
      </div>

      {/* EMIOS Diagnosis Strip — data from sessionSnapshot.emios_strip */}
      {snap && (strip.root_cause || strip.chosen_action || strip.recovery_state || strip.executive_summary) && (
        <div className="mt-6 border-t border-slate-800 pt-5 space-y-4">
          {strip.root_cause && (
            <div className="flex flex-wrap items-start gap-3">
              <span className="flex-none text-xs uppercase tracking-[0.15em] text-slate-500 pt-1 w-28">Root cause</span>
              <div className="flex-1">
                <span className="text-sm font-semibold text-rose-200">{strip.root_cause}</span>
                {strip.confidence_pct !== null && strip.confidence_pct !== undefined && (
                  <span className={`ml-3 text-xs font-semibold px-2 py-0.5 rounded-full ${
                    strip.confidence_pct >= 70 ? 'bg-emerald-500/20 text-emerald-300' :
                    strip.confidence_pct >= 50 ? 'bg-amber-500/20 text-amber-300' :
                    'bg-rose-500/20 text-rose-300'
                  }`}>
                    {strip.confidence_pct}% confidence
                  </span>
                )}
              </div>
            </div>
          )}
          {strip.chosen_action && (
            <div className="flex flex-wrap items-start gap-3">
              <span className="flex-none text-xs uppercase tracking-[0.15em] text-slate-500 pt-1 w-28">Recommended</span>
              <span className="flex-1 text-sm text-emerald-200 font-semibold">{strip.chosen_action}</span>
            </div>
          )}
          {strip.recovery_state && (
            <div className="flex flex-wrap items-start gap-3">
              <span className="flex-none text-xs uppercase tracking-[0.15em] text-slate-500 pt-1 w-28">Project state</span>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                strip.recovery_state === 'CRITICAL' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' :
                strip.recovery_state === 'RECOVERY' ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40' :
                strip.recovery_state === 'WARNING' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                strip.recovery_state === 'WATCH' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' :
                'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              }`}>
                {strip.recovery_state}
              </span>
            </div>
          )}
          {strip.executive_summary && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <span className="text-xs uppercase tracking-[0.15em] text-amber-400">AI Advisor</span>
              <p className="mt-1 text-sm text-amber-100 leading-6">{strip.executive_summary}</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function formatDate(iso){
  if(!iso) return '—'
  try{
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
  }catch(e){ return iso }
}

function daysBetween(a,b){
  const msPerDay = 1000*60*60*24
  return Math.round((b - a)/msPerDay)
}


function DelayDiagnosis({session}){
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [forecast, setForecast] = useState(null)

  const sessionId = session?.project_summary?.session_id || ''

  
  if(loading){
    return (
      <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-inner shadow-black/20 mt-6">
        <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Delay diagnosis</p>
        <p className="mt-3 text-sm text-slate-400">Loading delay diagnostics…</p>
      </section>
    )
  }

  if(error){
    return (
      <section className="rounded-3xl border border-rose-600 bg-rose-900/10 p-6 shadow-inner shadow-black/20 mt-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-rose-400">Delay diagnosis</p>
            <h2 className="mt-2 text-2xl font-semibold text-rose-100">Unable to load diagnostics</h2>
            <p className="mt-2 text-sm text-rose-300">{error.message || 'Forecast diagnostics could not be retrieved.'}</p>
          </div>
          <button onClick={()=>{ setLoading(true); setError(null); api.forecast(sessionId).then(f=>{ setForecast(f?.forecast ?? f); setLoading(false)}).catch(err=>{ setError(err); setLoading(false) }) }} className="rounded-2xl border border-rose-500 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200">Retry</button>
        </div>
      </section>
    )
  }

  if(!forecast || !forecast.schedule_diagnostics){
    return (
      <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-inner shadow-black/20 mt-6">
        <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Delay diagnosis</p>
        <p className="mt-3 text-sm text-slate-400">No schedule diagnostics are available for this session.</p>
      </section>
    )
  }

  const diag = forecast.schedule_diagnostics
  const factors = [
    { key: 'base', label: 'Base schedule', value: diag.base_schedule_days, color: 'bg-emerald-500' },
    { key: 'spillover', label: 'Spillover impact', value: diag.spillover_days, color: 'bg-amber-500' },
    { key: 'blocker', label: 'Blocker impact', value: diag.blocker_days, color: 'bg-rose-500' },
    { key: 'critical', label: 'Critical path impact', value: diag.critical_path_days, color: 'bg-sky-500' },
  ]
  const maxValue = Math.max(...factors.map(item => Math.max(0, item.value || 0)), 1)
  const dominant = factors.reduce((best, item) => item.value > (best.value || 0) ? item : best, factors[0])
  const scopeGrowth = typeof forecast.scope_growth_percent === 'number' && forecast.scope_growth_percent > 0.01

  return (
    <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-inner shadow-black/20 mt-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Delay diagnosis</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Why the schedule is shifted</h2>
          <p className="mt-2 text-sm text-slate-400">Breakdown of the forecast drivers affecting completion.</p>
        </div>
        <div className="rounded-3xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-300">
          Dominant driver: <span className="font-semibold text-white">{dominant.label}</span>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {factors.map(item => {
          const width = Math.round(((item.value || 0) / maxValue) * 100)
          return (
            <div key={item.key} className="space-y-2">
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>{item.label}</span>
                <span className="font-semibold text-white">{typeof item.value === 'number' ? `${item.value.toFixed(1)}d` : '—'}</span>
              </div>
              <div className="h-3 rounded-full bg-slate-800">
                <div className={`${item.color} h-3 rounded-full`} style={{ width: `${width}%` }} />
              </div>
            </div>
          )
        })}
      </div>

      {scopeGrowth && (
        <div className="mt-6 rounded-3xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm uppercase tracking-[0.3em] text-amber-300">Scope growth</p>
          <p className="mt-2 text-sm text-slate-100">{forecast.scope_growth_message || `Scope has grown by ${(forecast.scope_growth_percent * 100).toFixed(0)}% beyond the original estimate.`}</p>
        </div>
      )}

      {forecast.forecast_vs_montecarlo_note && (
        <div className="mt-4 text-sm text-slate-500">Note: {forecast.forecast_vs_montecarlo_note}</div>
      )}
    </section>
  )
}

function ForecastPage({session}){
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [forecast, setForecast] = useState(null)
  const [mc, setMc] = useState(null)
  const sessionId = session?.project_summary?.session_id || ''

  useEffect(()=>{
    let mounted = true
    if(!sessionId){
      setError(new Error('Missing session id'))
      setLoading(false)
      return () => { mounted = false }
    }
    setLoading(true)
    setError(null)
    Promise.all([api.forecast(sessionId), api.monteCarlo(sessionId)])
      .then(([f, m])=>{ if(mounted){ setForecast(f?.forecast ?? f); setMc(m?.monte_carlo ?? m); setLoading(false) }})
      .catch(err=>{ if(mounted){ setError(err); setLoading(false) }})
    return ()=>{ mounted = false }
  }, [sessionId])

  if(loading){
    return (
      <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-inner shadow-black/20">
        <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Forecast</p>
        <p className="mt-3 text-sm text-slate-400">Loading forecast and Monte Carlo details…</p>
      </section>
    )
  }

  if(error){
    return (
      <section className="rounded-3xl border border-rose-600 bg-rose-900/10 p-6 shadow-inner shadow-black/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-rose-400">Forecast</p>
            <h2 className="mt-2 text-2xl font-semibold text-rose-100">Unable to load forecast data</h2>
            <p className="mt-2 text-sm text-rose-300">{error.message || 'Failed to retrieve forecast or Monte Carlo results.'}</p>
          </div>
          <button onClick={()=>{ setLoading(true); setError(null); Promise.all([api.forecast(sessionId), api.monteCarlo(sessionId)]).then(([f,m])=>{ setForecast(f?.forecast ?? f); setMc(m?.monte_carlo ?? m); setLoading(false)}).catch(err=>{ setError(err); setLoading(false) }) }} className="rounded-2xl border border-rose-500 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200">Retry</button>
        </div>
      </section>
    )
  }

  if(!forecast && !mc){
    return (
      <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
        <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Forecast</p>
        <p className="mt-3 text-sm text-slate-400">No forecast or Monte Carlo results are available for this session.</p>
      </section>
    )
  }

  // Percentile timeline
  const stats = mc && mc.statistics ? mc.statistics : null
  const percentiles = stats ? [10,25,50,75,80,90,95].map(p => ({ p, iso: stats[`percentile_${p}`] })) : []
  const minIso = stats && stats.percentile_10 ? new Date(stats.percentile_10) : null
  const maxIso = stats && stats.percentile_95 ? new Date(stats.percentile_95) : null
  const rangeMs = minIso && maxIso ? (maxIso - minIso) : null

  const formatDateLabel = (iso) => { if(!iso) return '—'; try{ return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) }catch(e){ return iso } }



  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-inner shadow-black/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Forecast</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Finish-date distribution</h2>
            <p className="mt-2 text-sm text-slate-400">Monte Carlo percentiles show likely completion windows.</p>
          </div>
          <div className="rounded-3xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-300">
            {mc && mc.simulation_count ? `${mc.simulation_count.toLocaleString()} simulations` : 'Simulations'}
          </div>
        </div>

        <div className="mt-6">
          <div className="relative h-8 rounded-full bg-slate-800">
            {minIso && maxIso && percentiles.map(pt => {
              const iso = pt.iso
              const left = iso ? Math.round(((new Date(iso) - minIso) / rangeMs) * 100) : 0
              const color = pt.p === 50 ? 'bg-sky-500' : (pt.p <= 25 ? 'bg-emerald-500' : pt.p >= 90 ? 'bg-rose-500' : 'bg-amber-400')
              return (
                <div key={pt.p} className="absolute top-0 h-8 w-0">
                  <div className={`absolute -top-3 h-14 w-0`} style={{ left: `${left}%` }}>
                    <div className={`h-3 w-3 ${color} rounded-full border border-slate-900`} />
                  </div>
                </div>
              )
            })}
            <div className="absolute inset-0 flex items-end justify-between px-2 text-xs text-slate-400">
              <div>{formatDateLabel(stats?.percentile_10)}</div>
              <div>{formatDateLabel(stats?.percentile_95)}</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            {[50, 80, 95].map(p => {
              const pt = percentiles.find(x => x.p === p)
              return pt ? (
                <div key={p} className="rounded-3xl border border-slate-700 bg-slate-950/80 p-3 text-center">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">P{p} {p === 50 ? '· Most likely' : p === 80 ? '· Safe target' : '· Worst case'}</div>
                  <div className="mt-2 text-lg font-semibold text-white">{formatDateLabel(pt.iso)}</div>
                </div>
              ) : null
            })}
          </div>
        </div>
      </section>




    </div>
  )
}

function SprintRiskHeatmap({ session }) {
  const [loading, setLoading] = useState(true)
  const [sprints, setSprints] = useState([])
  const sessionId = session?.project_summary?.session_id || ''

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)
    api.risk(sessionId)
      .then(r => {
        const riskData = r?.risk_assessment ?? r
        setSprints(riskData?.sprint_risks || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [sessionId])

  if (loading) return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Sprint risk heatmap</p>
      <p className="mt-2 text-sm text-slate-500">Loading sprint risks…</p>
    </div>
  )

  if (!sprints.length) return null

  const riskColor = (score) => {
    if (score >= 70) return 'bg-rose-500'
    if (score >= 45) return 'bg-amber-500'
    return 'bg-emerald-500'
  }

  const riskTextColor = (score) => {
    if (score >= 70) return 'text-rose-400'
    if (score >= 45) return 'text-amber-400'
    return 'text-emerald-400'
  }

  return (
    <div className="rounded-3xl border border-slate-700 bg-slate-900 p-5">
      <p className="text-xs uppercase tracking-[0.3em] text-amber-400 mb-1">Sprint risk heatmap</p>
      <h3 className="text-lg font-semibold text-white mb-4">At a glance — which sprint is your problem?</h3>
      <div className="flex flex-wrap gap-3">
        {sprints.map((sprint, i) => {
          const score = Math.round(sprint.risk_score ?? sprint.score ?? 0)
          const name = sprint.sprint_name || sprint.sprint_id || `Sprint ${i + 1}`
          const blockerCount = sprint.blocker_count ?? sprint.active_blockers ?? 0
          const spilloverCount = sprint.spillover_count ?? sprint.spillover_items ?? 0
          return (
            <div key={sprint.sprint_id || i} className="relative group cursor-default">
              <div className={`${riskColor(score)} rounded-2xl w-20 h-20 flex flex-col items-center justify-center gap-1 transition hover:opacity-80`}>
                <div className="text-xs font-bold text-white/90 truncate px-2 text-center leading-tight">{name}</div>
                <div className="text-xl font-extrabold text-white">{score}</div>
              </div>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10 hidden group-hover:block w-48">
                <div className="rounded-2xl border border-slate-600 bg-slate-800 p-3 shadow-xl text-xs">
                  <div className={`font-bold mb-1 ${riskTextColor(score)}`}>{name} — risk {score}/100</div>
                  {blockerCount > 0 && <div className="text-rose-300">⛔ {blockerCount} active blocker{blockerCount > 1 ? 's' : ''}</div>}
                  {spilloverCount > 0 && <div className="text-amber-300">⚠ {spilloverCount} spillover item{spilloverCount > 1 ? 's' : ''}</div>}
                  {sprint.overload_pct !== undefined && sprint.overload_pct > 100 && <div className="text-amber-300">📈 {Math.round(sprint.overload_pct)}% loaded</div>}
                  {blockerCount === 0 && spilloverCount === 0 && <div className="text-slate-400">No critical issues</div>}
                </div>
                <div className="w-2 h-2 border-b border-r border-slate-600 bg-slate-800 rotate-45 mx-auto -mt-1"></div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex gap-4 text-xs text-slate-400">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-emerald-500"></span> Low (&lt;45)</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-amber-500"></span> Medium (45–69)</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-rose-500"></span> High (70+)</span>
      </div>
    </div>
  )
}

function ScenarioColumn({ label, badge, badgeColor, data, probColor, formatDate, summary }) {
  if (!data) return null
  const prob = data.on_time_probability
  const delay = data.expected_delay_days
  const risk = data.overall_risk_score
  return (
    <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm uppercase tracking-[0.3em] text-slate-400">{label}</p>
        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${badgeColor}`}>{badge}</span>
      </div>
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-1">On-time probability</div>
        <div className={`text-6xl font-extrabold ${probColor(prob)}`}>
          {prob !== undefined && prob !== null ? `${prob}%` : '—'}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-slate-950 p-3">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Delay</div>
          <div className={`mt-1 text-xl font-bold ${delay > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
            {delay !== undefined ? (delay > 0 ? `+${delay}d` : `${delay}d`) : '—'}
          </div>
        </div>
        <div className="rounded-2xl bg-slate-950 p-3">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Risk score</div>
          <div className={`mt-1 text-xl font-bold ${risk >= 60 ? 'text-rose-300' : risk >= 40 ? 'text-amber-300' : 'text-emerald-300'}`}>
            {risk !== undefined ? Math.round(risk) : '—'}<span className="text-sm text-slate-500">/100</span>
          </div>
        </div>
        <div className="rounded-2xl bg-slate-950 p-3 col-span-2">
          <div className="text-xs text-slate-500 uppercase tracking-wide">P50 finish</div>
          <div className="mt-1 text-sm font-semibold text-white">{formatDate(data.p50_date)}</div>
        </div>
        <div className="rounded-2xl bg-slate-950 p-3">
          <div className="text-xs text-slate-500 uppercase tracking-wide">P80</div>
          <div className="mt-1 text-sm font-semibold text-slate-200">{formatDate(data.p80_date)}</div>
        </div>
        <div className="rounded-2xl bg-slate-950 p-3">
          <div className="text-xs text-slate-500 uppercase tracking-wide">P95</div>
          <div className="mt-1 text-sm font-semibold text-slate-200">{formatDate(data.p95_date)}</div>
        </div>
      </div>
      {summary && (
        <div className="rounded-2xl border border-emerald-800 bg-emerald-900/10 p-3">
          <div className="text-xs uppercase tracking-wide text-emerald-400 mb-1">What changed</div>
          <p className="text-sm text-slate-300">{summary}</p>
        </div>
      )}
    </section>
  )
}

function ReforecastPage({ session }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const sessionId = session?.project_summary?.session_id || ''

  const load = () => {
    if (!sessionId) { setError(new Error('Missing session id')); setLoading(false); return }
    setLoading(true)
    setError(null)
    api.reforecastComparison(sessionId)
      .then(d => { setData(d); setLoading(false) })
      .catch(err => { setError(err); setLoading(false) })
  }

  useEffect(() => { load() }, [sessionId])

  if (loading) return (
    <section className="rounded-3xl border border-slate-700 bg-slate-900 p-8 text-center">
      <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Reforecast</p>
      <p className="mt-3 text-sm text-slate-400">Computing comparison…</p>
    </section>
  )

  if (error) return (
    <section className="rounded-3xl border border-rose-600 bg-rose-900/10 p-8">
      <p className="text-sm uppercase tracking-[0.3em] text-rose-400">Reforecast unavailable</p>
      <p className="mt-2 text-sm text-rose-300">{error.message}</p>
      <button onClick={load} className="mt-4 rounded-2xl border border-rose-500 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200">Retry</button>
    </section>
  )

  if (!data) return null

  const { baseline, after_recommendation, deltas } = data
  const hasSimulation = after_recommendation?.on_time_risk_level !== 'NO_SIMULATION_YET'

  const probColor = (p) => {
    if (p >= 70) return 'text-emerald-400'
    if (p >= 40) return 'text-amber-400'
    return 'text-rose-400'
  }

  const formatDate = (iso) => {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) }
    catch { return iso }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
        <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Reforecast comparison</p>
        <h2 className="mt-2 text-2xl font-bold text-white">Before vs. After</h2>
        <p className="mt-1 text-sm text-slate-400">
          {hasSimulation ? 'Showing impact of your last simulated recommendation.' : 'Simulate a recommendation in the Actions tab to see the after column.'}
        </p>
      </section>
      {hasSimulation && deltas && (
        <section className={`rounded-3xl border p-5 flex flex-col sm:flex-row gap-6 items-center justify-center ${deltas.has_improvement ? 'border-emerald-600 bg-emerald-900/20' : 'border-slate-700 bg-slate-900'}`}>
          <div className="text-center">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Probability gain</div>
            <div className={`mt-1 text-4xl font-extrabold ${deltas.probability_gain_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {deltas.probability_gain_pct >= 0 ? '+' : ''}{deltas.probability_gain_pct}%
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Days saved</div>
            <div className={`mt-1 text-4xl font-extrabold ${deltas.days_saved >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {deltas.days_saved >= 0 ? '+' : ''}{deltas.days_saved}d
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Risk reduction</div>
            <div className={`mt-1 text-4xl font-extrabold ${deltas.risk_score_reduction >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {deltas.risk_score_reduction >= 0 ? '−' : '+'}{Math.abs(deltas.risk_score_reduction)}
            </div>
          </div>
        </section>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <ScenarioColumn label="Baseline" badge="BEFORE" badgeColor="text-rose-300 border-rose-600 bg-rose-900/20" data={baseline} probColor={probColor} formatDate={formatDate} />
        {hasSimulation ? (
          <ScenarioColumn label="After recommendation" badge="AFTER" badgeColor="text-emerald-300 border-emerald-600 bg-emerald-900/20" data={after_recommendation} probColor={probColor} formatDate={formatDate} summary={after_recommendation.summary} />
        ) : (
          <section className="rounded-3xl border border-dashed border-slate-600 bg-slate-900/40 p-6 flex items-center justify-center text-center">
            <div>
              <div className="text-slate-500 text-4xl mb-3">?</div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">No simulation yet</p>
              <p className="mt-2 text-xs text-slate-600">Go to Actions → pick a recommendation → Simulate.</p>
            </div>
          </section>
        )}
      </div>
      <div className="flex justify-center">
        <button onClick={load} className="rounded-2xl border border-slate-600 bg-slate-800 px-5 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700">Refresh comparison</button>
      </div>
    </div>
  )
}

function ActionsPage({ session, onSimulated }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [recs, setRecs] = useState([])
  const [simulatingId, setSimulatingId] = useState(null)
  const [simulationResult, setSimulationResult] = useState(null)
  const [selected, setSelected] = useState([])
  const [scenarioLoading, setScenarioLoading] = useState(false)

  const sessionId = session?.project_summary?.session_id || ''

  useEffect(()=>{
    let mounted = true
    if(!sessionId){
      setError(new Error('Missing session id'))
      setLoading(false)
      return () => { mounted = false }
    }
    setLoading(true)
    api.recommendations(sessionId).then(resp=>{ if(mounted){ setRecs(resp.recommendations || resp || []); setLoading(false) }}).catch(err=>{ if(mounted){ setError(err); setLoading(false) }})
    return ()=> mounted = false
  }, [sessionId])

  const simulate = async (recommendation_id) => {
    setSimulatingId(recommendation_id)
    setSimulationResult(null)
    try{
      const body = { recommendation_id }
      const resp = await api.simulateRecommendation(body, sessionId)
      setSimulationResult(resp.simulation_result || resp)
      onSimulated && onSimulated()
    }catch(err){
      setError(err)
    }finally{
      setSimulatingId(null)
    }
  }

  const runScenario = async () => {
    if(selected.length === 0) return
    setScenarioLoading(true)
    setError(null)
    try{
      const resp = await api.simulateScenario({ recommendation_ids: selected.slice(0,3) }, sessionId)
      setSimulationResult(resp.simulation_result || resp)
    }catch(err){ setError(err) }finally{ setScenarioLoading(false) }
  }

  const toggleSelect = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev.slice(-2), id])
  }

  if(loading) return (
    <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-inner shadow-black/20">
      <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Actions</p>
      <p className="mt-3 text-sm text-slate-400">Loading recommendations…</p>
    </section>
  )

  if(error) return (
    <section className="rounded-3xl border border-rose-600 bg-rose-900/10 p-6 shadow-inner shadow-black/20">
      <p className="text-sm uppercase tracking-[0.3em] text-rose-400">Actions</p>
      <p className="mt-2 text-sm text-rose-300">{error.message || 'Failed to load recommendations.'}</p>
    </section>
  )

  if(!recs || recs.length === 0) return (
    <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
      <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Actions</p>
      <p className="mt-3 text-sm text-slate-400">No recommendations are available for this session.</p>
    </section>
  )

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Actions</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Recommendations</h2>

          </div>
          <div className="flex items-center gap-3">
            <button onClick={runScenario} disabled={selected.length===0 || scenarioLoading} className="rounded-2xl border border-emerald-500 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 disabled:opacity-50">{scenarioLoading ? 'Simulating selection…' : `Simulate selection (${selected.length})`}</button>
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          {recs.filter(rec => (rec.expected_delay_gain_days || 0) > 0 || rec.impact_level !== 'Low').map(rec => (
            <div key={rec.recommendation_id} className="rounded-3xl border border-slate-700 bg-slate-950/80 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{rec.impact_level}</div>
                    {rec.urgency && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        rec.urgency === 'TODAY' ? 'bg-rose-500/20 text-rose-300' :
                        rec.urgency === 'THIS_SPRINT' ? 'bg-amber-500/20 text-amber-300' :
                        'bg-sky-500/20 text-sky-300'
                      }`}>{rec.urgency.replace('_', ' ')}</span>
                    )}
                  </div>
                  {rec.blocker_overdue_days > 0 && (
                    <div className="mt-1 text-xs font-semibold text-rose-300">⚠ {rec.blocker_overdue_days} day{rec.blocker_overdue_days !== 1 ? 's' : ''} past target resolution</div>
                  )}
                  <h3 className="mt-1 text-lg font-semibold text-white">{rec.action}</h3>
                  <div className="mt-2 text-sm text-slate-300">{rec.impact_summary}</div>

                  {/* Probability gain bar */}
                  {rec.baseline_probability !== undefined && rec.after_probability !== undefined && (
                    <div className="mt-3 space-y-1">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>On-time probability</span>
                        <span className="font-semibold text-white">
                          {Math.round(rec.baseline_probability * 100)}%
                          <span className="text-emerald-400 ml-1">→ {Math.round(rec.after_probability * 100)}%</span>
                          {rec.expected_probability_gain > 0 && (
                            <span className="ml-2 text-emerald-300">(+{Math.round(rec.expected_probability_gain * 100)}pp)</span>
                          )}
                        </span>
                      </div>
                      <div className="relative h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div className="absolute h-2 rounded-full bg-slate-600" style={{ width: `${Math.round(rec.baseline_probability * 100)}%` }} />
                        <div className="absolute h-2 rounded-full bg-emerald-500" style={{ width: `${Math.round(rec.after_probability * 100)}%` }} />
                      </div>
                    </div>
                  )}

                  {/* Counterfactual */}
                  {rec.counterfactual_statement && (
                    <div className="mt-2 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-400 italic">
                      {rec.counterfactual_statement}
                    </div>
                  )}

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 text-sm text-slate-400">
                    <div>Effort: <span className="text-white font-semibold">{rec.implementation_effort}</span></div>
                    <div>Confidence: <span className="text-white font-semibold">{rec.confidence}</span></div>
                    <div>Priority: <span className="text-white font-semibold">{Math.round(rec.priority_score)}</span></div>
                    <div>Impact: <span className="text-white font-semibold">{rec.impact_confidence || '—'}</span></div>
                  </div>
                  {rec.resource_load_impact && Object.keys(rec.resource_load_impact).length > 0 && (
                    <div className="mt-3 space-y-2">
                      {Object.entries(rec.resource_load_impact).map(([name, loads]) => (
                        <div key={name} className="flex items-center gap-3 text-xs">
                          <span className="w-32 truncate text-slate-400">{name}</span>
                          <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                            <div
                              className={`h-full ${loads.after > 1.1 ? 'bg-rose-500' : loads.after > 0.9 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{width: `${Math.min(100, loads.after * 100)}%`}}
                            />
                          </div>
                          <span className="text-slate-500">{Math.round(loads.before*100)}% → <span className="text-white font-semibold">{Math.round(loads.after*100)}%</span></span>
                        </div>
                      ))}
                    </div>
                  )}
                  {rec.dependency_consequence && (
                    <details className="mt-3 text-xs text-slate-400">
                      <summary className="cursor-pointer text-sky-300 hover:text-sky-200">Why this matters</summary>
                      <p className="mt-1 pl-3 border-l border-slate-700">{rec.dependency_consequence}</p>
                    </details>
                  )}
                  {rec.validation && (
                    <details className="mt-4 rounded-2xl border border-slate-700 bg-slate-900/60 p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-emerald-300">Why this recommendation?</summary>
                      <div className="mt-3 space-y-3 text-sm">
                        <div>
                          <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">Why selected</div>
                          <ul className="space-y-1 text-slate-300">
                            {(rec.validation.why_selected || []).map((point, i) => (
                              <li key={i} className="flex gap-2"><span className="text-emerald-400">•</span><span>{point}</span></li>
                            ))}
                          </ul>
                        </div>

                        {(rec.validation.why_better_than_alternatives || []).length > 0 && (
                          <div>
                            <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">Why better than alternatives</div>
                            <ul className="space-y-1 text-slate-300">
                              {(rec.validation.why_better_than_alternatives || []).map((point, i) => (
                                <li key={i} className="flex gap-2"><span className="text-sky-400">•</span><span>{point}</span></li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-xl bg-slate-950 p-2">
                            <div className="text-xs text-slate-500">Expected delay</div>
                            <div className="font-semibold text-white">{rec.validation.delay_reduction_summary}</div>
                          </div>
                          <div className="rounded-xl bg-slate-950 p-2">
                            <div className="text-xs text-slate-500">Deadline probability</div>
                            <div className="font-semibold text-white">{rec.validation.probability_improvement_summary}</div>
                          </div>
                        </div>

                        <div>
                          <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">Confidence: {rec.validation.confidence_label}</div>
                          <div className="text-xs text-slate-400">{rec.validation.confidence_reasoning}</div>
                        </div>

                        {(rec.validation.trade_offs || []).length > 0 && (
                          <div>
                            <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">Trade-offs</div>
                            <ul className="space-y-1">
                              {(rec.validation.trade_offs || []).map((t, i) => (
                                <li key={i} className="flex gap-2 text-xs">
                                  <span className={t.severity === 'significant' ? 'text-rose-400' : t.severity === 'moderate' ? 'text-amber-400' : 'text-slate-500'}>●</span>
                                  <span className="text-slate-300">{t.description}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </details>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-400">
                    <input type="checkbox" checked={selected.includes(rec.recommendation_id)} onChange={()=>toggleSelect(rec.recommendation_id)} />
                    <span>Select</span>
                  </label>
                  <button onClick={()=>simulate(rec.recommendation_id)} disabled={!!simulatingId} className="rounded-2xl border border-sky-500 bg-sky-500/10 px-3 py-1 text-sm font-semibold text-sky-200">{simulatingId===rec.recommendation_id ? 'Simulating…' : 'Simulate this fix'}</button>
                </div>
              </div>

              {simulationResult && simulationResult.recommendation_id === rec.recommendation_id && (
                <div className="mt-4 rounded-2xl border border-emerald-500 bg-emerald-500/5 p-3">
                  <div className="text-sm text-slate-300">Simulation result</div>
                  <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
                    <div className="rounded-2xl bg-slate-900 p-2 text-center">
                      <div className="text-xs text-slate-400">On-time probability</div>
                      <div className="text-lg font-semibold text-white">{Math.round((simulationResult.after_probability||0)*100)}% <span className="text-slate-400">(was {Math.round((simulationResult.baseline_probability||0)*100)}%)</span></div>
                    </div>
                    <div className="rounded-2xl bg-slate-900 p-2 text-center">
                      <div className="text-xs text-slate-400">Expected delay</div>
                      <div className="text-lg font-semibold text-white">{(simulationResult.after_delay_days||0).toFixed(1)}d <span className="text-slate-400">(was {(simulationResult.baseline_delay_days||0).toFixed(1)}d)</span></div>
                    </div>
                    <div className="rounded-2xl bg-slate-900 p-2 text-center">
                      <div className="text-xs text-slate-400">Risk score</div>
                      <div className="text-lg font-semibold text-white">{Math.round(simulationResult.after_risk_score||0)} <span className="text-slate-400">(was {Math.round(simulationResult.baseline_risk_score||0)})</span></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {simulationResult && simulationResult.recommendation_id == null && simulationResult.scenario_recommendation_ids && simulationResult.scenario_recommendation_ids.length > 0 && (
        <section className="rounded-3xl border border-emerald-500 bg-emerald-500/5 p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Scenario result</p>
          <div className="mt-1 text-sm text-slate-300">Applied: {simulationResult.scenario_recommendation_ids.join(', ')}</div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-900 p-3 text-center">
              <div className="text-xs text-slate-400">On-time probability</div>
              <div className="text-lg font-semibold text-white">
                {Math.round((simulationResult.after_probability||0)*100)}%{' '}
                <span className="text-slate-400">(was {Math.round((simulationResult.baseline_probability||0)*100)}%)</span>
              </div>
            </div>
            <div className="rounded-2xl bg-slate-900 p-3 text-center">
              <div className="text-xs text-slate-400">Expected delay</div>
              <div className="text-lg font-semibold text-white">
                {(simulationResult.after_delay_days||0).toFixed(1)}d{' '}
                <span className="text-slate-400">(was {(simulationResult.baseline_delay_days||0).toFixed(1)}d)</span>
              </div>
            </div>
            <div className="rounded-2xl bg-slate-900 p-3 text-center">
              <div className="text-xs text-slate-400">Risk score</div>
              <div className="text-lg font-semibold text-white">
                {Math.round(simulationResult.after_risk_score||0)}{' '}
                <span className="text-slate-400">(was {Math.round(simulationResult.baseline_risk_score||0)})</span>
              </div>
            </div>
          </div>
          {simulationResult.summary && (
            <p className="mt-4 text-sm text-slate-300">{simulationResult.summary}</p>
          )}
        </section>
      )}

      {simulationResult && simulationResult.revised_sprint_plan && simulationResult.revised_sprint_plan.length > 0 && (
        <section className="rounded-3xl border border-emerald-500 bg-emerald-500/5 p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Revised plan</p>
          <h3 className="mt-2 text-xl font-semibold text-white">Sprint plan after applying selected actions</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-700">
                  <th className="pb-2 pr-4">Item</th>
                  <th className="pb-2 pr-4">Hours</th>
                  <th className="pb-2 pr-4">Original owner</th>
                  <th className="pb-2">New owner</th>
                </tr>
              </thead>
              <tbody>
                {simulationResult.revised_sprint_plan.map(row => (
                  <tr key={row.item_id} className={`border-b border-slate-800 ${row.owner_changed ? 'bg-emerald-500/5' : ''}`}>
                    <td className="py-2 pr-4 text-white">{row.title || row.item_id}</td>
                    <td className="py-2 pr-4 text-slate-400">{row.remaining_hours}h</td>
                    <td className="py-2 pr-4 text-slate-500">{row.original_owner}</td>
                    <td className={`py-2 font-semibold ${row.owner_changed ? 'text-emerald-300' : 'text-slate-300'}`}>{row.new_owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function getRiskColor(score){
  if(score >= 80) return {bg:'bg-rose-500', textBg:'bg-rose-500/15 text-rose-200', border:'border-rose-500'}
  if(score >= 60) return {bg:'bg-amber-400', textBg:'bg-amber-400/15 text-amber-200', border:'border-amber-400'}
  if(score >= 40) return {bg:'bg-orange-400', textBg:'bg-orange-400/15 text-orange-200', border:'border-orange-400'}
  if(score >= 20) return {bg:'bg-sky-500', textBg:'bg-sky-500/15 text-sky-200', border:'border-sky-500'}
  return {bg:'bg-emerald-500', textBg:'bg-emerald-500/15 text-emerald-200', border:'border-emerald-500'}
}

function RiskPage({session}){
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [risk, setRisk] = useState(null)
  const sessionId = session?.project_summary?.session_id || ''

  const fetchRisk = async ()=>{
    if(!sessionId){
      setError(new Error('Missing session id'))
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try{
      const response = await api.risk(sessionId)
      setRisk(response?.risk_analysis ?? response)
    }catch(err){
      setError(err)
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{ fetchRisk() }, [sessionId])

  if(loading){
    return (
      <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-inner shadow-black/20">
        <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Risk analysis</p>
        <div className="mt-4 text-sm text-slate-400">Loading risk results and drivers…</div>
      </section>
    )
  }

  if(error){
    return (
      <section className="rounded-3xl border border-rose-600 bg-rose-900/10 p-6 shadow-inner shadow-black/20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-rose-400">Risk analysis</p>
            <h2 className="mt-2 text-2xl font-semibold text-rose-100">Unable to load risk data</h2>
            <p className="mt-2 text-sm text-rose-300">{error.message || 'Failed to retrieve risk insights.'}</p>
          </div>
          <button onClick={fetchRisk} className="rounded-2xl border border-rose-500 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200">Retry</button>
        </div>
      </section>
    )
  }

  if(!risk){
    return (
      <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
        <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Risk analysis</p>
        <div className="mt-4 text-sm text-slate-400">No risk insights are available for this session.</div>
      </section>
    )
  }

  const subRiskCards = [
    {key:'schedule', label:'Schedule risk', data:risk.schedule_risk},
    {key:'dependency', label:'Dependency risk', data:risk.dependency_risk},
    {key:'resource', label:'Resource risk', data:risk.resource_risk},
    {key:'scope', label:'Scope risk', data:risk.scope_risk},
  ]

  const sprintRisks = Array.isArray(risk.sprint_risks) ? [...risk.sprint_risks].sort((a,b)=>a.sprint_id - b.sprint_id) : []

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-inner shadow-black/20">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Overall risk</p>
            <h2 className="mt-2 text-4xl font-extrabold text-white">{Math.round(risk.overall_risk_score)}</h2>
            <div className={`mt-4 inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${getRiskColor(risk.overall_risk_score).textBg}`}>
              {risk.overall_risk_level}
            </div>

          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">


          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-inner shadow-black/20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Risk breakdown</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Risk by category</h2>
          </div>

        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {subRiskCards.map(item => (
            <SubRiskCard key={item.key} label={item.label} score={item.data?.score} reasons={item.data?.reasons || []} />
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <TopRiskDriversPanel drivers={risk.top_risk_drivers || []} />
        <SprintRiskChart sprintRisks={sprintRisks} />
      </div>
    </div>
  )
}

function SubRiskCard({label, score, reasons}){
  const displayScore = typeof score === 'number' ? Math.round(score) : 0
  const color = getRiskColor(displayScore)

  return (
    <div className="rounded-3xl border border-slate-700 bg-slate-950/80 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm uppercase tracking-[0.2em] text-slate-400">{label}</div>
          <div className="mt-3 text-3xl font-semibold text-white">{displayScore}</div>
        </div>
        <div className={`rounded-full px-3 py-1 text-xs font-semibold ${color.textBg}`}>
          {displayScore}
        </div>
      </div>
      <div className="mt-4 h-3 rounded-full bg-slate-800">
        <div className={`${color.bg} h-3 rounded-full`} style={{ width: `${displayScore}%` }} />
      </div>
      <details className="mt-5 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 text-sm text-slate-300">
        <summary className="cursor-pointer font-semibold text-slate-100">View reasons ({reasons.length})</summary>
        <ul className="mt-3 space-y-2 text-slate-300">
          {reasons.length > 0 ? reasons.map((reason, index) => (
            <li key={index} className="list-disc pl-5">{reason}</li>
          )) : (
            <li className="text-slate-500">No recorded reasons.</li>
          )}
        </ul>
      </details>
    </div>
  )
}

function TopRiskDriversPanel({drivers}){
  return (
    <section className="rounded-3xl border border-slate-700 bg-slate-950/80 p-6 shadow-inner shadow-black/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Top risk drivers</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">What should be fixed first</h2>
          <p className="mt-2 text-sm text-slate-400">Ranked list of the highest-impact risks across the project.</p>
        </div>
        <div className="rounded-3xl bg-slate-900/80 px-4 py-3 text-sm text-slate-300">Showing top {Math.min(drivers.length, 10)} drivers</div>
      </div>

      <div className="mt-6 space-y-4">
        {drivers.map((driver, index) => (
          <div key={`${driver.title}-${index}`} className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">#{index + 1} · {driver.category}</div>
                <h3 className="mt-2 text-lg font-semibold text-white">{driver.title}</h3>
              </div>
              <div className="rounded-full bg-slate-800 px-3 py-1 text-sm font-semibold text-slate-100">Score {Math.round(driver.score)}</div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-sm uppercase tracking-[0.2em] text-slate-500">Why this matters</div>
                <p className="mt-2 text-sm leading-6 text-slate-300">{driver.description}</p>
              </div>
              <div>
                <div className="text-sm uppercase tracking-[0.2em] text-slate-500">Recommended action</div>
                <p className="mt-2 text-sm leading-6 text-slate-300">{driver.recommendation_hint}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function SprintRiskChart({sprintRisks}){
  const chartItems = sprintRisks.slice(0, 12)

  return (
    <section className="rounded-3xl border border-slate-700 bg-slate-950/80 p-6 shadow-inner shadow-black/20">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Sprint risks</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Risk trend by sprint</h2>
        <p className="mt-2 text-sm text-slate-400">Per-sprint risk score helps judges see when risk peaks across the timeline.</p>
      </div>

      <div className="mt-6 space-y-4">
        <div className="grid gap-3">
          {chartItems.map(item => (
            <div key={item.sprint_id} className="space-y-2">
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>Sprint {item.sprint_id}</span>
                <span>{Math.round(item.risk_score)}</span>
              </div>
              <div className="h-3 rounded-full bg-slate-800">
                <div className={`${getRiskColor(item.risk_score).bg} h-3 rounded-full`} style={{ width: `${Math.round(item.risk_score)}%` }} />
              </div>
            </div>
          ))}
        </div>
        {sprintRisks.length === 0 && <div className="text-sm text-slate-500">Sprint risk details are not available.</div>}
      </div>
    </section>
  )
}

function CriticalPathPage({session}){
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deps, setDeps] = useState(null)
  const sessionId = session?.project_summary?.session_id || ''

  const fetchDependencies = async ()=>{
    if(!sessionId){
      setError(new Error('Missing session id'))
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try{
      const response = await api.dependencies(sessionId)
      setDeps(response)
    }catch(err){
      setError(err)
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{ fetchDependencies() }, [sessionId])

  if(loading){
    return (
      <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-inner shadow-black/20">
        <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Critical path</p>
        <div className="mt-4 text-sm text-slate-400">Loading dependency graph and critical path details…</div>
      </section>
    )
  }

  if(error){
    return (
      <section className="rounded-3xl border border-rose-600 bg-rose-900/10 p-6 shadow-inner shadow-black/20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-rose-400">Critical path</p>
            <h2 className="mt-2 text-2xl font-semibold text-rose-100">Unable to load dependency analysis</h2>
            <p className="mt-2 text-sm text-rose-300">{error.message || 'Failed to retrieve critical path data.'}</p>
          </div>
          <button onClick={fetchDependencies} className="rounded-2xl border border-rose-500 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200">Retry</button>
        </div>
      </section>
    )
  }

  if(!deps){
    return (
      <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-inner shadow-black/20">
        <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Critical path</p>
        <div className="mt-4 text-sm text-slate-400">No dependency analysis is available for this session.</div>
      </section>
    )
  }

  const chain = Array.isArray(deps.critical_path) ? deps.critical_path : []
  const highRisk = Array.isArray(deps.high_risk_items) ? deps.high_risk_items : []
  const mediumRisk = Array.isArray(deps.medium_risk_items) ? deps.medium_risk_items : []
  const lowRisk = Array.isArray(deps.low_risk_items) ? deps.low_risk_items : []

  const renderIdNode = (id, index) => (
    <div key={id + index} className="inline-flex items-center gap-4">
      <div className="rounded-3xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-black/20">{id}</div>
      {index < chain.length - 1 && <span className="text-slate-500">→</span>}
    </div>
  )

  return (
    <div className="space-y-6">
      {deps.has_cycles && (
        <section className="rounded-3xl border border-rose-500 bg-rose-950/80 p-6 text-slate-100 shadow-inner shadow-black/20">
          <div className="flex items-start gap-3">
            <div className="mt-1 rounded-full bg-rose-500/10 px-3 py-1 text-sm font-semibold text-rose-200">Warning</div>
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-rose-400">Circular dependency detected</p>
              <h2 className="mt-2 text-lg font-semibold text-white">The dependency graph contains cycles.</h2>
              <p className="mt-2 text-sm text-slate-300">A circular dependency can prevent the schedule from resolving. Investigate the listed items and break dependency loops.</p>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-inner shadow-black/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Critical path</p>
            <h2 className="mt-2 text-3xl font-extrabold text-white">Project critical path</h2>

          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Path duration" value={`${deps.critical_path_duration_days?.toFixed(1) ?? '—'} days`} />
            <MetricCard label="Items on path" value={deps.critical_path_item_count ?? chain.length} />
            <MetricCard label="Growth vs baseline" value={`${deps.critical_path_growth_percent?.toFixed(1) ?? '—'}%`} />
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-700 bg-slate-950/80 p-6 shadow-inner shadow-black/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Dependency chain</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Ordered critical path</h2>
          </div>

        </div>
        <div className="mt-6 overflow-x-auto pb-2">
          <div className="inline-flex items-center gap-3 whitespace-nowrap">
            {chain.length > 0 ? chain.map(renderIdNode) : (
              <span className="text-slate-400">Critical path is not available for this session.</span>
            )}
          </div>
        </div>
      </section>

      {highRisk.length > 0 && (
        <section className="rounded-3xl border border-rose-500/40 bg-rose-950/20 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-rose-400">High risk items on critical path</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {highRisk.map((id, i) => (
              <span key={i} className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-sm font-semibold text-rose-200">{id}</span>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function RiskGroupList({title, items, color}){
  const colorStyles = {
    rose: 'bg-rose-500/10 text-rose-200 border-rose-500/20',
    amber: 'bg-amber-500/10 text-amber-200 border-amber-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-200 border-emerald-500/20',
  }

  return (
    <div className="rounded-3xl border border-slate-700 bg-slate-950/80 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm uppercase tracking-[0.2em] text-slate-400">{title}</div>
          <div className="mt-2 text-3xl font-semibold text-white">{items.length}</div>
        </div>
        <div className={`rounded-full px-3 py-1 text-xs font-semibold ${colorStyles[color]}`}>{title.split(' ')[0]}</div>
      </div>
      <div className="mt-5 space-y-2">
        {items.length > 0 ? items.map((itemId, index) => (
          <div key={`${itemId}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-200">
            {itemId}
          </div>
        )) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-500">No items in this group.</div>
        )}
      </div>
    </div>
  )
}

function SectionPlaceholder({title, description}){
  return (
    <section className="rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-inner shadow-black/20">
      <p className="text-sm uppercase tracking-[0.3em] text-amber-400">{title}</p>
      <h2 className="mt-2 text-3xl font-semibold text-white">{title} content coming soon</h2>
      <p className="mt-3 text-sm text-slate-400">{description}</p>
    </section>
  )
}

export function Dashboard({session, onReset}){
  const [active, setActive] = useState('overview')

  const sessionId = session?.project_summary?.session_id || ''


  if (!session) return null

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-700 bg-slate-950/90 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Session dashboard</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Project analytics</h2>
          </div>
          <button onClick={onReset} className="rounded-2xl border border-rose-500 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20">
            New Project
          </button>
        </div>

        <div className="sticky top-0 z-20 mt-5 -mx-2 px-2 pt-2 pb-2 flex flex-wrap gap-2 bg-slate-950/95 backdrop-blur border-b border-slate-800">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition whitespace-nowrap ${
                active === tab.key
                  ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {active === 'overview' && <>
        <OverviewPage session={session} onNavigate={setActive} />
        <DelayDiagnosis session={session} />
      </>}
      {active === 'risk' && <RiskPage session={session} />}
      {active === 'critical-path' && <CriticalPathPage session={session} />}
      {active === 'forecast' && <ForecastPage session={session} />}
      {active === 'recovery-plans' && <RecoveryPlansPage session={session} />}
      {active === 'actions' && <ActionsPage session={session} onSimulated={() => setActive('compare')} />}
      {active === 'compare' && <ReforecastPage session={session} />}
      {active === 'sprint-health' && <SprintHealth session={session} />}
      {active === 'reasoning-trace' && <ReasoningTrace session={session} />}
    </div>
  )
}
