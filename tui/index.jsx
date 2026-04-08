import React, { useState, useCallback, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import Navigation from './components/Navigation.jsx';
import Footer from './components/Footer.jsx';
import Dashboard from './views/Dashboard.jsx';
import ServerControl from './views/ServerControl.jsx';
import BotManagement from './views/BotManagement.jsx';
import LogViewer from './views/LogViewer.jsx';
import Help from './views/Help.jsx';
import * as integration from './integration.mjs';

export const VIEWS = {
  DASHBOARD: 'dashboard',
  BOT_MANAGEMENT: 'bot-management',
  SERVER_CONTROL: 'server-control',
  LOG_VIEWER: 'log-viewer',
  HELP: 'help'
};

export const NAV_ITEMS = [
  { key: '1', label: 'Dashboard', view: VIEWS.DASHBOARD },
  { key: '2', label: 'Bot Management', view: VIEWS.BOT_MANAGEMENT },
  { key: '3', label: 'Server Control', view: VIEWS.SERVER_CONTROL },
  { key: '4', label: 'Log Viewer', view: VIEWS.LOG_VIEWER },
  { key: '5', label: 'Help', view: VIEWS.HELP },
];

const AdminTUI = () => {
  const { exit } = useApp();
  const [currentView, setCurrentView] = useState(VIEWS.DASHBOARD);
  const [actionMessage, setActionMessage] = useState('');
  const [systemStatus, setSystemStatus] = useState(null);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await integration.getSystemStatus();
      setSystemStatus(status);
    } catch {
      setSystemStatus(null);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 10000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  useInput((input, key) => {
    if (input === 'q' || input === 'Q') {
      exit();
      return;
    }
    if (input === 'h' || input === 'H') {
      setCurrentView(VIEWS.HELP);
      return;
    }
    if (input === 'r' || input === 'R') {
      refreshStatus();
      setActionMessage('Refreshing...');
      setTimeout(() => setActionMessage(''), 1500);
      return;
    }
    if (input === 'm' || input === 'M') {
      setCurrentView(VIEWS.DASHBOARD);
      return;
    }
    if (input >= '1' && input <= '5') {
      const viewIndex = parseInt(input) - 1;
      if (NAV_ITEMS[viewIndex]) {
        setCurrentView(NAV_ITEMS[viewIndex].view);
      }
    }
  });

  const handleAction = useCallback((msg) => {
    setActionMessage(msg);
    setTimeout(() => setActionMessage(''), 3000);
    if (msg === 'bot:View Logs') {
      setCurrentView(VIEWS.LOG_VIEWER);
    }
  }, []);

  const renderView = () => {
    switch (currentView) {
      case VIEWS.DASHBOARD:
        return <Dashboard systemStatus={systemStatus} />;
      case VIEWS.SERVER_CONTROL:
        return <ServerControl onAction={handleAction} systemStatus={systemStatus} />;
      case VIEWS.BOT_MANAGEMENT:
        return <BotManagement systemStatus={systemStatus} />;
      case VIEWS.LOG_VIEWER:
        return <LogViewer />;
      case VIEWS.HELP:
        return <Help />;
      default:
        return <Dashboard systemStatus={systemStatus} />;
    }
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color="cyan" bold>MineBot Admin Console</Text>
      </Box>
      <Box flexDirection="column" borderStyle="round" borderColor="blue" padding={1}>
        <Navigation currentView={currentView} navItems={NAV_ITEMS} onViewChange={setCurrentView} />
        <Box borderStyle="single" borderColor="gray" padding={1}>
          {renderView()}
        </Box>
        {actionMessage && (
          <Box marginTop={1}>
            <Text color="cyan">ℹ {actionMessage}</Text>
          </Box>
        )}
        <Footer currentView={currentView} />
      </Box>
    </Box>
  );
};

export function startAdminTUI() {
  render(<AdminTUI />);
}