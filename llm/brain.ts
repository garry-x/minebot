// LLMBrain - High-level strategic decision making via vLLM service

import { Bot } from 'mineflayer';
import crypto from 'crypto';

// Re-export types from goal-system for consistency
export type GoalDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface SubTaskData {
  id: string;
  name: string;
  completed: boolean;
  progress?: number;
  targetCategory?: string;
  target?: string;
  required?: number | string;
  type?: 'build' | 'craft' | 'explore';
  optional?: boolean;
}

export interface BotState {
  health: number;
  food: number;
  position: { x: number; y: number; z: number };
  biome: string;
  timeOfDay: number;
  inventory: Array<{ name: string; count: number }>;
  nearbyThreats: string[];
  nearbyResources: string[];
  nearbyEntities: string[];
  nearbyBlocks: string[];
  isDaytime: boolean;
}

export interface GoalStateData {
  goalId: string;
  goalName: string;
  goalDescription: string;
  progress: number;
  difficulty?: GoalDifficulty;
  subTasks?: SubTaskData[];
  materials?: Record<string, number>;
  rewards?: string[];
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

interface CacheEntry {
  decision: BrainDecision;
  timestamp: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
}

class LLMResponseCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private ttl: number;
  private enabled: boolean;
  private stats: CacheStats = { hits: 0, misses: 0, hitRate: 0 };

