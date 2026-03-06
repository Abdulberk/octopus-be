import type { Logger } from '../../core/contracts/logger';
import type {
  MqttMessage,
  MqttQos,
  MqttTransport,
} from '../../core/contracts/mqtt';
import type { CommandResultEvent, StatusEvent } from '../../core/domain/events';
import { computeBackoffDelay, type RetryPolicy } from '../../core/domain/retry';

type CommandPayloadHandler = (payload: string) => Promise<void>;

interface MqttClientServiceOptions {
  commandTopic: string;
  eventsTopic: string;
  statusTopic: string;
  commandQos: MqttQos;
  eventQos: MqttQos;
  statusQos: MqttQos;
  reconnectPolicy: RetryPolicy;
  heartbeatIntervalMs: number;
}

export class MqttClientService {
  private running = false;
  private connected = false;
  private reconnectAttempt = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private heartbeatTimer?: NodeJS.Timeout;
  private commandHandler?: CommandPayloadHandler;
  private readonly inboundMessageHandler = async (
    message: MqttMessage,
  ): Promise<void> => {
    if (!this.commandHandler) {
      return;
    }

    await this.commandHandler(message.payload);
  };

  constructor(
    private readonly transport: MqttTransport,
    private readonly logger: Logger,
    private readonly options: MqttClientServiceOptions,
  ) {
    if (this.transport.onDisconnect) {
      this.transport.onDisconnect((error) => {
        this.connected = false;
        this.logger.warn('MQTT disconnected', { error: error?.message });
        this.scheduleReconnect();
      });
    }
  }

  async start(commandHandler: CommandPayloadHandler): Promise<void> {
    this.running = true;
    this.commandHandler = commandHandler;
    await this.connectAndSubscribe();
    this.startHeartbeat();
  }

  async stop(): Promise<void> {
    this.running = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    await this.safePublishStatus({
      type: 'status',
      status: 'offline',
      deviceId: extractDeviceIdFromTopic(this.options.statusTopic),
      ts: Date.now(),
    });

    await this.transport.disconnect();
  }

  async publishCommandResult(event: CommandResultEvent): Promise<void> {
    await this.transport.publish(
      this.options.eventsTopic,
      JSON.stringify(event),
      this.options.eventQos,
    );
  }

  async publishStatus(event: StatusEvent): Promise<void> {
    await this.transport.publish(
      this.options.statusTopic,
      JSON.stringify(event),
      this.options.statusQos,
    );
  }

  private async connectAndSubscribe(): Promise<void> {
    try {
      await this.transport.connect();
      this.connected = true;
      this.reconnectAttempt = 0;

      this.logger.info('MQTT connected', {
        commandTopic: this.options.commandTopic,
      });

      await this.transport.subscribe(
        this.options.commandTopic,
        this.options.commandQos,
        this.inboundMessageHandler,
      );

      await this.safePublishStatus({
        type: 'status',
        status: 'online',
        deviceId: extractDeviceIdFromTopic(this.options.statusTopic),
        ts: Date.now(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.error('MQTT connection attempt failed', { message });
      this.connected = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.running) {
      return;
    }

    if (this.reconnectTimer) {
      return;
    }

    this.reconnectAttempt += 1;
    const delay = computeBackoffDelay(
      this.reconnectAttempt,
      this.options.reconnectPolicy,
    );
    this.logger.warn('Scheduling MQTT reconnect', {
      attempt: this.reconnectAttempt,
      delay,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connectAndSubscribe();
    }, delay);
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      if (!this.running || !this.connected) {
        return;
      }

      void this.safePublishStatus({
        type: 'status',
        status: 'online',
        deviceId: extractDeviceIdFromTopic(this.options.statusTopic),
        ts: Date.now(),
        details: {
          heartbeat: true,
        },
      });
    }, this.options.heartbeatIntervalMs);
  }

  private async safePublishStatus(event: StatusEvent): Promise<void> {
    try {
      await this.publishStatus(event);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.warn('Unable to publish MQTT status event', { message });
    }
  }
}

function extractDeviceIdFromTopic(statusTopic: string): string {
  const tokens = statusTopic.split('/');
  return tokens[1] ?? 'unknown-device';
}
