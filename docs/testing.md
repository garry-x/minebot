# MineBot Testing Strategy and Implementation Guide

| Version | Date | Status | Author |
| :--- | :--- | :--- | :--- |
| v1.0 | 2026-04-07 | Comprehensive Test Plan | Sisyphus AI Agent |

## 1. Overview and Testing Philosophy

### 1.1 Testing Goals
- Ensure reliable bot operation in Minecraft environments
- Validate evolutionary learning algorithms
- Maintain system stability during concurrent bot operations
- Provide comprehensive test coverage for critical components
- Enable rapid development with confidence through automated testing

### 1.2 Testing Principles
1. **Isolation**: Each test should run independently without side effects
2. **Determinism**: Tests should produce consistent results across runs
3. **Speed**: Test suite should execute quickly to support rapid iteration
4. **Coverage**: Critical paths and edge cases must be thoroughly tested
5. **Maintainability**: Tests should be easy to understand and update

## 2. Current Testing Infrastructure

### 2.1 Test Frameworks and Tools

**Primary Framework**: Jest
- Configuration: Default Jest configuration (no explicit `jest.config.js`)
- Test scripts: `"test": "jest"`, `"test:watch": "jest --watch"`
- Coverage: Not currently configured

**Secondary Test Runners**:
- Node.js built-in test module (`node:test`): Used in evolution subsystem tests

**HTTP Testing**:
- Supertest: Included in devDependencies for API endpoint testing

**Utilities**:
- `config/test_db.js`: Test database initialization helper
- Temporary SQLite database files for isolated test runs

### 2.2 Existing Test Structure

```
minebot/
├── tests/                    # Primary test directory
│   ├── auto-build.test.js    # Frontend build validation
│   ├── bot-server.test.js    # Bot server lifecycle tests
│   └── streaming/            # Streaming component tests
│       └── streaming.test.js
├── bot/
│   ├── evolution/            # Evolution engine tests
│   │   ├── evolution.test.js
│   │   ├── fitness-calculator.test.js
│   │   ├── weight-engine.test.js
│   │   └── ...
│   └── goal-system.test.js   # Goal system unit tests
├── test-autonomous-engine.js # Autonomous engine tests
├── test_bot.js               # Basic bot functionality
├── test_bot_manual.js        # Manual bot tests
└── test-*.sh                 # Shell test scripts
```

## 3. Test Categories and Coverage Strategy

### 3.1 Unit Tests

**Scope**: Individual functions, classes, and modules
**Goal**: Verify isolated functionality and edge cases

**Key Areas**:
1. **Bot Core Components**
   - `bot/index.js`: Connection, event handling, lifecycle management
   - `bot/pathfinder.js`: Navigation algorithms, path calculation
   - `bot/events.js`: Event dispatching and handling

2. **Evolution Engine**
   - `bot/evolution/weight-engine.js`: Weight calculations and updates
   - `bot/evolution/fitness-calculator.js`: Fitness scoring algorithms
   - `bot/evolution/experience-logger.js`: Experience recording logic

3. **Data Models**
   - `config/models/BotConfig.js`: Configuration validation and persistence
   - `config/models/BotState.js`: State management and transitions
   - `config/models/BotGoal.js`: Goal progress tracking

**Test Patterns**:
```javascript
// Example: Evolution storage tests
describe('EvolutionStorage', () => {
  let storage;
  let dbPath;
  
  beforeEach(async () => {
    dbPath = path.join(__dirname, 'test-evolution.db');
    storage = new EvolutionStorage(dbPath);
    await storage.initialize();
  });
  
  afterEach(() => {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });
  
  test('should create evolution_weights table', async () => {
    const rows = await storage.getAllWeights();
    expect(Array.isArray(rows)).toBe(true);
  });
});
```

### 3.2 Integration Tests

**Scope**: Interactions between components and external systems
**Goal**: Validate component integration and data flow

**Key Areas**:
1. **Database Integration**
   - SQLite table creation and schema migrations
   - Data persistence and retrieval across components
   - Concurrent access and locking behavior

2. **Bot Server API**
   - REST endpoint functionality and error handling
   - WebSocket communication and state synchronization
   - Authentication and authorization flows

3. **Evolution Pipeline**
   - Strategy manager coordination with weight engines
   - Experience logging and weight update workflows
   - Snapshot creation and restoration

**Test Patterns**:
```javascript
// Example: Bot server API tests
describe('Bot Server API', () => {
  let server;
  
  beforeAll(async () => {
    server = require('../bot_server');
    // Wait for server initialization
  });
  
  afterAll(async () => {
    await server.close();
  });
  
  test('GET /api/health should return 200', async () => {
    const response = await request(server)
      .get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
});
```

### 3.3 End-to-End Tests

**Scope**: Complete user workflows and system behavior
**Goal**: Validate real-world usage scenarios

