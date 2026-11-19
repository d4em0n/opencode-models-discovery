import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAutoRefresh } from '../../src/v2/auto-refresh'
import { parseProviderDiscoveryOptions } from '../../src/v2/provider-config'

afterEach(() => vi.useRealTimers())

describe('automatic catalog refresh', () => {
  it('does not overlap slow refreshes, retries failures and stops on disposal', async () => {
    vi.useFakeTimers()
    let finish!: () => void
    const refresh = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
      .mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    const scheduler = createAutoRefresh(refresh)
    scheduler.configure(10_000)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(refresh).toHaveBeenCalledTimes(1)
    finish()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(refresh).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(refresh).toHaveBeenCalledTimes(3)
    scheduler.dispose()
    scheduler.configure(10_000)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it('applies interval changes and disables polling without duplicate timers', async () => {
    vi.useFakeTimers()
    const refresh = vi.fn().mockResolvedValue(undefined)
    const scheduler = createAutoRefresh(refresh)
    scheduler.configure(10_000)
    scheduler.configure(10_000)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(refresh).toHaveBeenCalledTimes(1)
    scheduler.configure(20_000)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(refresh).toHaveBeenCalledTimes(2)
    scheduler.configure(0)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(refresh).toHaveBeenCalledTimes(2)
    scheduler.dispose()
  })

  it('requires opt-in and bounds intervals to valid timer durations', () => {
    expect(parseProviderDiscoveryOptions({ enabled: true })?.refreshIntervalMs).toBe(0)
    expect(parseProviderDiscoveryOptions({ enabled: true, refreshIntervalMs: -1 })?.refreshIntervalMs).toBe(0)
    expect(parseProviderDiscoveryOptions({ enabled: true, refreshIntervalMs: 1 })?.refreshIntervalMs).toBe(10_000)
    expect(parseProviderDiscoveryOptions({ enabled: true, refreshIntervalMs: 1e12 })?.refreshIntervalMs).toBe(2_147_483_647)
  })
})
