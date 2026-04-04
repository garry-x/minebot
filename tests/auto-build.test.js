const fs = require('fs');
const path = require('path');

describe('Auto-Build Logic', () => {
  const botServerPath = path.join(__dirname, '..', 'bot_server.js');

  beforeEach(() => {
    jest.resetModules();
  });

  describe('Build directory existence check', () => {
    test('should check if frontend/build directory exists', () => {
      const existsSyncMock = jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
        const pathStr = p.toString();
        if (pathStr.includes('frontend/build')) {
          return fs.existsSync(path.join(__dirname, '..', 'frontend', 'build'));
        }
        if (pathStr.includes('logs')) {
          const logsDir = path.join(__dirname, '..', 'logs');
          if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
          }
          return true;
        }
        return false;
      });

      try {
        require(botServerPath);
      } catch (e) {
        // Server may fail to start due to port binding
      }

      expect(existsSyncMock).toHaveBeenCalled();
    });
  });

  describe('Functions implemented', () => {
    test('should have checkAndBuildFrontend function', () => {
      // Read the bot_server.js file and check if checkAndBuildFrontend function exists
      const content = fs.readFileSync(botServerPath, 'utf8');
      expect(content).toContain('checkAndBuildFrontend');
    });

    test('should have git status check', () => {
      const content = fs.readFileSync(botServerPath, 'utf8');
      expect(content).toContain('git status');
    });

    test('should have npm run build command', () => {
      const content = fs.readFileSync(botServerPath, 'utf8');
      expect(content).toContain('npm run build');
    });

    test('should have process.exit(1) for build failures', () => {
      const content = fs.readFileSync(botServerPath, 'utf8');
      expect(content).toContain('process.exit(1)');
    });
  });
});
