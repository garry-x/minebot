import { ping } from "bedrock-protocol";
import { parseArgs } from "./cli.js";
import { Bot } from "./bot.js";

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

  if (!args.email) {
    console.error("Error: --email is required");
    process.exit(1);
  }

  if (args.password) {
    console.warn("Warning: Password authentication is no longer supported by Microsoft. Ignoring --password.");
  }

  const bot = new Bot({
    host: args.host,
    port: args.port,
    email: args.email ?? "",
    username: args.username,
    debug: args.debug,
    diagnose: args.diagnose,
    offline: args.offline,
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
