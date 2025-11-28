import 'dotenv/config';
import express from 'express';
import { main } from './sync-worker/index.js';

type SyncStatus = {
  status: 'idle' | 'running' | 'success' | 'error';
  lastRun: string | null;
  trigger: 'auto' | 'manual';
  message?: string;
};

const intervalMinutes = Number(process.env.SYNC_INTERVAL_MINUTES || 0);
const port = Number(process.env.PORT || 3000);

process.on('uncaughtException', (error: any) => {
  if (error?.code === 'EBADF' && error?.syscall === 'close') {
    console.warn('⚠️  Ignoring EBADF close error (likely from GC cleaning up mock SFTP).');
    return;
  }
  console.error('Uncaught exception:', error);
});

let isSyncRunning = false;
let lastSyncStatus: SyncStatus = {
  status: 'idle',
  lastRun: null,
  trigger: 'auto',
  message: 'Not run yet'
};

async function runOnce(trigger: 'auto' | 'manual' = 'auto') {
  if (isSyncRunning) {
    console.log('⚠️  Sync already running, skipping new request');
    return;
  }

  isSyncRunning = true;
  lastSyncStatus = { status: 'running', lastRun: new Date().toISOString(), trigger };

  try {
    await main();
    lastSyncStatus = {
      status: 'success',
      lastRun: new Date().toISOString(),
      trigger,
      message: 'Sync completed successfully'
    };
  } catch (error: any) {
    console.error('Sync cycle failed:', error);
    lastSyncStatus = {
      status: 'error',
      lastRun: new Date().toISOString(),
      trigger,
      message: error?.message || 'Unknown error'
    };
  } finally {
    isSyncRunning = false;
  }
}

async function startScheduler() {
  // Run immediately once
  await runOnce('auto');

  if (intervalMinutes > 0) {
    const intervalMs = intervalMinutes * 60 * 1000;
    console.log(`⏰ Scheduling sync every ${intervalMinutes} minute(s)`);
    setInterval(() => runOnce('auto'), intervalMs);
  }
}

const app = express();

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    sync: lastSyncStatus,
    isSyncRunning
  });
});

app.post('/sync', async (_req, res) => {
  if (isSyncRunning) {
    res.status(429).json({ status: 'running', message: 'Sync already in progress' });
    return;
  }

  runOnce('manual').catch(() => {});
  res.json({ status: 'queued', message: 'Manual sync started' });
});

app.listen(port, () => {
  console.log(`🌐 Sync service listening on port ${port}`);
  startScheduler().catch((error) => {
    console.error('Failed to start scheduler:', error);
  });
});

