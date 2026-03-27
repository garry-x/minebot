class Strategy {
  constructor() {
    // In a real implementation, we would initialize connection to vllm here
    this.vllmUrl = process.env.VLLM_URL || 'http://localhost:8000';
    this.useFallback = process.env.USE_FALLBACK === 'true' || false;
  }

  async getStrategy(context, goal, current_state) {
    // Try to get strategy from vllm if available and not forced to use fallback
    if (!this.useFallback) {
      try {
        const result = await this.queryVLLM(context, goal, current_state);
        if (result) {
          return {
            advice: result.advice,
            suggested_actions: result.suggested_actions,
            usedFallback: false
          };
        }
      } catch (error) {
        console.error('VLLM query failed, falling back to rule-based strategy:', error);
        // Fall through to fallback
      }
    }
    
    // Use fallback strategy
    return this.getFallbackStrategy(context, goal, current_state);
  }

  async queryVLLM(context, goal, current_state) {
    // Make an HTTP request to the vllm server
    try {
      const response = await fetch(`${this.vllmUrl}/v1/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama2', // or whatever model you're using
          prompt: `Context: ${context}\nGoal: ${goal}\nCurrent State: ${JSON.stringify(current_state)}\nProvide strategic advice for a Minecraft bot:`,
          max_tokens: 150,
          temperature: 0.7
        })
      });
      
      if (!response.ok) {
        throw new Error(`VLLM request failed with status ${response.status}`);
      }
      
      const data = await response.json();
      // Parse the response to extract advice and suggested actions
      // This would depend on how your vllm is set up and what it returns
      // For now, we'll extract basic text and create simple suggested actions
      const adviceText = data.choices[0].text.trim();
      
      // Generate simple suggested actions based on the advice
      const suggested_actions = [];
      if (adviceText.toLowerCase().includes('build') || adviceText.toLowerCase().includes('construct')) {
        suggested_actions.push({ 
          type: 'gather', 
          data: { targetBlocks: ['oak_log', 'cobblestone'], radius: 10 } 
        });
        suggested_actions.push({ 
          type: 'build', 
          data: { width: 5, length: 5, height: 3, blockType: 'oak_planks' } 
        });
      } else if (adviceText.toLowerCase().includes('gather') || adviceText.toLowerCase().includes('collect')) {
        suggested_actions.push({ 
          type: 'gather', 
          data: { targetBlocks: ['diamond_ore', 'iron_ore', 'gold_ore'], radius: 20 } 
        });
      } else if (adviceText.toLowerCase().includes('explore') || adviceText.toLowerCase().includes('find')) {
        suggested_actions.push({ 
          type: 'move', 
          data: { x: 10, y: 64, z: 10 } 
        });
      } else {
        suggested_actions.push({ 
          type: 'gather', 
          data: { targetBlocks: ['grass', 'dirt', 'stone'], radius: 5 } 
        });
      }
      
      return {
        advice: adviceText,
        suggested_actions: suggested_actions
      };
    } catch (error) {
      console.error('Error querying VLLM:', error);
      throw error; // Re-throw to trigger fallback
    }
  }

  getFallbackStrategy(context, goal, current_state) {
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
    
    return { 
      advice, 
      suggested_actions,
      usedFallback: true
    };
  }
}

module.exports = Strategy;