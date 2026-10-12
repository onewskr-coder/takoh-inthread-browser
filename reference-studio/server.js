import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let PORT = 5173;
// If dist folder exists, use it; otherwise use __dirname directly
const DIST = fs.existsSync(path.join(__dirname, 'dist')) ? path.join(__dirname, 'dist') : __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let reqUrl = (req.url || '/').split('?')[0];
  if (reqUrl === '/' || reqUrl === '/dashboard') reqUrl = '/dashboard.html';
  if (reqUrl === '/onboarding') reqUrl = '/onboarding.html';

  let filePath = path.join(DIST, reqUrl);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(DIST, 'dashboard.html');
  }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`\n[알림] 대시보드 서버가 이미 실행 중입니다 (포트 ${PORT}).`);
    console.log(`브라우저에서 대시보드를 엽니다: http://localhost:${PORT}/dashboard?onboarding=1\n`);
    exec(`start http://localhost:${PORT}/dashboard?onboarding=1`);
    process.exit(0);
  } else {
    console.error('서버 오류:', err);
  }
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  ⚡ 인스레드 치트 (InThread Cheat) 대시보드 가동 완료`);
  console.log(`  접속 주소: http://localhost:${PORT}/dashboard?onboarding=1`);
  console.log(`======================================================\n`);
  console.log(`웹 브라우저를 자동으로 엽니다...`);
  exec(`start http://localhost:${PORT}/dashboard?onboarding=1`);
});
