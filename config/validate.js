require('dotenv').config();
const fs = require('fs');
const path = require('path');
const logger = require('../bot/logger');

const requiredEnvVars = [
  'MINECRAFT_SERVER_HOST',
  'MINECRAFT_SERVER_PORT',
  'BOT_SERVER_HOST',
  'BOT_SERVER_PORT'
];

const optionalEnvVars = [
  'MINECRAFT_SERVER_DIR',
  'MINECRAFT_JAR_PATH',
  'MINECRAFT_PID_FILE',
  'MINECRAFT_MAX_MEMORY',
  'MINECRAFT_SERVER_ARGS',
  'BOT_PID_FILE',
  'BOT_LOG_FILE',
  'LOG_DIR',
  'VLLM_URL',
  'LLM_SERVICE_URL',
  'USE_FALLBACK',
  'FRONTEND_PORT',
  'API_TARGET',
  'SESSION_SECRET',
  'MICROSOFT_CLIENT_ID',
  'MICROSOFT_CLIENT_SECRET',
  'LOG_LEVEL',
  'NODE_ENV'
];

const configDefaults = {
  MINECRAFT_SERVER_HOST: 'localhost',
  MINECRAFT_SERVER_PORT: '25565',
  BOT_SERVER_HOST: 'localhost',
  BOT_SERVER_PORT: '9500',
  MINECRAFT_SERVER_DIR: 'resources/java-1.21.11',
  MINECRAFT_JAR_PATH: 'minecraft_server.1.21.11.jar',
  MINECRAFT_PID_FILE: 'logs/minecraft_server.pid',
  MINECRAFT_MAX_MEMORY: '1G',
  MINECRAFT_SERVER_ARGS: 'nogui',
  BOT_PID_FILE: 'logs/bot_server.pid',
  BOT_LOG_FILE: 'bot_server.log',
  LOG_DIR: 'logs',
  VLLM_URL: 'http://localhost:8000',
  LLM_SERVICE_URL: 'http://localhost:8000',
  USE_FALLBACK: 'false',
  FRONTEND_PORT: '3000',
  API_TARGET: 'http://localhost:9500',
  SESSION_SECRET: 'your_session_secret_here',
  LOG_LEVEL: 'info',
  NODE_ENV: 'development'
};

function validateEnvVars() {
  const missingVars = [];
  const issues = [];

  for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  }

  if (missingVars.length > 0) {
    issues.push({
      type: 'error',
      message: `Missing required environment variables: ${missingVars.join(', ')}`
    });
  }

  if (issues.length > 0) {
    logger.error('Configuration validation failed:');
    issues.forEach(issue => {
      logger.error(`  [${issue.type.toUpperCase()}] ${issue.message}`);
    });
    return false;
  }

  logger.info('Configuration validation passed');
  return true;
}

function validatePaths() {
  const issues = [];

  const serverDir = process.env.MINECRAFT_SERVER_DIR || configDefaults.MINECRAFT_SERVER_DIR;
  const jarPath = process.env.MINECRAFT_JAR_PATH || configDefaults.MINECRAFT_JAR_PATH;
  const fullJarPath = path.join(__dirname, '..', serverDir, jarPath);

  if (!fs.existsSync(serverDir)) {
    issues.push({
      type: 'warning',
      message: `Minecraft server directory does not exist: ${serverDir}`
    });
  }

  if (!fs.existsSync(fullJarPath)) {
    issues.push({
      type: 'warning',
      message: `Minecraft server jar not found: ${fullJarPath}`
    });
  }

  const logDir = process.env.LOG_DIR || configDefaults.LOG_DIR;
  if (!fs.existsSync(logDir)) {
    try {
      fs.mkdirSync(logDir, { recursive: true });
      issues.push({
        type: 'info',
        message: `Created log directory: ${logDir}`
      });
    } catch (err) {
      issues.push({
        type: 'error',
        message: `Cannot create log directory: ${logDir} - ${err.message}`
      });
    }
  }

  if (issues.length > 0) {
    issues.forEach(issue => {
      const logMethod = issue.type === 'warning' ? 'warn' : issue.type;
      logger[logMethod](`Path validation: ${issue.message}`);
    });
  }

  return issues.every(issue => issue.type !== 'error');
}

function getConfigSummary() {
  const config = {};
  
  for (const varName of [...requiredEnvVars, ...optionalEnvVars]) {
    config[varName] = process.env[varName] || configDefaults[varName];
  }
  
  return config;
}

function printConfigSummary() {
  const config = getConfigSummary();
  
  logger.info('Configuration summary:');
  Object.entries(config).forEach(([key, value]) => {
    logger.info(`  ${key}=${value}`);
  });
}

module.exports = {
  validateEnvVars,
  validatePaths,
  getConfigSummary,
  printConfigSummary
};
