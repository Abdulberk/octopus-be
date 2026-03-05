export type MqttQos = 0 | 1 | 2;

export interface MqttMessage {
  topic: string;
  payload: string;
  qos: MqttQos;
  receivedAt: number;
}

export interface MqttTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(
    topic: string,
    qos: MqttQos,
    handler: (message: MqttMessage) => Promise<void> | void,
  ): Promise<void>;
  publish(topic: string, payload: string, qos: MqttQos): Promise<void>;
  onDisconnect?(handler: (error?: Error) => void): void;
}
