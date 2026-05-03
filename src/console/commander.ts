import * as readline from "node:readline";

export type CommandHandler = (args: string[]) => string | void;

export interface CommanderCallbacks {
  onStop: () => void;
  onStatus: () => string;
  onPhase: (args: string[]) => string;
  onInv: () => string;
  onSkill: (args: string[]) => string;
  onGoto: (args: string[]) => string;
  onSay: (args: string[]) => string;
  onHealth: () => string;
  onCmd: (args: string[]) => string;
}

export class Commander {
  private rl: readline.Interface | null = null;

  constructor(private callbacks: CommanderCallbacks) {}

  start(): void {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "/",
      historySize: 100,
      removeHistoryDuplicates: true,
    });

    process.stdin.setRawMode?.(false);

    this.rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        this.rl!.prompt();
        return;
      }
      const parts = trimmed.split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1);

      let result: string | void = undefined;
      switch (cmd) {
        case "stop":   this.callbacks.onStop(); break;
        case "status": result = this.callbacks.onStatus(); break;
        case "phase":  result = this.callbacks.onPhase(args); break;
        case "inv":    result = this.callbacks.onInv(); break;
        case "skill":  result = this.callbacks.onSkill(args); break;
        case "goto":   result = this.callbacks.onGoto(args); break;
        case "say":    result = this.callbacks.onSay(args); break;
        case "health": result = this.callbacks.onHealth(); break;
        case "cmd":    result = this.callbacks.onCmd(args); break;
        case "help":
          result = [
            "Commands:",
            "  /stop           Stop bot and exit",
            "  /status         Print full status",
            "  /phase [set X]  Show/set current phase",
            "  /inv            Show inventory",
            "  /skill [set X]  Show/set current skill",
            "  /goto <x> <y> <z>  Path to coordinates",
            "  /say <msg...>   Send chat message",
            "  /health         Show HP/hunger/armor",
            "  /cmd <raw...>   Send server command",
            "  /help           This help",
          ].join("\n");
          break;
        default:
          result = `Unknown command: ${cmd}. Type /help for commands.`;
      }
      if (result) process.stdout.write("\x1b[K" + result + "\n");
    });

    this.rl.on("close", () => {
      process.stdout.write("Console closed. Exiting...\n");
      process.exit(2);
    });
  }

  stop(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }
}
