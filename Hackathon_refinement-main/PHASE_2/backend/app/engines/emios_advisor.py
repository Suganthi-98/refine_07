"""
EMIOSAdvisor — Phase 7 (AI Co-pilot Upgrade), Stage 7 of the roadmap.

The current AI advisor (app/engines/ai_advisor.py + NarrativeService)
narrates the forecast. EMIOSAdvisor explains the reasoning: the diagnosis,
the eliminated hypotheses, the decision rationale, the tradeoff.

Two paths, same contract (EMIOSAdvisorOutput always has all 4 fields
populated -- fallback is a designed-for path, not a degraded error state):

  1. render_fallback()   -- deterministic, synchronous, no network call.
                             REQUIRED per roadmap Prompt 7.1: "Deterministic
                             fallback renderer must populate all 4 fields
                             without calling the LLM." This is what
                             EMIOSAdvisor().run() uses by default.

  2. run_with_ai(client) -- optional. Takes any object exposing an async
                             `.generate(system_prompt, user_message) -> dict`
                             method (see note below on why this isn't wired
                             to the existing singleton ClaudeClient/BoschClient
                             yet), calls it with EMIOS_SYSTEM_PROMPT, and
                             validates the JSON response against
                             EMIOSAdvisorOutput. Any failure (timeout, bad
                             JSON, disabled flag, no client) falls back to
                             render_fallback() -- this layer can never block
                             or corrupt the deterministic pipeline.

Known integration gap (tracked, not yet closed): app/ai/client.py's
BoschClient/ClaudeClient currently bake ONE system prompt in at
construction time (ADVISOR_SYSTEM_PROMPT / BOSCH_SYSTEM_PROMPT), because
today there is only one advisor. To actually call a real LLM from
run_with_ai() in production, either (a) extend BoschClient/ClaudeClient to
accept a system_prompt override per-call, or (b) construct a second client
instance at app startup using EMIOS_SYSTEM_PROMPT. Until one of those is
done, run_with_ai() will simply always fall back -- which is safe, correct,
and exactly what INVARIANT 7 (Final.2) requires either way.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional, Protocol

from app.engines.emios_advisor_contract import EMIOSAdvisorInput, EMIOSAdvisorOutput

logger = logging.getLogger(__name__)


EMIOS_SYSTEM_PROMPT = """\
You are EMIOS, an Engineering Management Intelligence co-pilot. You reason like a senior
engineering director — not a reporter. Your job is to explain the reasoning chain that
the EMIOS engines have already completed, in language a non-technical PM can act on.

Rules:
1. You NEVER compute metrics. All numbers come from the input fields.
2. You NEVER generate recommendations independently.
3. You explain WHY — the causal chain, the eliminated hypotheses, the decision rationale.
4. You always state what was ruled out and why, not just what was chosen.
5. If the diagnosis confidence is below 60%, you must say so and name the uncertainty.
6. You write in plain English. No bullet lists. Maximum 4 sentences per section.

Respond with ONLY a JSON object, no markdown fences, matching exactly:
{
  "executive_summary": "1 sentence: situation + root cause + action",
  "reasoning_explanation": "2-3 sentences: what the engine found + what it ruled out",
  "decision_explanation": "2 sentences: why this action, what is being sacrificed",
  "confidence_statement": "1 sentence: how confident, why"
}
"""


class _GeneratesJSON(Protocol):
    async def generate(self, system_prompt: str, user_message: str) -> Any: ...


def render_fallback(inp: EMIOSAdvisorInput) -> EMIOSAdvisorOutput:
    """
    Deterministic f-string template. Populates all 4 output fields
    directly from EMIOSAdvisorInput -- no LLM call, cannot fail on
    network/parsing grounds. This is the required baseline path.
    """
    obs = inp.observation_summary
    diag = inp.diagnosis_summary
    impact = inp.impact_summary
    decision = inp.decision_summary

    executive_summary = (
        f"{obs.primary_signal}; root cause is {diag.root_cause} "
        f"({diag.confidence_pct}% confidence) — recommended action: {decision.chosen_action}."
    )

    ruled_out = (
        f" It ruled out: {diag.top_eliminated_hypothesis}."
        if diag.top_eliminated_hypothesis
        else " No competing hypotheses were strong enough to record."
    )
    reasoning_explanation = (
        f"The engine identified {diag.root_cause} as the leading cause, following the chain "
        f"{' → '.join(diag.causal_chain) if diag.causal_chain else 'observed to root cause'}. "
        f"The dominant impact is on {impact.dominant_dimension.lower()} "
        f"(magnitude {impact.dominant_magnitude:.1f}).{ruled_out}"
    )

    sacrifice = f" This means accepting: {impact.sacrifice_statement}." if impact.sacrifice_statement else ""
    rejected = (
        f" over the alternative of {decision.top_rejected_alternative}"
        if decision.top_rejected_alternative
        else ""
    )
    decision_explanation = (
        f"{decision.chosen_action} was chosen{rejected}, with an expected value of "
        f"{decision.expected_value:.1f}.{sacrifice}"
    )

    confidence_note = (
        " This is below the 60% reliability threshold, so treat the root cause as a working hypothesis, not a certainty."
        if diag.confidence_pct < 60
        else ""
    )
    confidence_statement = (
        f"Confidence in this diagnosis is {diag.confidence_pct}%, and the project is currently in the "
        f"{inp.recovery_state} recovery state.{confidence_note}"
    )

    return EMIOSAdvisorOutput(
        executive_summary=executive_summary,
        reasoning_explanation=reasoning_explanation,
        decision_explanation=decision_explanation,
        confidence_statement=confidence_statement,
        status="fallback",
    )


class EMIOSAdvisor:
    """Stage 7: reasoning co-pilot. See module docstring for the two paths."""

    def run(self, inp: EMIOSAdvisorInput) -> EMIOSAdvisorOutput:
        """Synchronous, deterministic. Use this from the pipeline by default."""
        return render_fallback(inp)

    async def run_with_ai(
        self,
        inp: EMIOSAdvisorInput,
        client: Optional[_GeneratesJSON] = None,
        ai_advisor_enabled: bool = True,
    ) -> EMIOSAdvisorOutput:
        """
        Optional LLM-backed path. Falls back to render_fallback() on any
        failure (disabled flag, missing client, bad JSON, exception) --
        never raises, never blocks the pipeline.
        """
        if not ai_advisor_enabled or client is None:
            return render_fallback(inp)

        try:
            user_message = (
                "Here is the reasoning-chain snapshot to explain:\n\n"
                f"{inp.model_dump_json(indent=2)}"
            )
            raw = await client.generate(EMIOS_SYSTEM_PROMPT, user_message)
            if isinstance(raw, str):
                raw = json.loads(raw)
            output = EMIOSAdvisorOutput.model_validate({**raw, "status": "ok"})
            return output
        except Exception as exc:  # noqa: BLE001 — any failure degrades to fallback
            logger.warning("EMIOSAdvisor AI call failed (%s); using deterministic fallback", exc)
            return render_fallback(inp)
