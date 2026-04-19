// LLMBrain - High-level strategic decision making via vLLM service

import { Bot } from 'mineflayer';

export interface BotState {
  health: number;
  food: number;
  position: { x: number; y: number; z: number };
  biome: string;
  timeOfDay: number;
  inventory: Array<{ name: string; count: number }>;
  nearbyThreats: string[];
  nearbyResources: string[];
  isDaytime: boolean;
}

export interface GoalStateData {
  goalId: string;
  goalName: string;
  goalDescription: string;
  progress: number;
  subTasks?: Array<{ id: string; name: string; completed: boolean; progress?: number }>;
}

export interface DecisionTarget {
  type: 'block' | 'entity' | 'position' | 'item';
  value: string;
}

export interface BrainDecision {
  reasoning: string;
  primary_action: 'gather' | 'combat' | 'build' | 'craft' | 'explore' | 'heal' | 'retreat' | 'idle';
  target: DecisionTarget;
  urgency: 'high' | 'medium' | 'low';
  strategy: string;
}

interface VLLMCompletionRequest {
  model: string;
  prompt: string;
  max_tokens: number;
  temperature: number;
}

interface VLLMCompletionResponse {
  choices: Array<{ text: string }>;
}

class LLMBrain {
  private vllmUrl: string;
  private enabled: boolean;
  private model: string;
  private timeout: number;

  constructor() {
    this.vllmUrl = process.env.VLLM_URL || 'http://localhost:8000';
    this.enabled = process.env.USE_LLM === 'true' || false;
    this.model = process.env.LLM_MODEL || 'llama2';
    this.timeout = parseInt(process.env.LLM_TIMEOUT || '30000', 10);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.vllmUrl}/v1/models`, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      console.error('[LLMBrain] vLLM service unavailable:', (error as Error).message);
      return false;
    }
  }

  buildPrompt(botState: BotState, goalState: GoalStateData): string {
    const inventoryStr = botState.inventory.length > 0
      ? botState.inventory.map(i => `${i.name} x${i.count}`).join(', ')
      : 'empty';

    const threatsStr = botState.nearbyThreats.length > 0
      ? botState.nearbyThreats.join(', ')
      : 'none';

    const resourcesStr = botState.nearbyResources.length > 0
      ? botState.nearbyResources.join(', ')
      : 'none';

    return `You are an AI controlling a Minecraft bot.

Current State:
- Health: ${botState.health}/20
- Food: ${botState.food}/20
- Position: (${botState.position.x.toFixed(1)}, ${botState.position.y.toFixed(1)}, ${botState.position.z.toFixed(1)})
- Biome: ${botState.biome}
- Time: ${this.getTimeOfDayDescription(botState.timeOfDay)}
- Inventory: ${inventoryStr}

Nearby Threats: ${threatsStr}
Nearby Resources: ${resourcesStr}

Current Goal: ${goalState.goalName} - ${goalState.goalDescription}
Goal Progress: ${goalState.progress}%

Decide the best action. Return in JSON format:
{
  "reasoning": "why you chose this action",
  "primary_action": "gather|combat|build|craft|explore|heal|retreat|idle",
  "target": {
    "type": "block|entity|position|item",
    "value": "specific target"
  },
  "urgency": "high|medium|low",
  "strategy": "brief strategy explanation"
}`;
  }

  parseResponse(response: string): BrainDecision | null {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('[LLMBrain] No valid JSON found in response');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (!parsed.primary_action || !parsed.target || !parsed.urgency) {
        console.warn('[LLMBrain] Missing required fields in response');
        return null;
      }

      const validActions = ['gather', 'combat', 'build', 'craft', 'explore', 'heal', 'retreat', 'idle'];
      if (!validActions.includes(parsed.primary_action)) {
        console.warn('[LLMBrain] Invalid primary_action:', parsed.primary_action);
        return null;
      }

      const validUrgencies = ['high', 'medium', 'low'];
      if (!validUrgencies.includes(parsed.urgency)) {
        parsed.urgency = 'medium';
      }

      return {
        reasoning: parsed.reasoning || 'No reasoning provided',
        primary_action: parsed.primary_action,
        target: { type: parsed.target.type || 'item', value: parsed.target.value || '' },
        urgency: parsed.urgency,
        strategy: parsed.strategy || ''
      };
    } catch (error) {
      console.error('[LLMBrain] Failed to parse response:', (error as Error).message);
      return null;
    }
  }

  async decide(botState: BotState, goalState: GoalStateData): Promise<BrainDecision | null> {
    if (!this.enabled) {
      console.debug('[LLMBrain] LLM brain is disabled, returning null for fallback');
      return null;
    }

    const available = await this.isAvailable();
    if (!available) {
      console.debug('[LLMBrain] vLLM service unavailable, returning null for fallback');
      return null;
    }

    const prompt = this.buildPrompt(botState, goalState);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.vllmUrl}/v1/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          max_tokens: 300,
          temperature: 0.7
        } as VLLMCompletionRequest),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`VLLM request failed with status ${response.status}`);
      }

      const data = await response.json() as VLLMCompletionResponse;
      const responseText = data.choices[0]?.text?.trim();

      if (!responseText) {
        throw new Error('Empty response from vLLM');
      }

      console.log('[LLMBrain] Received decision from vLLM');
      const decision = this.parseResponse(responseText);

      if (decision) {
        console.log(`[LLMBrain] Decision: ${decision.primary_action} (${decision.urgency}) - ${decision.reasoning}`);
      }

      return decision;
    } catch (error) {
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('abort')) {
        console.error('[LLMBrain] Request timed out after', this.timeout, 'ms');
      } else {
        console.error('[LLMBrain] Error querying vLLM:', errorMessage);
      }
      return null;
    }
  }

  private getTimeOfDayDescription(timeOfDay: number): string {
    // 0 = sunrise, 6000 = noon, 12000 = sunset, 18000 = midnight
    if (timeOfDay < 6000) return 'morning (daytime)';
    if (timeOfDay < 12000) return 'afternoon (daytime)';
    if (timeOfDay < 18000) return 'evening (twilight)';
    return 'night';
  }

  static extractBotState(bot: Bot, nearbyThreats: string[] = [], nearbyResources: string[] = []): BotState {
    const pos = bot.entity?.position;

    let biome = 'unknown';
    try {
      const world = (bot as any).world;
      if (world?.getBiome) {
        const biomeData = world.getBiome(
          Math.floor(pos?.x || 0),
          Math.floor(pos?.y || 0),
          Math.floor(pos?.z || 0)
        );
        biome = biomeData?.name || 'unknown';
      }
    } catch { }

    const inventory: Array<{ name: string; count: number }> = [];
    try {
      const items = bot.inventory?.items() || [];
      for (const item of items) {
        if (item.name && item.count) {
          inventory.push({ name: item.name, count: item.count });
        }
      }
    } catch { }

    return {
      health: bot.health || 20,
      food: bot.food || 20,
      position: { x: pos?.x || 0, y: pos?.y || 0, z: pos?.z || 0 },
      biome,
      timeOfDay: bot.time?.timeOfDay || 0,
      inventory,
      nearbyThreats,
      nearbyResources,
      isDaytime: (bot.time?.timeOfDay || 0) < 13000
    };
  }
}

export default LLMBrain;