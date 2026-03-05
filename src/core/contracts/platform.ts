export type VisibilityState = 'visible' | 'hidden';
export type LifecycleState = 'suspend' | 'resume';

export interface DeviceInfo {
  deviceId: string;
  model?: string;
  firmware?: string;
  platform: 'tizen' | 'web' | 'unknown';
}

export interface ScreenshotResult {
  format: 'image/png';
  base64: string;
  source: 'real' | 'mock';
}

export interface PlatformAdapter {
  getDeviceInfo(): Promise<DeviceInfo>;
  setVolume(value: number): Promise<void>;
  captureScreenshot(): Promise<ScreenshotResult>;
  onVisibilityChange(handler: (state: VisibilityState) => void): () => void;
  onLifecycleChange?(handler: (state: LifecycleState) => void): () => void;
}
