import 'dotenv/config';
import { main } from './sync-worker/index.js';

const intervalMinutes = Number(process.env.SYNC_INTERVAL_MINUTES || 0);

async function runOnce() {
  try {
    await main();
  } catch (error) {
    console.error('Sync cycle failed:', error);
  }
}

async function start() {
  await runOnce();

  if (intervalMinutes > 0) {
    const intervalMs = intervalMinutes * 60 * 1000;
    console.log(`⏰ Scheduling sync every ${intervalMinutes} minute(s)`);
    setInterval(runOnce, intervalMs);
  }
}

start().catch(console.error);

