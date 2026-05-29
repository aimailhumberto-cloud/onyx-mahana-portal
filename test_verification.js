import { spawn } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { getDb } = require('./server/db/database.js');
const { sendDailyReminders, sendDailySummary } = require('./server/notifications/index.js');

let serverProcess = null;

const cleanup = () => {
  if (serverProcess) {
    console.log('Shutting down server process...');
    serverProcess.kill();
  }
};

// Handle exit signals to avoid orphaned processes
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

async function runTests() {
  const db = getDb();
  const now = new Date();
  // Panama is UTC-5
  const panamaDate = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString().split('T')[0];

  console.log(`Panama reference date for tests: ${panamaDate}`);

  // 1. Clean up today's runs so that this integration test is perfectly deterministic
  console.log('Cleaning up today\'s scheduler runs in SQLite...');
  db.prepare('DELETE FROM scheduler_executions WHERE execution_date = ?').run(panamaDate);

  // 2. Spawn server process
  const childEnv = { ...process.env };
  delete childEnv.ALLOWED_ORIGINS;
  childEnv.PORT = '3101';
  childEnv.NODE_ENV = 'test';

  console.log('Starting backend server on port 3101...');
  serverProcess = spawn('node', ['server/server.js'], { env: childEnv });

  serverProcess.stdout.on('data', (data) => {
    console.log(`[Server Out] ${data.toString().trim()}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`[Server Err] ${data.toString().trim()}`);
  });

  // 3. Poll server status until ready
  let ready = false;
  console.log('Waiting for server to be ready...');
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch('http://localhost:3101/api/v1/api-status');
      if (res.ok) {
        ready = true;
        break;
      }
    } catch (e) {
      // Not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (!ready) {
    throw new Error('Server failed to start or did not respond within timeout.');
  }

  console.log('Server is ready! Running integration tests...\n');

  // a. API Status Check
  console.log('--- Test A: API Status ---');
  const statusRes = await fetch('http://localhost:3101/api/v1/api-status');
  if (statusRes.status !== 200) {
    throw new Error(`API Status returned code ${statusRes.status}, expected 200`);
  }
  const statusJson = await statusRes.json();
  if (!statusJson.success || statusJson.data.status !== 'ok') {
    throw new Error(`API Status response structure invalid: ${JSON.stringify(statusJson)}`);
  }
  console.log('✅ API Status check passed!\n');

  // b. JWT Bypass Check
  console.log('--- Test B: JWT Bypass Check ---');
  const bypassRes = await fetch('http://localhost:3101/api/v1/tours', {
    headers: {
      'x-api-key': 'mahana-dev-key-2026'
    }
  });
  if (bypassRes.status !== 401) {
    throw new Error(`JWT Bypass Check failed: Expected 401 Unauthorized, got ${bypassRes.status}`);
  }
  console.log('✅ JWT Bypass Check passed (401 received)! Bypass fully removed.\n');

  // c. CORS Hardening Check
  console.log('--- Test C: CORS Hardening ---');
  // Send simple request with origin
  const corsRes = await fetch('http://localhost:3101/api/v1/api-status', {
    headers: {
      'Origin': 'http://evil.com'
    }
  });
  const originHeader = corsRes.headers.get('access-control-allow-origin');
  const credentialsHeader = corsRes.headers.get('access-control-allow-credentials');
  console.log(`CORS Headers with unset ALLOWED_ORIGINS:`);
  console.log(`  Access-Control-Allow-Origin: ${originHeader}`);
  console.log(`  Access-Control-Allow-Credentials: ${credentialsHeader}`);

  if (credentialsHeader === 'true') {
    throw new Error('CORS Hardening failed: Access-Control-Allow-Credentials returned true when ALLOWED_ORIGINS is unset.');
  }
  if (originHeader === 'http://evil.com') {
    throw new Error('CORS Hardening failed: Request origin http://evil.com was reflected when ALLOWED_ORIGINS is unset.');
  }
  console.log('✅ CORS Hardening check passed!\n');

  // d. Daily Scheduler Guard Check
  console.log('--- Test D: Daily Scheduler Guard ---');
  console.log('Call 1: Executing scheduler functions first time...');
  const reminders1 = await sendDailyReminders(db);
  const summary1 = await sendDailySummary(db, 'test@mahana.com');
  console.log('Call 1 Reminders output:', reminders1);
  console.log('Call 1 Summary output:', summary1);

  if (reminders1.skipped || summary1.skipped) {
    throw new Error('Call 1 was skipped, but it should have run because scheduler_executions had no runs today.');
  }

  // Check database writes
  const execsAfterCall1 = db.prepare('SELECT * FROM scheduler_executions WHERE execution_date = ?').all(panamaDate);
  console.log('Database runs recorded after Call 1:', execsAfterCall1);
  if (execsAfterCall1.length !== 2) {
    throw new Error(`Expected 2 records in scheduler_executions table after Call 1, but found ${execsAfterCall1.length}`);
  }

  console.log('\nCall 2: Executing scheduler functions second time...');
  const reminders2 = await sendDailyReminders(db);
  const summary2 = await sendDailySummary(db, 'test@mahana.com');
  console.log('Call 2 Reminders output:', reminders2);
  console.log('Call 2 Summary output:', summary2);

  if (!reminders2.skipped || !summary2.skipped) {
    throw new Error('Call 2 was NOT skipped. Duplicate runs allowed! Double-dispatch vulnerability exists.');
  }

  // Query table to confirm exactly one record exists per job for today's date
  const finalExecs = db.prepare('SELECT * FROM scheduler_executions WHERE execution_date = ?').all(panamaDate);
  console.log('Final executions in SQLite:', finalExecs);

  const remindersCount = finalExecs.filter(e => e.job_name === 'daily_reminders').length;
  const summaryCount = finalExecs.filter(e => e.job_name === 'daily_summary').length;

  if (remindersCount !== 1 || summaryCount !== 1) {
    throw new Error(`Expected exactly 1 daily_reminders and 1 daily_summary execution, but got reminders: ${remindersCount}, summary: ${summaryCount}`);
  }
  console.log('✅ Daily Scheduler Guard check passed! Exactly one run per job was dispatched today.\n');

  console.log('🎉 All integration tests passed perfectly!');
  cleanup();
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ Verification Failed!');
  console.error(err);
  cleanup();
  process.exit(1);
});
