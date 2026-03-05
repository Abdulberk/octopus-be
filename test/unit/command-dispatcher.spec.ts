import type { Logger } from '../../src/core/contracts/logger';
import { CommandDispatcher } from '../../src/services/commands/command-dispatcher';
import { IdempotencyStore } from '../../src/services/commands/idempotency-store';

const noopLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

describe('CommandDispatcher', () => {
  it('handles valid command and returns duplicate result for repeated correlationId', async () => {
    const playHandler = jest.fn(async () => ({ state: 'playing' }));

    const dispatcher = new CommandDispatcher(
      {
        play: playHandler,
      },
      noopLogger,
      new IdempotencyStore({
        ttlMs: 10_000,
        maxEntries: 100,
      }),
      {
        deviceId: 'device-1',
      },
    );

    const payload = JSON.stringify({
      command: 'play',
      correlationId: 'abc-123',
      timestamp: Date.now(),
    });

    const first = await dispatcher.dispatch(payload);
    const second = await dispatcher.dispatch(payload);

    expect(first.status).toBe('success');
    expect(second.status).toBe('success');
    expect(second.duplicate).toBe(true);
    expect(playHandler).toHaveBeenCalledTimes(1);
  });

  it('returns schema error for invalid set_volume payload', async () => {
    const dispatcher = new CommandDispatcher(
      {},
      noopLogger,
      new IdempotencyStore({
        ttlMs: 10_000,
        maxEntries: 100,
      }),
      {
        deviceId: 'device-1',
      },
    );

    const payload = JSON.stringify({
      command: 'set_volume',
      correlationId: 'abc-124',
      timestamp: Date.now(),
      payload: { volume: 120 },
    });

    const result = await dispatcher.dispatch(payload);

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('INVALID_COMMAND');
  });

  it('returns json error for malformed payload', async () => {
    const dispatcher = new CommandDispatcher(
      {},
      noopLogger,
      new IdempotencyStore({
        ttlMs: 10_000,
        maxEntries: 100,
      }),
      {
        deviceId: 'device-1',
      },
    );

    const result = await dispatcher.dispatch('{invalid');

    expect(result.status).toBe('error');
    expect(result.command).toBe('unknown');
    expect(result.error?.code).toBe('INVALID_JSON');
  });
});
