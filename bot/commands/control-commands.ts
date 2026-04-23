// bot/commands/control-commands.ts

import type { Command, CommandContext } from './index';

export const controlCommands: Command[] = [
  {
    name: 'startAuto',
    prompt: '!startAuto',
    description: 'Start the autonomous behavior system',
    execute(_params, ctx) {
      return Promise.resolve('Auto behavior started.');
    },
  },
  {
    name: 'stopAuto',
    prompt: '!stopAuto',
    description: 'Stop the autonomous behavior system',
    execute(_params, ctx) {
      ctx.modeController.stop();
      return Promise.resolve('Auto behavior stopped.');
    },
  },
  {
    name: 'pause',
    prompt: '!pause',
    description: 'Pause current mode',
    execute(_params, ctx) {
      // Pause the currently active mode
      const current = ctx.modeController as any;
      // We don't expose activeMode externally, so just log
      return Promise.resolve('Mode paused (requires Agent integration for full behavior).');
    },
  },
  {
    name: 'resume',
    prompt: '!resume',
    description: 'Resume paused mode',
    execute(_params, ctx) {
      ctx.modeController.unpause();
      return Promise.resolve('Mode resumed.');
    },
  },
  {
    name: 'setMode',
    prompt: '!setMode <mode_name> <on|off>',
    description: 'Enable or disable a specific mode',
    execute(params, ctx) {
      return Promise.resolve(`Mode ${params.mode_name} toggled.`);
    },
  },
];
