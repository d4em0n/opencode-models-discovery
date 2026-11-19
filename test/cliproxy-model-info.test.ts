import { describe, expect, it, vi } from 'vitest'
import { createCLIProxyEnricher } from '../src/utils/model-info/cliproxy'
import { resolveModelInfoEnricher } from '../src/core/enricher-resolver'
import { discoverInventory } from '../src/v2/discovery'
import { parseProviderDiscoveryOptions } from '../src/v2/provider-config'

const context = { filterNonChat: true }
const provider = {
  id: 'gateway',
  package: '@opencode/ai/providers/openai-compatible',
  settings: { baseURL: 'https://gateway.example/proxy/v1' },
  apiKey: 'test-key',
}

describe('CLIProxy enhanced catalog', () => {
  it('reads deployment context, output, modalities and arbitrary advertised reasoning efforts', () => {
    const enricher = createCLIProxyEnricher({ models: [{
      slug: 'aliased-model', display_name: 'Deployment',
      context_window: 272_000, max_context_window: 1_050_000, max_tokens: 128_000,
      input_modalities: ['text', 'image'],
      supported_reasoning_levels: [{ effort: 'max' }, { effort: 'low' }, 'ultra', 'max'],
    }] })
    expect(enricher.enrich({ id: 'aliased-model' }, context)).toEqual({
      metadataName: 'Deployment',
      limit: { context: 272_000, output: 128_000, input: 144_000 },
      modalities: { input: ['text', 'image'], output: ['text'] },
      reasoning: true,
      variants: { max: { reasoningEffort: 'max' }, low: { reasoningEffort: 'low' }, ultra: { reasoningEffort: 'ultra' } },
    })
    expect(enricher.enrich({ id: 'model' }, context)).toEqual({})
  })

  it('handles absent output without inventing a model-specific limit', () => {
    const enricher = createCLIProxyEnricher({ models: [{ slug: 'flash', context_window: 1_048_576 }] })
    expect(enricher.enrich({ id: 'flash' }, context)).toEqual({
      limit: { context: 1_048_576, output: 32_000, input: 1_016_576 },
    })
  })

  it('ignores malformed values and honors an explicitly empty effort list', () => {
    const enricher = createCLIProxyEnricher({ data: [null, {
      id: 'plain', context_window: -1, max_context_window: 8192,
      max_tokens: Number.NaN, max_output_tokens: 1_000_000,
      input_modalities: [null, 1], supported_reasoning_levels: [],
    }, { id: 'broken', context_window: '8192', supported_reasoning_levels: [{ effort: 1 }] }] })
    expect(enricher.enrich({ id: 'plain' }, context)).toEqual({
      limit: { context: 8192, output: 8192 }, reasoning: false, variants: {},
    })
    expect(enricher.enrich({ id: 'broken' }, context)).toEqual({})
    expect(() => createCLIProxyEnricher({ error: 'unavailable' })).toThrow()
  })

  it('fetches the enhanced catalog with saved authentication and preserves proxy subpaths', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ models: [] })))
    await resolveModelInfoEnricher({ baseURL: provider.settings.baseURL, apiKey: provider.apiKey, fetcher }, { format: 'cliproxy' })
    expect(fetcher).toHaveBeenCalledWith('https://gateway.example/proxy/v1/models?client_version=opencode-models-discovery', expect.objectContaining({
      method: 'GET', signal: expect.any(AbortSignal),
    }))
    expect(new Headers(fetcher.mock.calls[0][1].headers).get('authorization')).toBe('Bearer test-key')
  })

  it('automatically applies metadata changes and newly added models on the next discovery', async () => {
    let revision = 0
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('client_version=')) return new Response(JSON.stringify({ models: [
        { slug: 'flash', context_window: revision ? 500_000 : 272_000, supported_reasoning_levels: revision ? ['low', 'high', 'max'] : ['high'] },
        { slug: 'new-model', context_window: 1_048_576, supported_reasoning_levels: ['ultra'] },
      ] }))
      return new Response(JSON.stringify({ data: [{ id: 'flash' }, ...(revision ? [{ id: 'new-model' }] : [])] }))
    })
    const options = new Map([[provider.id, parseProviderDiscoveryOptions({ enabled: true, modelInfoFormat: 'cliproxy', endpoint: '/proxy/v1/models' })!]])
    const first = (await discoverInventory([provider], options, fetcher)).get(provider.id)!
    expect(first.get('flash')?.limit.context).toBe(272_000)
    expect(first.get('flash')?.variants?.map((v) => v.id)).toEqual(['high'])
    expect(first.has('new-model')).toBe(false)
    revision++
    const second = (await discoverInventory([provider], options, fetcher)).get(provider.id)!
    expect(second.get('flash')?.limit.context).toBe(500_000)
    expect(second.get('flash')?.variants?.map((v) => v.id)).toEqual(['low', 'high', 'max'])
    expect(second.get('new-model')?.limit.context).toBe(1_048_576)
    expect(second.get('new-model')?.variants?.map((v) => v.id)).toEqual(['ultra'])
  })

  it.each(['http', 'invalid'])('preserves the previous provider inventory when metadata fails: %s', async (failure) => {
    const fetcher = vi.fn(async (url: string | URL | Request) => String(url).includes('client_version=')
      ? new Response(JSON.stringify({ error: 'failed' }), { status: failure === 'http' ? 503 : 200 })
      : new Response(JSON.stringify({ data: [{ id: 'flash' }] })))
    const options = new Map([[provider.id, parseProviderDiscoveryOptions({ enabled: true, modelInfoFormat: 'cliproxy' })!]])
    const logger = { warn: vi.fn() }
    expect((await discoverInventory([provider], options, fetcher, undefined, { logger })).has(provider.id)).toBe(false)
    expect(logger.warn).toHaveBeenCalled()
  })
})
