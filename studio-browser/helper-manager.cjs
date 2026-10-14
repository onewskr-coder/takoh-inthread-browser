const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

class HelperManager {
  constructor({
    dataDir,
    sourceDir,
    port = 5006,
    fetchImpl = fetch,
    spawnImpl = spawn,
    pause = ms => new Promise(r => setTimeout(r, ms)),
    timeout = 20000,
    python
  } = {}) {
    Object.assign(this, { dataDir, sourceDir, port, fetchImpl, spawnImpl, pause, timeout, python });
    this.status = { state: 'idle', message: '도우미 대기' };
    this.child = null;
    this.pending = null;
    this.spawnedByMe = false;
    this.cachedToken = '';
  }

  // 5006 포트에 TCP 소켓 연결이 가능한지 테스트 (점유 여부 확인)
  checkPortOpen(port = this.port) {
    return new Promise(resolve => {
      const socket = new net.Socket();
      socket.setTimeout(800);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(port, '127.0.0.1');
    });
  }

  // 도우미가 정상 세션 토큰을 응답하는지 확인하고 토큰 캐싱
  async probe() {
    try {
      const r = await this.fetchImpl(`http://127.0.0.1:${this.port}/studio/session`, {
        signal: AbortSignal.timeout(1200)
      });
      if (!r.ok) return false;
      const data = await r.json();
      if (typeof data.token === 'string' && data.token.length > 20) {
        this.cachedToken = data.token;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // 서버의 실제 작업 진행 여부(다운로드/편집/AI 요청 등) 조회
  async checkBusyStatus() {
    try {
      const r = await this.fetchImpl(`http://127.0.0.1:${this.port}/studio/busy-status`, {
        signal: AbortSignal.timeout(1500)
      });
      if (!r.ok) {
        throw new Error(`상태 확인 응답 오류 (HTTP ${r.status})`);
      }
      return await r.json();
    } catch (e) {
      throw new Error(`도우미 상태 확인 실패: ${e.message}`);
    }
  }

  // 단일 시작 프로미스 관리 (중복 실행 차단)
  start() {
    if (this.pending) return this.pending;
    this.pending = this.boot()
      .catch(error => {
        this.status = { state: 'failed', message: error.message };
        throw error;
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }

  // 복구 요청 (연속 클릭 시에도 인플라이트 프로미스 하나만 실행)
  async retry() {
    // 1. 이미 진행 중인 시작/복구 프로미스가 있으면 그대로 반환
    if (this.pending) return this.pending;

    // 2. 만약 내가 직접 시작한 프로세스가 여전히 살아있는 경우, 소유권을 유지한 채 probe만 재시도
    if (this.spawnedByMe && this.child && this.child.exitCode === null && !this.child.killed) {
      this.pending = (async () => {
        this.status = { state: 'starting', message: '도우미 재연결 확인 중' };
        if (await this.probe()) {
          this.status = { state: 'ready', message: '도우미 연결됨' };
          return;
        }
        // 프로세스는 살아있으나 probe 실패 시 boot 흐름으로 진행
        await this.boot();
      })()
        .catch(err => {
          this.status = { state: 'failed', message: err.message };
          throw err;
        })
        .finally(() => {
          this.pending = null;
        });
      return this.pending;
    }

    // 3. 자식이 종료되었거나 없는 경우 boot 수행
    return this.start();
  }

  async boot() {
    this.status = { state: 'starting', message: '도우미 연결 준비 중' };

    // 1. 이미 정상 실행 중인 도우미가 있는지 확인 -> 재사용 (중복 실행 방지)
    if (await this.probe()) {
      // 기존에 내가 띄운 것이 아니면 소유권은 false로 유지
      if (!this.child || this.child.exitCode !== null) {
        this.spawnedByMe = false;
        this.child = null;
      }
      this.status = { state: 'ready', message: '도우미 연결됨' };
      return;
    }

    // 2. probe는 실패했는데 포트 5006이 타 프로세스에 점유되어 있는 경우
    const portBusy = await this.checkPortOpen(this.port);
    if (portBusy) {
      const msg = `다른 프로그램이 ${this.port} 포트를 점유 중입니다. 타 프로세스를 강제 종료하지 않습니다.`;
      this.status = { state: 'failed', message: msg };
      throw new Error(msg);
    }

    // 3. 신규 자동 시작 (창 없이 실행)
    const python = this.python || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe');
    if (!fs.existsSync(python)) {
      throw new Error('Python 실행 파일을 찾지 못했습니다. Python 3.11 설치 경로를 확인하세요.');
    }

    fs.mkdirSync(this.dataDir, { recursive: true });
    const logPath = path.join(this.dataDir, 'helper.log');
    const out = fs.openSync(logPath, 'a');

    try {
      this.child = this.spawnImpl(python, ['app.py'], {
        cwd: this.sourceDir,
        windowsHide: true,
        detached: true,
        stdio: ['ignore', out, out],
        env: {
          ...process.env,
          TAKOH_DEV_MODE: '1',
          PORT: String(this.port)
        }
      });
      this.spawnedByMe = true;
    } finally {
      fs.closeSync(out);
    }

    let stopped = '';
    this.child.on('error', e => {
      stopped = e.message;
      this.status = { state: 'failed', message: `도우미 시작 오류: ${stopped}` };
    });
    this.child.on('exit', code => {
      stopped = `도우미가 종료되었습니다 (코드: ${code}).`;
      if (this.status.state === 'ready') {
        this.status = { state: 'failed', message: stopped };
      }
    });

    // 4. 준비 완료까지 폴링 대기
    const end = Date.now() + this.timeout;
    while (Date.now() < end) {
      if (stopped) throw new Error(stopped);
      if (await this.probe()) {
        this.status = { state: 'ready', message: '도우미 연결됨' };
        return;
      }
      await this.pause(350);
    }

    throw new Error('도우미 연결 대기 시간 초과 · helper.log를 확인하세요.');
  }

  // 앱 종료 시: 직접 시작한 도우미에만 적용되는 인증된 정상 종료 경로 (Graceful Shutdown)
  async stop() {
    // 1. 직접 시작한 도우미가 아니면 절대 건드리지 않음 (기존 도우미 및 5005 절대 보호)
    if (!this.spawnedByMe || !this.child) {
      return { skipped: true, reason: '앱이 직접 시작한 도우미가 아니므로 유지합니다.' };
    }

    // 2. 서버의 실제 작업 상태 조회 (상태 확인 실패 시 강제 종료 금지)
    let busyInfo;
    try {
      busyInfo = await this.checkBusyStatus();
    } catch (err) {
      // 상태 조회가 실패하면 함부로 죽이지 않고 안내 후 중단
      const warnMsg = `도우미 상태 확인 실패로 안전을 위해 강제 종료하지 않았습니다: ${err.message}`;
      console.warn(`[HelperManager] ${warnMsg}`);
      return { stopped: false, warning: warnMsg };
    }

    // 3. 작업 진행 중 여부 검사 (진행 중이면 강제 종료하지 않고 안내)
    if (busyInfo && busyInfo.busy) {
      const taskNames = (busyInfo.tasks || []).map(t => `${t.kind}(${t.details || ''})`).join(', ');
      const warnMsg = `진행 중인 작업이 있어 도우미를 종료할 수 없습니다 [${taskNames || '작업 진행 중'}]`;
      console.warn(`[HelperManager] ${warnMsg}`);
      this.status = { state: 'ready', message: warnMsg };
      return { stopped: false, warning: warnMsg, busy: true };
    }

    // 4. 인증된 정상 종료 API (POST /studio/shutdown) 호출
    try {
      const shutdownRes = await this.fetchImpl(`http://127.0.0.1:${this.port}/studio/shutdown`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Studio-Token': this.cachedToken
        },
        signal: AbortSignal.timeout(3000)
      });

      if (!shutdownRes.ok) {
        const errJson = await shutdownRes.json().catch(() => ({}));
        const warnMsg = `도우미 정상 종료 요청 거부: ${errJson.error || shutdownRes.statusText}`;
        console.warn(`[HelperManager] ${warnMsg}`);
        return { stopped: false, warning: warnMsg };
      }
    } catch (err) {
      const warnMsg = `도우미 정상 종료 호출 실패: ${err.message}`;
      console.warn(`[HelperManager] ${warnMsg}`);
      return { stopped: false, warning: warnMsg };
    }

    // 5. 프로세스가 완전히 종료될 때까지 대기 및 확인 (소켓 닫힘 또는 child exit)
    const deadline = Date.now() + 4000;
    let terminated = false;
    while (Date.now() < deadline) {
      const stillOpen = await this.checkPortOpen(this.port);
      if (!stillOpen || (this.child && this.child.exitCode !== null)) {
        terminated = true;
        break; // 포트 소켓이 닫힘 또는 child exit = 정상 종료 완료
      }
      await this.pause(200);
    }

    if (!terminated) {
      // 종료 대기 시간이 지나도 프로세스가 살아 있으면 종료 실패/대기로 표시하고 child와 소유권 유지
      const warnMsg = '도우미 정상 종료 대기 시간(4초)이 초과되었으나 프로세스가 여전히 실행 중입니다. 안전을 위해 소유권을 유지합니다.';
      console.warn(`[HelperManager] ${warnMsg}`);
      this.status = { state: 'ready', message: warnMsg };
      return { stopped: false, timeout: true, warning: warnMsg };
    }

    // 실제 자식 프로세스 종료를 확인한 경우에만 완료 처리
    this.child = null;
    this.spawnedByMe = false;
    this.status = { state: 'idle', message: '도우미 정상 종료 완료' };
    return { stopped: true };
  }
}

module.exports = { HelperManager };