  constructor() {
    this.enabled = process.env.USE_LLM_CACHE !== 'false';
    this.maxSize = parseInt(process.env.LLM_CACHE_MAX || '50', 10);
    this.ttl = parseInt(process.env.LLM_CACHE_TTL || '30000', 10);

    if (this.enabled) {
      console.log(`[LLMResponseCache] Enabled - maxSize: ${this.maxSize}, ttl: ${this.ttl}ms`);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  get(key: string): BrainDecision | null {
    if (!this.enabled) return null;

    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    this.stats.hits++;
    this.updateHitRate();
    console.log(`[LLMResponseCache] Cache hit for key: ${key.substring(0, 16)}...`);
    return entry.decision;
  }

  set(key: string, decision: BrainDecision): void {
    if (!this.enabled) return;

    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.findOldestKey();
      if (oldestKey) {
        this.cache.delete(oldestKey);
        console.log(`[LLMResponseCache] Evicted oldest entry: ${oldestKey.substring(0, 16)}...`);
      }
    }

    this.cache.set(key, {
      decision,
      timestamp: Date.now()
    });
  }

  hashState(botState: BotState, goalState: GoalStateData): string {
    const decisionKey = {
      health: botState.health,
      food: botState.food,
      x: Math.floor(botState.position.x),
      y: Math.floor(botState.position.y),
      z: Math.floor(botState.position.z),
      goalId: goalState.goalId,
      goalName: goalState.goalName,
      progress: goalState.progress
    };

    const hashInput = JSON.stringify(decisionKey);
    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  private findOldestKey(): string | null {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }
}

class LLMBrain {
  private vllmUrl: string;
  private enabled: boolean;
  private model: string;
  private timeout: number;
  private cache: LLMResponseCache;
  private maxRetries: number;
  private retryDelay: number;
  private history: Array<{timestamp: number; decision: BrainDecision; botState: BotState; goalState: GoalStateData}> = [];
  private historySize: number;

  constructor() {
    this.vllmUrl = process.env.VLLM_URL || 'http://localhost:8000';
    this.enabled = process.env.USE_LLM === 'true' || false;
    this.model = process.env.LLM_MODEL || 'Qwen/Qwen3.6-35B-A3B-FP8';
    this.timeout = parseInt(process.env.LLM_TIMEOUT || '30000', 10);
    this.cache = new LLMResponseCache();
    this.maxRetries = parseInt(process.env.LLM_MAX_RETRIES || '3', 10);
    this.retryDelay = parseInt(process.env.LLM_RETRY_DELAY || '1000', 10);
    this.historySize = parseInt(process.env.LLM_HISTORY_SIZE || '10', 10);
  }

  private async retryWithBackoff<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        const status = (error as any).status;
        if (status && status >= 400 && status < 500 && status !== 429) break;
        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt);
          console.log(`[LLMBrain] Retry ${attempt + 1}/${this.maxRetries} after ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    throw lastError;
  }

  private addToHistory(decision: BrainDecision, botState: BotState, goalState: GoalStateData): void {
    this.history.push({ timestamp: Date.now(), decision, botState, goalState });
    while (this.history.length > this.historySize) this.history.shift();
  }

  getRecentDecisions(count = 5): Array<{timestamp: number; decision: BrainDecision}> {
    return this.history.slice(-count).map(h => ({ timestamp: h.timestamp, decision: h.decision }));
  }

  getDecisionPatterns(): Record<string, number> {
    const patterns: Record<string, number> = {};
    for (const h of this.history) {
      const key = `${h.decision.primary_action}:${h.decision.target?.value || 'none'}`;
      patterns[key] = (patterns[key] || 0) + 1;
    }
    return patterns;
  }

  getHistorySize(): number { return this.history.length; }

  isEnabled(): boolean {
    return this.enabled;
  }

  getCacheStats(): CacheStats {
    return this.cache.getStats();
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

    const entitiesStr = botState.nearbyEntities.length > 0
      ? botState.nearbyEntities.join(', ')
      : 'none';

    const blocksStr = botState.nearbyBlocks.length > 0
      ? botState.nearbyBlocks.join(', ')
      : 'none';

    const subTasksSection = this.buildSubTasksSection(goalState.subTasks);
    const materialsSection = this.buildMaterialsSection(goalState.materials, botState.inventory);
    const goalContextSection = this.buildGoalContextSection(goalState.difficulty, goalState.rewards);

    const sections: string[] = [
      `You are a Minecraft bot AI. Analyze state and respond ONLY with valid JSON.`,
      ``,
      `Current State:`,
      `- Health: ${botState.health}/20`,
      `- Food: ${botState.food}/20`,
      `- Position: (${botState.position.x.toFixed(1)}, ${botState.position.y.toFixed(1)}, ${botState.position.z.toFixed(1)})`,
      `- Biome: ${botState.biome}`,
      `- Time: ${this.getTimeOfDayDescription(botState.timeOfDay)}`,
      `- Inventory: ${inventoryStr}`,
      ``,
      `Nearby Threats: ${threatsStr}`,
      `Nearby Resources: ${resourcesStr}`,
      `Nearby Entities: ${entitiesStr}`,
      `Nearby Blocks: ${blocksStr}`,
      ``,
      `Current Goal: ${goalState.goalName} - ${goalState.goalDescription}`,
      `Goal Progress: ${goalState.progress}%`,
      subTasksSection,
      materialsSection
    ];

    if (goalContextSection) {
      sections.push(goalContextSection);
    }

    sections.push(
      ``,
      `Respond with ONLY valid JSON (no explanations, no thinking):`,
      `{"reasoning": "brief reason", "primary_action": "gather|combat|build|craft|explore|heal|retreat|idle", "target": {"type": "block|entity|position|item", "value": "target"}, "urgency": "high|medium|low", "strategy": "brief"}`,
      ``,
      `Choose the best action for goal progress. Respond with JSON only.`
    );

    return sections.join('\n');
  }

  parseResponse(response: string): BrainDecision | null {
    try {
      const jsonStr = this.extractJsonFromResponse(response);
      if (!jsonStr) {
        console.warn('[LLMBrain] No valid JSON, trying fallback parsing');
        return this.parseFallbackResponse(response);
      }

      const parsed = JSON.parse(jsonStr);
      return this.validateBrainDecision(parsed);
    } catch (error) {
      console.warn('[LLMBrain] JSON parse failed, using fallback:', (error as Error).message);
      return this.parseFallbackResponse(response);
    }
  }

  private parseFallbackResponse(response: string): BrainDecision | null {
    const text = response.toLowerCase();
    const actions = ['gather', 'combat', 'build', 'craft', 'explore', 'heal', 'retreat', 'idle'];
    let action = 'idle';
    for (const a of actions) {
      if (text.includes(a)) { action = a; break; }
    }
    const urgency = text.includes('high') ? 'high' : text.includes('low') ? 'low' : 'medium';
    return {
      reasoning: response.substring(0, 100),
      primary_action: action as BrainDecision['primary_action'],
      target: { type: 'item', value: 'unknown' },
      urgency,
      strategy: 'fallback from text'
    };
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

    if (this.cache.isEnabled()) {
      const cacheKey = this.cache.hashState(botState, goalState);
      const cachedDecision = this.cache.get(cacheKey);
      if (cachedDecision) {
        console.log('[LLMBrain] Using cached decision');
        return cachedDecision;
      }
    }

    const prompt = this.buildPrompt(botState, goalState);

    try {
      const response = await this.retryWithBackoff(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        try {
          const res = await fetch(`${this.vllmUrl}/v1/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: this.model,
              prompt,
              max_tokens: parseInt(process.env.LLM_MAX_TOKENS || '200', 10),
              temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
              stop: ['</think>', '\n\n\n']
            } as VLLMCompletionRequest),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (!res.ok) {
            const err = new Error(`VLLM request failed with status ${res.status}`);
            (err as any).status = res.status;
            throw err;
          }
          return res;
        } finally {
          clearTimeout(timeoutId);
        }
      });

      const data = await response.json() as VLLMCompletionResponse;
      const responseText = data.choices[0]?.text?.trim();

      if (!responseText) {
        throw new Error('Empty response from vLLM');
      }

      console.log('[LLMBrain] Received decision from vLLM');
      const decision = this.parseResponse(responseText);

      if (decision) {
        console.log(`[LLMBrain] Decision: ${decision.primary_action} (${decision.urgency}) - ${decision.reasoning}`);
        if (this.cache.isEnabled()) {
          const cacheKey = this.cache.hashState(botState, goalState);
          this.cache.set(cacheKey, decision);
        }
        this.addToHistory(decision, botState, goalState);
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
    if (timeOfDay < 6000) return 'morning (daytime)';
    if (timeOfDay < 12000) return 'afternoon (daytime)';
    if (timeOfDay < 18000) return 'evening (twilight)';
    return 'night';
  }

  private buildSubTasksSection(subTasks?: SubTaskData[]): string {
    if (!subTasks || subTasks.length === 0) {
      return 'Sub-tasks: none';
    }

    const taskLines = subTasks.map(task => {
      const status = task.completed ? '✓' : '○';
      const progress = task.progress !== undefined ? ` (${task.progress}%)` : '';
      const optional = task.optional ? ' [OPTIONAL]' : '';
      return `  - ${status} ${task.name}${progress}${optional}`;
    });

    return `Sub-tasks:\n${taskLines.join('\n')}`;
  }

  private buildMaterialsSection(
    materials: Record<string, number> | undefined,
    inventory: Array<{ name: string; count: number }>
  ): string {
    if (!materials || Object.keys(materials).length === 0) {
      return 'Materials needed: none specified';
    }

    const inventoryMap = new Map<string, number>();
    for (const item of inventory) {
      inventoryMap.set(item.name, (inventoryMap.get(item.name) || 0) + item.count);
    }

    const materialLines: string[] = [];
    for (const [material, needed] of Object.entries(materials)) {
      const have = inventoryMap.get(material) || 0;
      const status = have >= needed ? '✓' : '✗';
      materialLines.push(`  - ${material}: ${have}/${needed} ${status}`);
    }

    return `Materials needed vs inventory:\n${materialLines.join('\n')}`;
  }

  private buildGoalContextSection(
    difficulty: GoalDifficulty | undefined,
    rewards: string[] | undefined
  ): string {
    const parts: string[] = [];

    if (difficulty) {
      const difficultyEmoji = {
        beginner: '★☆☆',
        intermediate: '★★☆',
        advanced: '★★★',
        expert: '★★'
      };
      parts.push(`Difficulty: ${difficultyEmoji[difficulty]} (${difficulty})`);
    }

    if (rewards && rewards.length > 0) {
      parts.push(`Rewards: ${rewards.join(', ')}`);
    }

    return parts.length > 0 ? parts.join('\n') : '';
  }

  private validateBrainDecision(decision: Partial<BrainDecision>): BrainDecision | null {
    const validActions = ['gather', 'combat', 'build', 'craft', 'explore', 'heal', 'retreat', 'idle'];
    const validUrgencies = ['high', 'medium', 'low'];
    const validTargetTypes = ['block', 'entity', 'position', 'item'];

    if (!decision.primary_action || !validActions.includes(decision.primary_action)) {
      console.warn('[LLMBrain] Invalid primary_action:', decision.primary_action);
      return null;
    }

    if (!decision.target || !decision.target.value) {
      console.warn('[LLMBrain] Missing target value');
      return null;
    }

    if (decision.target.type && !validTargetTypes.includes(decision.target.type)) {
      decision.target.type = 'item';
    }

    if (!decision.urgency || !validUrgencies.includes(decision.urgency)) {
      decision.urgency = 'medium';
    }

    return {
      reasoning: decision.reasoning || 'No reasoning provided',
      primary_action: decision.primary_action,
      target: {
        type: decision.target.type || 'item',
        value: decision.target.value
      },
      urgency: decision.urgency,
      strategy: decision.strategy || ''
    };
  }

  private extractJsonFromResponse(response: string): string | null {
    const trimmed = response.trim();
    let clean = trimmed.replace(/<think>[\s\S]*?</think>/gi, '');
    clean = clean.replace(/<[\s\S]*?>/gi, '');

    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    let jsonStr = jsonMatch[0];
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    if (!jsonStr.includes('"primary_action"') || !jsonStr.includes('"reasoning"')) {
      return null;
    }

    return jsonStr;
  }

  static extractBotState(
    bot: Bot,
    nearbyThreats: string[] = [],
    nearbyResources: string[] = [],
    nearbyEntities: string[] = [],
    nearbyBlocks: string[] = []
  ): BotState {
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
      nearbyEntities,
      nearbyBlocks,
      isDaytime: (bot.time?.timeOfDay || 0) < 13000
    };
  }
}

export default LLMBrain;