**Key Areas**:
1. **Bot Lifecycle Management**
   - Bot creation, startup, operation, and shutdown
   - Concurrent bot management and resource allocation
   - Failure recovery and retry mechanisms

2. **Evolution Learning Cycles**
   - Complete experience collection and weight update cycles
   - Strategy evolution over multiple iterations
   - Performance improvement validation

3. **Streaming and Monitoring**
   - Real-time bot status updates and visualization
   - Screenshot capture and streaming workflows
   - Admin console interaction and control

## 4. Test Environment Configuration

### 4.1 Environment Setup

**Base Requirements**:
```bash
# Install dependencies
npm install

# Set up test environment variables
cp .env.example .env.test
# Edit .env.test with test-specific values
```

**Test Database Configuration**:
```javascript
// test_db.js - Test database helper
require('dotenv').config({ path: '.env.test' });
const db = require('./db');

// Initialize test databases
async function initializeTestDB() {
  await db.initialize();
  // Additional test setup
}

module.exports = { initializeTestDB };
```

### 4.2 Jest Configuration

**Recommended `jest.config.js`**:
```javascript
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: [
    '**/__tests__/**/*.js',
    '**/*.test.js',
    '**/*.spec.js'
  ],
  collectCoverageFrom: [
    'bot/**/*.js',
    'config/**/*.js',
    'llm/**/*.js',
    'routes/**/*.js',
    'streaming/**/*.js',
    '!**/node_modules/**',
    '!**/test*.js'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.worktrees/',
    '/.superpowers/'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
};
```

### 4.3 Test Utilities

**Test Setup File (`tests/setup.js`)**:
```javascript
const path = require('path');
const fs = require('fs');

// Global test utilities
global.createTestDatabase = async (dbName) => {
  const dbPath = path.join(__dirname, `${dbName}.db`);
  
  // Clean up if exists
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  
  return {
    path: dbPath,
    cleanup: () => {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
    }
  };
};

// Mock Minecraft server for unit tests
global.mockMinecraftServer = {
  host: 'localhost',
  port: 25565,
  isRunning: true
};
```

## 5. Test Implementation Guidelines

### 5.1 Unit Test Best Practices

1. **Isolation**:
   - Mock external dependencies (database, file system, network)
   - Use dependency injection for testability
   - Avoid shared state between tests

2. **Naming Conventions**:
   ```javascript
   // Good
   describe('Bot.connect()', () => {
     test('should establish connection with valid credentials', () => {});
     test('should throw error with invalid credentials', () => {});
   });
   
   // Bad
   describe('test bot connection', () => {
     test('test 1', () => {});
   });
   ```

3. **Assertions**:
   - Use descriptive assertion messages
   - Test both success and failure cases
   - Include edge cases and boundary conditions

### 5.2 Integration Test Best Practices

1. **Test Data Management**:
   - Use isolated test databases
   - Clean up test data after each test
   - Use deterministic test data generation

2. **Environment Isolation**:
   - Use separate environment files for testing
   - Mock external services (LLM, Minecraft servers)
   - Use test-specific ports and paths

3. **State Management**:
   - Reset state between tests
   - Use transactions for database tests
   - Clean up temporary files

### 5.3 Mocking Strategy

**File System Mocking**:
```javascript
// Example: Mocking fs.existsSync
jest.spyOn(fs, 'existsSync')
  .mockReturnValueOnce(true)
  .mockReturnValueOnce(false);
```

**Database Mocking**:
```javascript
// Example: Mocking SQLite database
const mockDb = {
  run: jest.fn().mockResolvedValue({ lastID: 1 }),
  get: jest.fn().mockResolvedValue({ id: 1, name: 'test' }),
  all: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }])
};

jest.mock('sqlite3', () => ({
  Database: jest.fn(() => mockDb)
}));
```

**External Service Mocking**:
```javascript
// Example: Mocking LLM service
const mockLLMService = {
  generateStrategy: jest.fn().mockResolvedValue({
    tasks: ['move_north', 'mine_block']
  })
};
```

## 6. Test Coverage and Quality Metrics

### 6.1 Coverage Goals

| Component | Branch Coverage | Function Coverage | Line Coverage |
| :--- | :---: | :---: | :---: |
| **Bot Core** | 80% | 85% | 85% |
| **Evolution Engine** | 75% | 80% | 80% |
| **API Layer** | 85% | 90% | 90% |
| **Data Models** | 90% | 95% | 95% |
| **Overall** | 80% | 85% | 85% |

### 6.2 Quality Gates

1. **Pre-commit Checks**:
   - All unit tests must pass
   - Code formatting (Prettier/ESLint)
   - No critical linting errors

2. **Pull Request Requirements**:
   - New features require corresponding tests
   - Bug fixes require regression tests
   - Coverage must not decrease

3. **Release Criteria**:
   - All tests passing
   - Minimum coverage thresholds met
   - Integration tests successful
   - Performance benchmarks satisfied

## 7. Continuous Integration Pipeline

