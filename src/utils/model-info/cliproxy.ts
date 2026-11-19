import type { ModelEnricher, ModelEnrichmentResult } from '../../core/model-enrichment'
import { createModelLimits } from '../../core/model-types'

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function positiveInteger(...values: unknown[]): number | undefined {
  return values.find((value): value is number => Number.isSafeInteger(value) && (value as number) > 0)
}

function strings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return [...new Set(value.flatMap((item) => typeof item === 'string' && item.trim() ? [item.trim()] : []))]
}

/** Reads deployment metadata by exact gateway ID; aliases are never guessed. */
export function createCLIProxyEnricher(data: unknown): ModelEnricher {
  const entries = record(data) ? (Array.isArray(data.models) ? data.models : data.data) : undefined
  if (!Array.isArray(entries)) throw new Error('Expected CLIProxy models or data array')

  const metadata = new Map<string, Record<string, unknown>>()
  for (const entry of entries) {
    if (!record(entry)) continue
    const id = typeof entry.slug === 'string' && entry.slug.trim() ? entry.slug : entry.id
    if (typeof id === 'string' && id.trim() && !metadata.has(id)) metadata.set(id, entry)
  }

  return {
    enrich(model) {
      const entry = metadata.get(model.id)
      if (!entry) return {}

      const result: {
        -readonly [Key in keyof ModelEnrichmentResult]: ModelEnrichmentResult[Key]
      } = {}
      const name = entry.display_name ?? entry.name
      if (typeof name === 'string' && name.trim()) result.metadataName = name.trim()

      const context = positiveInteger(entry.context_window, entry.max_context_window)
      const output = positiveInteger(entry.max_tokens, entry.max_output_tokens, entry.max_completion_tokens)
      const limit = createModelLimits(context, output)
      if (limit) {
        result.limit = { ...limit, ...(limit.context > limit.output ? { input: limit.context - limit.output } : {}) }
      }

      const input = strings(entry.input_modalities)
      if (input?.length) result.modalities = { input, output: ['text'] }

      if (Array.isArray(entry.supported_reasoning_levels)) {
        const efforts = strings(entry.supported_reasoning_levels.map((level) => record(level) ? level.effort : level))!
        // An empty array is authoritative. Missing or malformed values stay unknown.
        if (efforts.length || entry.supported_reasoning_levels.length === 0) {
          result.reasoning = efforts.some((effort) => effort !== 'none')
          result.variants = Object.fromEntries(efforts.map((effort) => [effort, { reasoningEffort: effort }]))
        }
      }
      return result
    },
  }
}
