const express = require('express');
const Strategy = require('./strategy');
const app = express();
const PORT = process.env.PORT || 8000;
const strategy = new Strategy();

app.use(express.json());

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // In a real implementation, we might check connection to vllm server
    res.json({ 
      status: 'OK', 
      service: 'LLM', 
      timestamp: new Date().toISOString(),
      // Simulate checking if vllm is available
      vllmAvailable: true 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      service: 'LLM', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Strategy endpoint - proxy to actual LLM or use fallback
app.post('/strategy', async (req, res) => {
  try {
    const { context, goal, current_state } = req.body;
    
    // Validate input
    if (!context || !goal) {
      return res.status(400).json({ 
        error: 'Context and goal are required' 
      });
    }
    
    // Get strategy from LLM service
    const result = await strategy.getStrategy(context, goal, current_state);
    
    res.json({
      advice: result.advice,
      suggested_actions: result.suggested_actions || [],
      timestamp: new Date().toISOString(),
      // Indicate if we used fallback
      usedFallback: result.usedFallback || false
    });
  } catch (error) {
    console.error('LLM service error:', error);
    res.status(500).json({ 
      error: `LLM processing failed: ${error.message}`,
      timestamp: new Date().toISOString()
    });
  }
});

// Fallback strategy endpoint (when LLM is unavailable)
app.post('/strategy/fallback', (req, res) => {
  try {
    const { context, goal, current_state } = req.body;
    
    // Simple rule-based fallback responses
    let advice = '';
    let suggested_actions = [];
    
    if (goal.includes('build') || goal.includes('construct')) {
      advice = 'To build effectively, start by gathering necessary materials. Consider building a foundation first, then walls, and finally a roof.';
      suggested_actions = [
        { type: 'gather', data: { targetBlocks: ['oak_log', 'cobblestone'], radius: 10 } },
        { type: 'build', data: { width: 5, length: 5, height: 3, blockType: 'oak_planks' } }
      ];
    } else if (goal.includes('gather') || goal.includes('collect')) {
      advice = 'Focus on gathering the most needed resources first. Prioritize rare materials over common ones.';
      suggested_actions = [
        { type: 'gather', data: { targetBlocks: ['diamond_ore', 'iron_ore', 'gold_ore'], radius: 20 } }
      ];
    } else if (goal.includes('explore') || goal.includes('find')) {
      advice = 'When exploring, mark your starting point and move in systematic patterns to avoid getting lost.';
      suggested_actions = [
        { type: 'move', data: { x: 10, y: 64, z: 10 } }
      ];
    } else {
      advice = 'Consider your current situation and what resources are most accessible. Start with simple actions to build momentum.';
      suggested_actions = [
        { type: 'gather', data: { targetBlocks: ['grass', 'dirt', 'stone'], radius: 5 } }
      ];
    }
    
    res.json({ 
      advice, 
      suggested_actions,
      timestamp: new Date().toISOString(),
      usedFallback: true
    });
  } catch (error) {
    res.status(500).json({ error: `Fallback strategy failed: ${error.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`LLM Service running on port ${PORT}`);
});