import { createRuntime } from './container';
import { loadAppConfig } from './config';

export async function bootstrap(): Promise<void> {
  const config = loadAppConfig();
  const runtime = createRuntime(config);

  await runtime.start();

  const shutdown = async (): Promise<void> => {
    await runtime.stop();
    process.exit(0);
  };

  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}
