import express, { Request, Response } from 'express';
import Strategy, { SuggestedAction } from './strategy';

const app = express();
const PORT = process.env.PORT || 8000;
const strategy = new Strategy();

app.use(express.json());

interface StrategyRequestBody {
  context?: string;
  goal?: string;
  current_state?: Record<string, unknown>;
}

interface StrategyResponse {
  advice: string;
  suggested_actions: SuggestedAction[];
  timestamp: string;
  usedFallback: boolean;
}

interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
  vllmAvailable: boolean;
}

interface ErrorResponse {
  status?: string;
  service?: string;
  error: string;
  timestamp: string;
}

app.get('/health', async (_req: Request, res: Response<HealthResponse | ErrorResponse>) => {
  try {
    res.json({
      status: 'OK',
      service: 'LLM',
      timestamp: new Date().toISOString(),
      vllmAvailable: true
    });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({
      status: 'ERROR',
      service: 'LLM',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/strategy', async (req: Request<unknown, unknown, StrategyRequestBody>, res: Response<StrategyResponse | ErrorResponse>) => {
  try {
    const { context, goal, current_state } = req.body;

    if (!context || !goal) {
      return res.status(400).json({
        error: 'Context and goal are required',
        timestamp: new Date().toISOString()
      });
    }

    const result = await strategy.getStrategy(context, goal, current_state);

    res.json({
      advice: result.advice,
      suggested_actions: result.suggested_actions || [],
      timestamp: new Date().toISOString(),
      usedFallback: result.usedFallback || false
    });
  } catch (error) {
    const err = error as Error;
    console.error('LLM service error:', err);
    res.status(500).json({
      error: `LLM processing failed: ${err.message}`,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/strategy/fallback', (req: Request<unknown, unknown, StrategyRequestBody>, res: Response<StrategyResponse | ErrorResponse>) => {
  try {
    const { context, goal, current_state } = req.body;

    let advice = '';
    let suggested_actions: SuggestedAction[] = [];

    if (goal?.includes('build') || goal?.includes('construct')) {
      advice = 'To build effectively, start by gathering necessary materials. Consider building a foundation first, then walls, and finally a roof.';
      suggested_actions = [
        { type: 'gather', data: { targetBlocks: ['oak_log', 'cobblestone'], radius: 10 } },
        { type: 'build', data: { width: 5, length: 5, height: 3, blockType: 'oak_planks' } }
      ];
    } else if (goal?.includes('gather') || goal?.includes('collect')) {
      advice = 'Focus on gathering the most needed resources first. Prioritize rare materials over common ones.';
      suggested_actions = [
        { type: 'gather', data: { targetBlocks: ['diamond_ore', 'iron_ore', 'gold_ore'], radius: 20 } }
      ];
    } else if (goal?.includes('explore') || goal?.includes('find')) {
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
    const err = error as Error;
    res.status(500).json({
      error: `Fallback strategy failed: ${err.message}`,
      timestamp: new Date().toISOString()
    });
  }
});

app.listen(PORT, () => {
  console.log(`LLM Service running on port ${PORT}`);
});

export default app;