// Strategy class for LLM-based strategy generation

export interface ActionData {
  targetBlocks?: string[];
  radius?: number;
  width?: number;
  length?: number;
  height?: number;
  blockType?: string;
  x?: number;
  y?: number;
  z?: number;
}

export interface SuggestedAction {
  type: string;
  data: ActionData;
}

export interface StrategyResult {
  advice: string;
  suggested_actions: SuggestedAction[];
  usedFallback: boolean;
}

export interface VLLMRawResponse {
  advice: string;
  suggested_actions: SuggestedAction[];
}

export interface VLLMRequest {
  model: string;
  prompt: string;
  max_tokens: number;
  temperature: number;
}

export interface VLLMResponse {
  choices: Array<{
    text: string;
  }>;
}

export interface CurrentState {
  [key: string]: unknown;
}

class Strategy {
  private vllmUrl: string;
  private useFallback: boolean;

  constructor() {
    this.vllmUrl = process.env.VLLM_URL || 'http://localhost:8000';
    this.useFallback = process.env.USE_FALLBACK === 'true' || false;
  }

  async getStrategy(context: string, goal: string, current_state?: CurrentState): Promise<StrategyResult> {
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

  async queryVLLM(context: string, goal: string, current_state?: CurrentState): Promise<VLLMRawResponse | null> {
    try {
      const prompt = `Context: ${context}\nGoal: ${goal}\nCurrent State: ${JSON.stringify(current_state)}\nProvide strategic advice for a Minecraft bot:`;

      const response = await fetch(`${this.vllmUrl}/v1/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama2',
          prompt,
          max_tokens: 150,
          temperature: 0.7
        } as VLLMRequest)
      });

      if (!response.ok) {
        throw new Error(`VLLM request failed with status ${response.status}`);
      }

      const data = await response.json() as VLLMResponse;
      const adviceText = data.choices[0].text.trim();

      const suggested_actions: SuggestedAction[] = [];
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
      throw error;
    }
  }

  getFallbackStrategy(context: string, goal: string, current_state?: CurrentState): StrategyResult {
    let advice = '';
    let suggested_actions: SuggestedAction[] = [];

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

export default Strategy;