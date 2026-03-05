import type { Logger } from '../../src/core/contracts/logger';
import type {
  MqttMessage,
  MqttQos,
  MqttTransport,
} from '../../src/core/contracts/mqtt';
import { MqttClientService } from '../../src/infrastructure/mqtt/mqtt-client-service';

class FlakyTransport implements MqttTransport {
  public connectAttempts = 0;
  public subscribeCalls = 0;
  private disconnectListener?: (error?: Error) => void;
  private messageHandler?: (message: MqttMessage) => Promise<void> | void;

  async connect(): Promise<void> {
    this.connectAttempts += 1;
    if (this.connectAttempts < 3) {
      throw new Error('broker-unreachable');
    }
  }

  async disconnect(): Promise<void> {
    this.disconnectListener?.();
  }

  async subscribe(
    topic: string,
    qos: MqttQos,
    handler: (message: MqttMessage) => Promise<void> | void,
  ): Promise<void> {
    this.subscribeCalls += 1;
    this.messageHandler = handler;
    void topic;
    void qos;
  }

  async publish(
    _topic: string,
    _payload: string,
    _qos: MqttQos,
  ): Promise<void> {
    return;
  }

  onDisconnect(handler: (error?: Error) => void): void {
    this.disconnectListener = handler;
  }

  async inject(topic: string, payload: string): Promise<void> {
    if (!this.messageHandler) {
      return;
    }
    await this.messageHandler({
      topic,
      payload,
      qos: 0,
      receivedAt: Date.now(),
    });
  }
}

const noopLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

describe('MqttClientService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries connection with exponential backoff and eventually subscribes', async () => {
    const transport = new FlakyTransport();
    const service = new MqttClientService(transport, noopLogger, {
      commandTopic: 'players/test-device/commands',
      eventsTopic: 'players/test-device/events',
      statusTopic: 'players/test-device/status',
      commandQos: 1,
      eventQos: 1,
      statusQos: 0,
      reconnectPolicy: {
        initialDelayMs: 1_000,
        maxDelayMs: 60_000,
        multiplier: 2,
        jitterRatio: 0,
      },
      heartbeatIntervalMs: 30_000,
    });

    await service.start(async () => undefined);
    expect(transport.connectAttempts).toBe(1);
    expect(transport.subscribeCalls).toBe(0);

    jest.advanceTimersByTime(1_000);
    await Promise.resolve();
    expect(transport.connectAttempts).toBe(2);

    jest.advanceTimersByTime(2_000);
    await Promise.resolve();
    expect(transport.connectAttempts).toBe(3);
    expect(transport.subscribeCalls).toBe(1);

    await service.stop();
  });
});
