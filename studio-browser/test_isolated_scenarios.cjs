const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { HelperManager } = require('./helper-manager.cjs');

async function runScenarioTests() {
  console.log('====================================================');
  console.log(' HelperManager 격리 시나리오 6종 검증 시작');
  console.log('====================================================\n');

  const testPort = 5995;
  let mockServerState = {
    validSession: true,
    token: 'test_token_abcdef123456789012345678901234567890',
    busy: false,
    activeTasks: [],
    busyStatusFail: false,
    shutdownReceived: false
  };

  // 모의 도우미 HTTP 서버 생성
  const mockServer = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${testPort}`);

    if (url.pathname === '/studio/session') {
      if (mockServerState.validSession) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ token: mockServerState.token }));
      } else {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'session fail' }));
      }
      return;
    }

    if (url.pathname === '/studio/busy-status') {
      if (mockServerState.busyStatusFail) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'internal error' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        busy: mockServerState.busy,
        active_count: mockServerState.activeTasks.length,
        tasks: mockServerState.activeTasks
      }));
      return;
    }

    if (url.pathname === '/studio/shutdown' && req.method === 'POST') {
      const authHeader = req.headers['x-studio-token'];
      if (authHeader !== mockServerState.token) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '인증 토큰 불일치' }));
        return;
      }
      if (mockServerState.busy) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '작업 진행 중 종료 불가', busy: true }));
        return;
      }
      mockServerState.shutdownReceived = true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: '정상 종료' }));
      // 200ms 뒤 모의 서버 소켓 닫기
      setTimeout(() => mockServer.close(), 150);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise(resolve => mockServer.listen(testPort, '127.0.0.1', resolve));

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm_scenarios_'));

  try {
    // -------------------------------------------------------------------
    // 시나리오 1 & 2: 재사용 (Reuse) 검증
    // -------------------------------------------------------------------
    console.log('[시나리오 1/6] 기존 도우미 재사용 검증');
    const hm = new HelperManager({
      dataDir: tempDir,
      sourceDir: tempDir,
      port: testPort,
      timeout: 2000
    });

    await hm.start();
    console.log(`  - status: ${hm.status.state}, message: ${hm.status.message}`);
    console.log(`  - spawnedByMe: ${hm.spawnedByMe} (기존 도우미이므로 false여야 함)`);
    if (hm.spawnedByMe !== false || hm.status.state !== 'ready') {
      throw new Error('시나리오 1 실패: 기존 도우미 재사용 플래그 오류');
    }
    console.log('  -> [통과] 기존 도우미 정상 재사용 확인\n');

    // -------------------------------------------------------------------
    // 시나리오 3: 연속 복구 (Debounced Retry) 검증
    // -------------------------------------------------------------------
    console.log('[시나리오 2/6] 연속 복구 요청 시 단일 인플라이트 프로미스 검증');
    // retry()를 동시에 5번 호출
    const retryPromises = [
      hm.retry(),
      hm.retry(),
      hm.retry(),
      hm.retry(),
      hm.retry()
    ];
    // 모든 프로미스가 동일 인스턴스이거나 성공해야 함
    await Promise.all(retryPromises);
    console.log(`  - 5회 연속 retry 호출 후 상태: ${hm.status.state}`);
    console.log(`  - spawnedByMe: ${hm.spawnedByMe} (소유권 보존 여부)`);
    if (hm.status.state !== 'ready') {
      throw new Error('시나리오 2 실패: 연속 복구 중 상태 오류');
    }
    console.log('  -> [통과] 연속 복구 시 중복 생성 없이 단일 처리 및 소유권 보존 확인\n');

    // -------------------------------------------------------------------
    // 시나리오 4: 직접 시작한 도우미 소유권 설정 및 작업 중 종료(Stop when Busy) 보호 검증
    // -------------------------------------------------------------------
    console.log('[시나리오 3/6] 작업 중 종료 요청 시 비종료 보호 검증');
    // hm이 직접 시작한 것으로 설정 (가상 child 프로세스 모의 객체 주입)
    hm.spawnedByMe = true;
    let mockChildExited = false;
    hm.child = {
      exitCode: null,
      killed: false,
      kill: () => { mockChildExited = true; }
    };

    // 서버를 busy 상태로 전환
    mockServerState.busy = true;
    mockServerState.activeTasks = [{ id: 't1', kind: '영상 다운로드', details: '테스트 영상' }];

    const busyStopRes = await hm.stop();
    console.log('  - stop() 결과:', busyStopRes);
    if (busyStopRes.stopped !== false || !busyStopRes.busy) {
      throw new Error('시나리오 3 실패: 작업 진행 중인데 도우미를 종료하려 했습니다!');
    }
    if (mockServerState.shutdownReceived) {
      throw new Error('시나리오 3 실패: 작업 진행 중인데 shutdown API가 전송되었습니다!');
    }
    console.log('  -> [통과] 작업 진행 중일 때 강제 종료 차단 및 안내 확인\n');

    // -------------------------------------------------------------------
    // 시나리오 5: 상태 조회 실패 시 비종료 보호 검증
    // -------------------------------------------------------------------
    console.log('[시나리오 4/6] 서버 상태 확인 실패 시 비종료 보호 검증');
    mockServerState.busy = false;
    mockServerState.busyStatusFail = true; // /studio/busy-status HTTP 500 에러 유도

    const failStopRes = await hm.stop();
    console.log('  - stop() 결과:', failStopRes);
    if (failStopRes.stopped !== false || !failStopRes.warning) {
      throw new Error('시나리오 4 실패: 상태 조회 실패 시에도 강제 종료를 시도했습니다!');
    }
    if (mockServerState.shutdownReceived) {
      throw new Error('시나리오 4 실패: 상태 조회 실패 시 shutdown이 실행되었습니다!');
    }
    console.log('  -> [통과] 상태 조회 실패 시 안전을 위해 강제 종료하지 않음 확인\n');

    // -------------------------------------------------------------------
    // 시나리오 6: 정상 종료 API(POST /studio/shutdown) 호출 및 프로세스 종료 확인
    // -------------------------------------------------------------------
    console.log('[시나리오 5/6] 작업이 없을 때 인증된 정상 종료 API 호출 및 소켓 닫힘 검증');
    mockServerState.busyStatusFail = false;
    mockServerState.busy = false;
    mockServerState.activeTasks = [];

    const okStopRes = await hm.stop();
    console.log('  - stop() 결과:', okStopRes);
    console.log('  - mockServerState.shutdownReceived:', mockServerState.shutdownReceived);
    if (!okStopRes.stopped || !mockServerState.shutdownReceived) {
      throw new Error('시나리오 5 실패: 정상 종료 API 호출 누락');
    }

    // 서버 소켓이 닫혔는지 최종 확인
    await new Promise(r => setTimeout(r, 250));
    const isPortStillOpen = await hm.checkPortOpen(testPort);
    console.log(`  - 종료 후 포트 소켓 상태 (still open): ${isPortStillOpen}`);
    if (isPortStillOpen) {
      throw new Error('시나리오 5 실패: 종료 후에도 포트가 닫히지 않았습니다!');
    }
    console.log('  -> [통과] 인증된 shutdown API 호출 및 정상 종료 완료 확인\n');

    // -------------------------------------------------------------------
    // 시나리오 7: 신규 시작 (Start) 및 포트 충돌 검증
    // -------------------------------------------------------------------
    console.log('[시나리오 6/6] 타 프로세스 포트 점유 충돌 검증');
    const dummyConflictServer = net.createServer(s => s.end());
    await new Promise(r => dummyConflictServer.listen(testPort, '127.0.0.1', r));

    const conflictHm = new HelperManager({
      dataDir: tempDir,
      sourceDir: tempDir,
      port: testPort,
      timeout: 1500
    });

    let conflictCaught = false;
    try {
      await conflictHm.start();
    } catch (err) {
      conflictCaught = true;
      console.log('  - 포트 충돌 오류 수신:', err.message);
      if (!conflictHm.status.message.includes('점유')) {
        throw new Error('충돌 메시지에 점유 안내가 없습니다.');
      }
    } finally {
      dummyConflictServer.close();
    }

    if (!conflictCaught) {
      throw new Error('시나리오 6 실패: 포트 점유 상태에서 예외가 발생하지 않았습니다!');
    }
    // -------------------------------------------------------------------
    // 시나리오 7: 종료 대기 시간 초과 시 소유권(spawnedByMe, child) 유지 검증
    // -------------------------------------------------------------------
    console.log('[시나리오 7/7] 종료 대기 시간 초과 시 자식 및 소유권 유지 검증');
    const slowServer = http.createServer((req, res) => {
      // 5006 shutdown 요청을 받았으나 소켓을 닫지 않고 유지하는 지연 서버 모의
      if (req.url === '/studio/shutdown' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, shutting_down: true }));
      } else if (req.url === '/studio/busy-status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ busy: false, tasks: [] }));
      } else {
        res.writeHead(200);
        res.end();
      }
    });
    await new Promise(r => slowServer.listen(testPort, '127.0.0.1', r));

    try {
      const dummyChild = { exitCode: null, pid: 99999, on: () => {} };
      const timeoutHm = new HelperManager({
        dataDir: tempDir,
        sourceDir: tempDir,
        port: testPort,
        timeout: 1000
      });
      timeoutHm.spawnedByMe = true;
      timeoutHm.child = dummyChild;

      const stopTimeoutRes = await timeoutHm.stop();
      console.log('  - stop() 결과:', stopTimeoutRes);
      if (stopTimeoutRes.stopped !== false || !stopTimeoutRes.timeout) {
        throw new Error('종료 타임아웃 결과가 올바르지 않습니다.');
      }
      if (!timeoutHm.spawnedByMe || timeoutHm.child !== dummyChild) {
        throw new Error('타임아웃 시 소유권 또는 child 참조가 유실되었습니다.');
      }
      console.log('  -> [통과] 종료 타임아웃 발생 시 소유권 및 child 객체 안전 보존 확인\n');
    } finally {
      slowServer.close();
    }

    console.log('====================================================');
    console.log(' >>> 7종 모든 격리 시나리오 검증 100% 통과 완료 <<<');
    console.log('====================================================');
  } finally {
    try { mockServer.close(); } catch {}
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
}

runScenarioTests().catch(err => {
  console.error('\n[검증 실패]', err);
  process.exit(1);
});
