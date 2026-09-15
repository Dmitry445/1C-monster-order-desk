const { execSync } = require('child_process');
const path = require('path');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
} catch {
  // Игнорируем ошибку загрузки dotenv
}

function freePorts(ports) {
  const isWin = process.platform === 'win32';
  for (const port of ports) {
    try {
      if (isWin) {
        const output = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
        const pids = new Set();
        for (const line of output.split('\n')) {
          if (line.includes(`:${port}`) && line.includes('LISTENING')) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && pid !== '0' && pid !== String(process.pid)) {
              pids.add(pid);
            }
          }
        }
        for (const pid of pids) {
          try {
            console.log(`Освобождение порта ${port}: остановка процесса PID ${pid}...`);
            execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
          } catch {
            // Игнорируем если процесс уже завершен
          }
        }
      } else {
        try {
          execSync(`lsof -ti :${port} | xargs -r kill -9`, { stdio: 'ignore' });
        } catch {
          // Порт свободен
        }
      }
    } catch {
      // Игнорируем ошибки проверки
    }
  }
}

try {
  require('dotenv').config();
} catch {
  // Игнорируем отсутствие dotenv
}

const serverPort = process.env.PORT || 4000;
freePorts([Number(serverPort), 5173]);
