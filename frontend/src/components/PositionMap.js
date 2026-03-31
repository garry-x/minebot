import React from 'react';
import './PositionMap.css';

const PositionMap = ({ position, exploration }) => {
  const mapSize = 200; // pixels
  const cellSize = 20; // pixels per cell
  const gridSize = Math.floor(mapSize / cellSize); // 10x10 grid
  
  // Handle exploration as either a number or an object
  const expValue = typeof exploration === 'object' 
    ? exploration.points || exploration.progress || 0 
    : exploration;
  
  // Convert world position to grid coordinates (simplified)
  const gridX = Math.floor((position.x + 50) / 10) % gridSize;
  const gridZ = Math.floor((position.z + 50) / 10) % gridSize;
  
  const cells = [];
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const isBot = row === gridX && col === gridZ;
      const isExplored = Math.random() < expValue / 100; // Simplified exploration
      
      cells.push(
        <div
          key={`${row}-${col}`}
          className={`map-cell ${isBot ? 'bot-position' : ''} ${isExplored ? 'explored' : 'unexplored'}`}
          style={{
            left: `${col * cellSize}px`,
            top: `${row * cellSize}px`,
            width: `${cellSize}px`,
            height: `${cellSize}px`
          }}
        />
      );
    }
  }
  
  return (
    <div className="position-map-container">
      <div className="position-map-title">Bot Position</div>
      <div className="position-map">
        {cells}
        <div className="coords-label">
          X: {position.x} Y: {position.y} Z: {position.z}
        </div>
      </div>
      <div className="exploration-label">Explored: {expValue.toFixed(1)}%</div>
    </div>
  );
};

export default PositionMap;