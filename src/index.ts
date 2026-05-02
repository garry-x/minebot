import * as readline from "node:readline";
import { ping } from "bedrock-protocol";
import { parseArgs } from "./cli.js";
import { Bot } from "./bot.js";

async function promptPassword(): Promise<string> {
  const stdin = process.stdin;
  const stdout = process.stdout;

  if (!stdin.isTTY) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    return new Promise((resolve) => {
      rl.question("Password: ", (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  stdout.write("Password: ");
  stdin.resume();
  stdin.setEncoding("utf8");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (stdin as any).setRawMode(true);

  let password = "";

  return new Promise((resolve) => {
    const onData = (char: string) => {
      switch (char) {
        case "\n":
        case "\r":
        case "\u0004": // Ctrl+D
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (stdin as any).setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          stdout.write("\n");
          resolve(password);
          break;
        case "\u0003": // Ctrl+C
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (stdin as any).setRawMode(false);
          stdin.pause();
          process.exit(130);
        case "\u007f": // Backspace
        case "\b":
          if (password.length > 0) {
            password = password.slice(0, -1);
            stdout.write("\b \b");
          }
          break;
        default:
          if (char >= " " && char.length === 1) {
            password += char;
            stdout.write("*");
          }
          break;
      }
    };

    stdin.on("data", onData);
  });
}

async function resolvePassword(args: {
  password?: string;
}): Promise<string> {
  if (args.password) {
    return args.password;
  }

  const envPassword = process.env.MINEBOT_PASSWORD;
  if (envPassword) {
    return envPassword;
  }

  const password = await promptPassword();
  if (!password) {
    console.error("Error: Password cannot be empty.");
    process.exit(1);
  }
  return password;
}

async function pingServer(host: string, port: number): Promise<void> {
  try {
    const result = await ping({ host, port });
    console.log(`Server: ${host}:${port}`);
    console.log(`Version: ${(result as any).version?.name ?? "unknown"}`);
    console.log(`Players: ${(result as any).players?.online ?? 0}/${(result as any).players?.max ?? 0}`);
    console.log(`Latency: ${(result as any).latency ?? "unknown"}ms`);
    console.log(`Status: Online`);
  } catch (err) {
    console.error(`Failed to ping ${host}:${port}:`, (err as Error).message);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.pingOnly) {
    await pingServer(args.host, args.port);
    return;
  }

  const password = await resolvePassword(args);

  const bot = new Bot({
    host: args.host,
    port: args.port,
    email: args.email,
    password,
    username: args.username,
    debug: args.debug,
    diagnose: args.diagnose,
  });

  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    bot.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    bot.stop();
    process.exit(0);
  });

  try {
    await bot.start();
  } catch (err) {
    console.error("Failed to start bot:", err);
    process.exit(1);
  }
}

main();
