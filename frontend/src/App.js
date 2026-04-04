import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import BotManagement from './components/BotManagement';
import Dashboard from './components/Dashboard';
import './App.css';

function App() {
  return (
    <div className="App">
      <main>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<BotManagement />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dashboard/:botId" element={<Dashboard />} />
          </Routes>
        </BrowserRouter>
      </main>
    </div>
  );
}

export default App;