### 7.1 GitHub Actions Workflow

**`.github/workflows/test.yml`**:
```yaml
name: Test Suite

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v4
      with:
        node-version: ${{ matrix.node-version }}
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run unit tests
      run: npm test
    
    - name: Run integration tests
      run: npm run test:integration
    
    - name: Generate coverage report
      run: npm run coverage
    
    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/coverage-final.json
```

### 7.2 Test Scripts

**`package.json` additions**:
```json
{
  "scripts": {
    "test": "jest --testPathPattern=\"\\.test\\.js$\"",
    "test:watch": "jest --watch",
    "test:integration": "jest --testPathPattern=\"integration\\.test\\.js$\"",
    "test:e2e": "jest --testPathPattern=\"e2e\\.test\\.js$\"",
    "coverage": "jest --coverage",
    "test:ci": "npm run lint && npm test && npm run test:integration"
  }
}
```

## 8. Test Data Management

### 8.1 Test Data Generation

**Factory Functions**:
```javascript
// test/factories/bot-factory.js
const createBotConfig = (overrides = {}) => ({
  botId: `test_bot_${Date.now()}`,
  username: 'test_bot',
  host: 'localhost',
  port: 25565,
  mode: 'autonomous',
  ...overrides
});

const createEvolutionData = () => ({
  domain: 'pathfinding',
  weights: [0.1, 0.2, 0.3, 0.4],
  learningRate: 0.01,
  lastUpdated: new Date().toISOString()
});
```

### 8.2 Test Database Management

**Database Helpers**:
```javascript
// test/helpers/db-helper.js
const createTestDatabase = async (dbName) => {
  const dbPath = path.join(__dirname, '..', `${dbName}.db`);
  
  // Setup test database
  const db = new sqlite3.Database(dbPath);
  
  // Initialize schema
  await runMigrations(db);
  
  return {
    db,
    path: dbPath,
    cleanup: () => {
      db.close();
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
    }
  };
};
```

## 9. Performance Testing

### 9.1 Load Testing

**Objectives**:
- Validate concurrent bot management
- Test database performance under load
- Monitor memory usage and garbage collection

**Test Scenarios**:
1. **Concurrent Bot Operations**:
   - 10+ bots connecting simultaneously
   - Parallel command execution
   - Status update throughput

2. **Evolution Engine Performance**:
   - Weight update scalability
   - Experience logging performance
   - Snapshot creation time

### 9.2 Stress Testing

**Boundary Conditions**:
- Maximum concurrent bot connections
- Database connection limits
- Memory usage under high load
- Network latency simulation

## 10. Maintenance and Evolution

### 10.1 Test Maintenance

**Regular Tasks**:
- Update tests for API changes
- Review and refactor test code
- Update test data generators
- Monitor test execution time

**Quarterly Tasks**:
- Review coverage metrics and goals
- Update performance benchmarks
- Evaluate new testing tools and frameworks
- Refactor test infrastructure

### 10.2 Test Evolution Strategy

1. **Incremental Improvement**:
   - Add tests for new features before implementation
   - Gradually increase coverage thresholds
   - Refactor existing tests for maintainability

2. **Technology Adoption**:
   - Evaluate new testing frameworks annually
   - Adopt industry best practices
   - Integrate with development workflows

## 11. Appendix

### 11.1 Test File Locations

| Test Type | Location Pattern | Examples |
| :--- | :--- | :--- |
| **Unit Tests** | `*.test.js` alongside source | `bot/index.js` ↔ `bot/index.test.js` |
| **Integration Tests** | `tests/*.test.js` | `tests/bot-server.test.js` |
| **Component Tests** | `component/*.test.js` | `bot/evolution/*.test.js` |

### 11.2 Common Test Patterns

**Database Test Pattern**:
```javascript
describe('Database Operations', () => {
  let db;
  let dbPath;
  
  beforeEach(async () => {
    // Setup isolated test database
  });
  
  afterEach(() => {
    // Cleanup test database
  });
  
  test('should perform operation', async () => {
    // Test logic
  });
});
```

**API Test Pattern**:
```javascript
describe('API Endpoints', () => {
  let server;
  
  beforeAll(async () => {
    // Start test server
  });
  
  afterAll(async () => {
    // Stop test server
  });
  
  test('should return expected response', async () => {
    // API request and assertions
  });
});
```

### 11.3 Troubleshooting Common Issues

| Issue | Solution |
| :--- | :--- |
| **Test database not cleaning up** | Ensure cleanup runs in `afterEach` |
| **Mock not resetting between tests** | Use `jest.clearAllMocks()` in `beforeEach` |
| **Race conditions in async tests** | Use proper async/await and Promise resolution |
| **Intermittent test failures** | Add retry logic or fix flaky dependencies |

---

*This document provides a comprehensive testing strategy for the MineBot project. Regular review and updates are recommended to align with project evolution and industry best practices.*