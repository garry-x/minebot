const fs = require('fs');
const path = require('path');

describe('Single Instance Check', () => {
  const pidFile = path.join(__dirname, '..', 'logs', 'bot_server.pid');

  beforeEach(() => {
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
  });

  afterEach(() => {
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
  });

  describe('Stale PID file handling', () => {
    test('should remove stale PID file and allow startup when process does not exist', () => {
      const fakePid = 99999;
      fs.writeFileSync(pidFile, fakePid.toString());

      const result = require('../bot_server');
      
      expect(fs.existsSync(pidFile)).toBe(false);
    });
  });

  describe('Running instance detection', () => {
    test('should detect existing process and exit with error code 1', () => {
      const currentPid = process.pid;
      fs.writeFileSync(pidFile, currentPid.toString());

      const originalExit = process.exit;
      let exitCalled = false;
      let exitCode = null;

      process.exit = (code) => {
        exitCalled = true;
        exitCode = code;
      };

      try {
        require('../bot_server');
      } finally {
        process.exit = originalExit;
      }

      expect(exitCalled).toBe(true);
      expect(exitCode).toBe(1);
    });
  });

  describe('PID file creation', () => {
    test('should create PID file with current process PID on startup', () => {
      if (fs.existsSync(pidFile)) {
        fs.unlinkSync(pidFile);
      }

      const result = require('../bot_server');

      expect(fs.existsSync(pidFile)).toBe(true);
      const content = fs.readFileSync(pidFile, 'utf8');
      expect(content.trim()).toBe(process.pid.toString());
    });
  });

  describe('Clean exit', () => {
    test('should clean up PID file on process exit', () => {
      if (fs.existsSync(pidFile)) {
        fs.unlinkSync(pidFile);
      }

      require('../bot_server');

      const originalExit = process.exit;
      process.exit = () => {};

      process.emit('exit');

      process.exit = originalExit;

      expect(fs.existsSync(pidFile)).toBe(false);
    });
  });
});
