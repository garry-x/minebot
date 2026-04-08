const { AdminConsole } = require('../cli');
const path = require('path');
const fs = require('fs');

// Mock readline interface
const mockReadline = {
  createInterface: jest.fn(() => ({
    question: jest.fn(),
    close: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn()
  }))
};

// Mock console methods
const originalConsoleLog = console.log;
const mockConsoleLog = jest.fn();

describe('Admin Console Tests', () => {
  let consoleInstance;
  let mockRl;

  beforeEach(() => {
    jest.clearAllMocks();
    console.log = mockConsoleLog;
    
    mockRl = mockReadline.createInterface();
    consoleInstance = new AdminConsole();
    consoleInstance.rl = mockRl;
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    if (consoleInstance.refreshInterval) {
      clearInterval(consoleInstance.refreshInterval);
    }
  });

  describe('Console Initialization', () => {
    test('should create AdminConsole instance with default settings', () => {
      expect(consoleInstance).toBeDefined();
      expect(consoleInstance.currentView).toBe('dashboard');
      expect(consoleInstance.isRunning).toBe(false);
      expect(consoleInstance.refreshRate).toBe(5000);
      expect(consoleInstance.config).toEqual({
        performanceMode: false,
        refreshRates: {
          normal: 5000,
          fast: 2000,
          slow: 10000
        }
      });
    });

    test('should have UI component methods', () => {
      expect(typeof consoleInstance.clearScreen).toBe('function');
      expect(typeof consoleInstance.drawHeader).toBe('function');
      expect(typeof consoleInstance.drawFooter).toBe('function');
      expect(typeof consoleInstance.drawMenu).toBe('function');
      expect(typeof consoleInstance.drawStatusCard).toBe('function');
      expect(typeof consoleInstance.drawTable).toBe('function');
    });
  });

  describe('UI Components', () => {
    test('clearScreen should write ANSI escape codes', () => {
      const writeSpy = jest.spyOn(process.stdout, 'write');
      consoleInstance.clearScreen();
      expect(writeSpy).toHaveBeenCalledWith('\x1b[2J\x1b[0f');
      writeSpy.mockRestore();
    });

    test('drawHeader should display centered title', () => {
      consoleInstance.drawHeader('Test Title');
      expect(mockConsoleLog).toHaveBeenCalled();
      const logCalls = mockConsoleLog.mock.calls.flat();
      expect(logCalls.some(call => typeof call === 'string' && call.includes('Test Title'))).toBe(true);
    });

    test('drawMenu should display menu items with selection indicator', () => {
      const menuItems = [
        { label: 'Option 1', description: 'First option' },
        { label: 'Option 2', description: 'Second option' }
      ];
      
      consoleInstance.drawMenu(menuItems, 0);
      expect(mockConsoleLog).toHaveBeenCalled();
    });

    test('drawStatusCard should display status with color coding', () => {
      consoleInstance.drawStatusCard('Test Service', 'RUNNING', ['Detail 1', 'Detail 2']);
      expect(mockConsoleLog).toHaveBeenCalled();
    });
  });

  describe('System Status Methods', () => {
    test('getSystemStatus should return structured status object', async () => {
      // Mock the dependent methods
      consoleInstance.getBotServerStatus = jest.fn().mockResolvedValue({ status: 'RUNNING' });
      consoleInstance.getMinecraftServerStatus = jest.fn().mockResolvedValue({ status: 'RUNNING' });
      consoleInstance.getAllBots = jest.fn().mockResolvedValue([
        { username: 'TestBot', state: 'ALIVE', connected: true }
      ]);

      const status = await consoleInstance.getSystemStatus();
      
      expect(status).toHaveProperty('botServer');
      expect(status).toHaveProperty('mcServer');
      expect(status).toHaveProperty('bots');
      expect(Array.isArray(status.bots)).toBe(true);
    });

    test('getSystemStatus should handle errors gracefully', async () => {
      consoleInstance.getBotServerStatus = jest.fn().mockRejectedValue(new Error('Connection failed'));
      consoleInstance.getMinecraftServerStatus = jest.fn().mockResolvedValue({ status: 'UNKNOWN' });
      consoleInstance.getAllBots = jest.fn().mockResolvedValue([]);

      const status = await consoleInstance.getSystemStatus();
      
      expect(status.botServer.status).toBe('ERROR');
      expect(status.botServer.error).toBe('Connection failed');
      expect(status.mcServer.status).toBe('UNKNOWN');
      expect(status.bots).toEqual([]);
    });
  });

  describe('Bot Management', () => {
    test('getAllBots should return bot array from API', async () => {
      // This would require mocking the HTTP request
      // For now, just test the method exists
      expect(typeof consoleInstance.getAllBots).toBe('function');
    });

    test('should filter bots by ALIVE state', async () => {
      const mockBots = [
        { username: 'Bot1', state: 'ALIVE', connected: true },
        { username: 'Bot2', state: 'DEAD', connected: false },
        { username: 'Bot3', state: 'ALIVE', connected: true }
      ];
      
      consoleInstance.getAllBots = jest.fn().mockResolvedValue(mockBots);
      consoleInstance.getBotServerStatus = jest.fn().mockResolvedValue({ status: 'RUNNING' });
      consoleInstance.getMinecraftServerStatus = jest.fn().mockResolvedValue({ status: 'RUNNING' });

      const status = await consoleInstance.getSystemStatus();
      
      // Should only include ALIVE bots
      expect(status.bots).toHaveLength(2);
      expect(status.bots.every(bot => bot.state === 'ALIVE')).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('handleError should display error message and stack trace', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:1:1';
      
      consoleInstance.handleError(error, 'Test context');
      
      expect(mockConsoleLog).toHaveBeenCalled();
      const logCalls = mockConsoleLog.mock.calls.flat();
      expect(logCalls.some(call => typeof call === 'string' && call.includes('Test error'))).toBe(true);
    });

    test('handleError should attempt recovery', () => {
      const error = new Error('Test error');
      consoleInstance.currentView = 'bot-management';
      
      consoleInstance.handleError(error, 'Test context');
      
      // Should reset to dashboard after error
      expect(consoleInstance.currentView).toBe('dashboard');
    });
  });

  describe('Configuration', () => {
    test('should have config management methods', () => {
      expect(typeof consoleInstance.getAvailableConfigs).toBe('function');
      expect(typeof consoleInstance.importConfig).toBe('function');
      expect(typeof consoleInstance.exportConfig).toBe('function');
    });

    test('getAvailableConfigs should list config files', async () => {
      const configs = await consoleInstance.getAvailableConfigs();
      expect(Array.isArray(configs)).toBe(true);
    });
  });

  describe('Console Lifecycle', () => {
    test('start should initialize console and display dashboard', async () => {
      consoleInstance.renderDashboard = jest.fn();
      consoleInstance.setupKeyboardListeners = jest.fn();
      
      await consoleInstance.start();
      
      expect(consoleInstance.isRunning).toBe(true);
      expect(consoleInstance.renderDashboard).toHaveBeenCalled();
      expect(consoleInstance.setupKeyboardListeners).toHaveBeenCalled();
    });

    test('stop should clean up resources', () => {
      consoleInstance.refreshInterval = setInterval(() => {}, 1000);
      consoleInstance.stop();
      
      expect(consoleInstance.isRunning).toBe(false);
      expect(consoleInstance.refreshInterval).toBeNull();
      expect(mockRl.close).toHaveBeenCalled();
    });
  });
});

// Mock Jest for test environment
if (typeof jest === 'undefined') {
  global.jest = {
    fn: () => ({
      mockResolvedValue: function() { return this; },
      mockRejectedValue: function() { return this; },
      mockReturnValue: function() { return this; }
    }),
    clearAllMocks: () => {},
    spyOn: (obj, method) => ({
      mockRestore: () => {}
    })
  };
}