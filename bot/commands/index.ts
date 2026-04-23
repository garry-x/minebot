// bot/commands/index.ts

import type { Bot } from 'mineflayer';
import type { SkillRegistry } from '../skills/index';
import type { ModeController } from '../engine/mode-controller';
import type { WorldState } from '../types';

export interface Command {
  name: string;
  prompt: string;
  description: string;
  paramSchema?: Record<string, { type: string; description: string }>;
  execute(params: Record<string, string>, ctx: CommandContext): Promise<string | undefined>;
}

export interface CommandContext {
  bot: Bot;
  world: WorldState;
  skillRegistry: SkillRegistry;
  modeController: ModeController;
}

export class CommandRegistry {
  private commands = new Map<string, Command>();

  register(cmd: Command): void {
    this.commands.set(cmd.name, cmd);
  }

  getAllPromptText(): string {
    return Array.from(this.commands.values())
      .map(cmd => `${cmd.prompt} - ${cmd.description}`)
      .join('\n');
  }

  getByName(name: string): Command | undefined {
    return this.commands.get(name);
  }

  async execute(name: string, rawParams: string, ctx: CommandContext): Promise<string> {
    const cmd = this.commands.get(name);
    if (!cmd) {
      return `Unknown command: ${name}`;
    }
    try {
      const result = await cmd.execute({}, ctx);
      return result || 'Command executed successfully.';
    } catch (err) {
      return `Command error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  parseCommandMessage(message: string): { name: string; params: string } | null {
    const match = message.match(/!(\w+)(?:\(([^)]*)\))?/);
    if (!match) return null;
    return {
      name: match[1],
      params: match[2] || '',
    };
  }
}
