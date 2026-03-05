import type { Logger } from '../../core/contracts/logger';
import type {
  MqttMessage,
  MqttQos,
  MqttTransport,
} from '../../core/contracts/mqtt';
import { AppError } from '../../core/errors/app-error';

interface NodeMqttTransportOptions {
  brokerUrl: string;
  username?: string;
  password?: string;
  clientId?: string;
  keepaliveSec?: number;
}

type SubscriptionHandler = (message: MqttMessage) => Promise<void> | void;

export class NodeMqttTransport implements MqttTransport {
  private client?: any;
  private readonly handlers = new Map<string, SubscriptionHandler[]>();
  private disconnectHandler?: (error?: Error) => void;

  constructor(
    private readonly options: NodeMqttTransportOptions,
    private readonly logger: Logger,
  ) {}

  async connect(): Promise<void> {
    const mqtt = tryLoadMqttLibrary();

    this.client = mqtt.connect(this.options.brokerUrl, {
      username: this.options.username,
      password: this.options.password,
      clientId: this.options.clientId,
      keepalive: this.options.keepaliveSec ?? 60,
      reconnectPeriod: 0,
    });

    await new Promise<void>((resolve, reject) => {
      const client = this.client;

      if (!client) {
        reject(new Error('MQTT client was not initialized'));
        return;
      }

      client.once('connect', () => resolve());
      client.once('error', (error: Error) => reject(error));
      client.on('close', () => {
        if (this.disconnectHandler) {
          this.disconnectHandler();
        }
      });

      client.on('message', (topic: string, payloadBuffer: Buffer) => {
        const payload = payloadBuffer.toString('utf8');
        void this.dispatch(topic, payload, 0);
      });
    });
  }

  async disconnect(): Promise<void> {
    if (!this.client) {
      return;
    }

    const client = this.client;

    await new Promise<void>((resolve) => {
      client.end(false, {}, () => resolve());
    });
  }

  async subscribe(
    topic: string,
    qos: MqttQos,
    handler: SubscriptionHandler,
  ): Promise<void> {
    if (!this.client) {
      throw new AppError(
        'MQTT_NOT_CONNECTED',
        'Cannot subscribe without an active MQTT connection',
      );
    }

    this.logger.info('Subscribing to MQTT topic', { topic, qos });
    await new Promise<void>((resolve, reject) => {
      this.client.subscribe(topic, { qos }, (error: Error | null) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    const currentHandlers = this.handlers.get(topic) ?? [];
    currentHandlers.push(handler);
    this.handlers.set(topic, currentHandlers);
  }

  async publish(topic: string, payload: string, qos: MqttQos): Promise<void> {
    if (!this.client) {
      throw new AppError(
        'MQTT_NOT_CONNECTED',
        'Cannot publish without an active MQTT connection',
      );
    }

    await new Promise<void>((resolve, reject) => {
      this.client.publish(topic, payload, { qos }, (error: Error | null) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  onDisconnect(handler: (error?: Error) => void): void {
    this.disconnectHandler = handler;
  }

  private async dispatch(
    topic: string,
    payload: string,
    qos: MqttQos,
  ): Promise<void> {
    const handlers = Array.from(this.handlers.entries())
      .filter(([filter]) => topicMatches(filter, topic))
      .flatMap(([, value]) => value);

    if (handlers.length === 0) {
      this.logger.debug('Received MQTT message with no matching handler', {
        topic,
      });
      return;
    }

    for (const handler of handlers) {
      await handler({
        topic,
        payload,
        qos,
        receivedAt: Date.now(),
      });
    }
  }
}

function tryLoadMqttLibrary(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('mqtt');
  } catch {
    throw new AppError(
      'MQTT_LIBRARY_MISSING',
      'The "mqtt" package is missing. Install it to use NodeMqttTransport.',
      false,
    );
  }
}

function topicMatches(filter: string, topic: string): boolean {
  if (filter === topic) {
    return true;
  }

  const filterTokens = filter.split('/');
  const topicTokens = topic.split('/');

  for (let index = 0; index < filterTokens.length; index += 1) {
    const current = filterTokens[index];
    const candidate = topicTokens[index];

    if (current === '#') {
      return true;
    }

    if (current === '+') {
      if (candidate === undefined) {
        return false;
      }
      continue;
    }

    if (candidate !== current) {
      return false;
    }
  }

  return filterTokens.length === topicTokens.length;
}
