import type {
  MqttMessage,
  MqttQos,
  MqttTransport,
} from '../../core/contracts/mqtt';

type SubscriptionHandler = (message: MqttMessage) => Promise<void> | void;

export class InMemoryMqttTransport implements MqttTransport {
  private connected = false;
  private readonly subscriptions = new Map<string, SubscriptionHandler[]>();
  private disconnectHandler?: (error?: Error) => void;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.disconnectHandler) {
      this.disconnectHandler();
    }
  }

  async subscribe(
    topic: string,
    _qos: MqttQos,
    handler: SubscriptionHandler,
  ): Promise<void> {
    const current = this.subscriptions.get(topic) ?? [];
    current.push(handler);
    this.subscriptions.set(topic, current);
  }

  async publish(topic: string, payload: string, qos: MqttQos): Promise<void> {
    if (!this.connected) {
      throw new Error('MQTT transport is not connected');
    }

    await this.dispatch(topic, payload, qos);
  }

  onDisconnect(handler: (error?: Error) => void): void {
    this.disconnectHandler = handler;
  }

  async injectMessage(
    topic: string,
    payload: string,
    qos: MqttQos = 0,
  ): Promise<void> {
    await this.dispatch(topic, payload, qos);
  }

  private async dispatch(
    topic: string,
    payload: string,
    qos: MqttQos,
  ): Promise<void> {
    const message: MqttMessage = {
      topic,
      payload,
      qos,
      receivedAt: Date.now(),
    };

    const handlers = Array.from(this.subscriptions.entries())
      .filter(([filter]) => topicMatches(filter, topic))
      .flatMap(([, value]) => value);

    for (const handler of handlers) {
      await handler(message);
    }
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
