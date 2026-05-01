import { parseArgs } from "./cli.js";
import { Bot } from "./bot.js";

async function main(): Promise<void> {
  const args = parseArgs();

  const bot = new Bot({
    host: args.host,
    port: args.port,
    email: args.email,
    password: args.password,
    username: args.username,
    debug: args.debug,
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
