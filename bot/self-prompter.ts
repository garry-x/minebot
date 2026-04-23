// bot/self-prompter.ts

import type { Bot } from 'mineflayer';
import type { CommandRegistry } from './commands/index';
import type { GoalManager } from './goal-manager';
import { Logger } from './logger';

export enum SelfPrompterState { STOPPED = 0, ACTIVE = 1, PAUSED = 2 }

export class SelfPrompter {
  state: SelfPrompterState = SelfPrompterState.STOPPED;
  private loopActive = false;
  private interrupt = false;
  private prompt = '';
  private idleTime = 0;
  private cooldown = 2000;
  private maxFailedAttempts = 3;
  private bot: Bot;
  private commandRegistry: CommandRegistry;
  private goalManager: GoalManager;
  private logger: Logger;

  constructor(bot: Bot, commandRegistry: CommandRegistry, goalManager: GoalManager, logger: Logger) {
    this.bot = bot;
    this.commandRegistry = commandRegistry;
    this.goalManager = goalManager;
    this.logger = logger;
  }

  start(prompt: string): void {
    this.state = SelfPrompterState.ACTIVE;
    this.prompt = prompt;
    this.interrupt = false;
    this.startLoop();
  }

  stop(): void {
    this.state = SelfPrompterState.STOPPED;
    this.loopActive = false;
    this.interrupt = true;
    this.prompt = '';
  }

  pause(): void {
    this.state = SelfPrompterState.PAUSED;
    this.interrupt = true;
  }

  resume(): void {
    if (this.state === SelfPrompterState.PAUSED) {
      this.state = SelfPrompterState.ACTIVE;
      this.interrupt = false;
      this.startLoop();
    }
  }

  private async startLoop(): Promise<void> {
    this.loopActive = true;
    let noCommandCount = 0;

    while (this.loopActive && !this.interrupt) {
      const context = this.goalManager.toContextString();

      const llmPrompt = `You are self-prompting with the goal: "${this.prompt}". Your next response MUST contain a command with this syntax: !commandName. Respond:\n\nContext: ${context}\n\nAvailable commands:\n${this.commandRegistry.getAllPromptText()}\n\nResponse:`;

      // TODO: Replace with actual vLLM call — use LLMBrain from '../llm/brain'
      // const { LLMBrain } = await import('../llm/brain');
      // const brain = new LLMBrain();
      // const botState = this.extractBotState();
      // const goalContext = this.goalManager.getActive().map(g => ({ name: g.name, description: g.description }));
      // const response = await brain.decide(botState, { currentGoals: goalContext });
      // const text = response?.strategy || response?.reasoning || '';
      const response = '';  // Placeholder — LLM integration in Task 16

      // Check if response contains a command
      const cmdMatch = response.match(/!(\w+)(?:\(([^)]*)\))?/);
      if (!cmdMatch) {
        noCommandCount++;
        this.logger.warn(`Self-prompter: no command in response (${noCommandCount}/${this.maxFailedAttempts})`);
        if (noCommandCount >= this.maxFailedAttempts) {
          this.logger.warn('Self-prompter: max failed attempts reached, stopping.');
          this.state = SelfPrompterState.STOPPED;
          this.loopActive = false;
          break;
        }
      } else {
        noCommandCount = 0;
        const cmdName = cmdMatch[1];
        const rawParams = cmdMatch[2] || '';

        this.logger.info(`Self-prompter: executing !${cmdName} (${rawParams})`);
        const result = await this.commandRegistry.execute(cmdName, rawParams, {
          bot: this.bot,
          world: {} as any,
          skillRegistry: {} as any,
          modeController: {} as any,
        });
        this.logger.debug(`Self-prompter: result = ${result}`);
      }

      await new Promise(r => setTimeout(r, this.cooldown));
    }

    this.loopActive = false;
    this.interrupt = false;
  }

  update(delta: number): void {
    if (this.state === SelfPrompterState.ACTIVE && !this.loopActive && !this.interrupt) {
      this.idleTime += delta;
      if (this.idleTime >= this.cooldown) {
        this.idleTime = 0;
        this.startLoop();
      }
    }
  }
}
