import { bootstrap } from './app/bootstrap';

void bootstrap().catch((error) => {
  const message = error instanceof Error ? error.message : 'unknown';
  console.error(
    JSON.stringify({
      ts: Date.now(),
      level: 'error',
      message: 'Fatal startup error',
      context: { message },
    }),
  );
  process.exit(1);
});
