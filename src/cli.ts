import yargs from "yargs";
import { hideBin } from "yargs/helpers";

export interface CliArgs {
  host: string;
  port: number;
  email: string;
  password?: string;
  username?: string;
  debug?: boolean;
  config?: string;
  pingOnly?: boolean;
  diagnose?: boolean;
  tracePackets?: boolean;
}

export function parseArgs(argv: string[] = process.argv): CliArgs {
  return yargs(hideBin(argv))
    .option("host", {
      type: "string",
      demandOption: true,
      description: "Server host",
    })
    .option("port", {
      type: "number",
      demandOption: true,
      description: "Server port",
    })
    .option("email", {
      type: "string",
      demandOption: true,
      description: "Microsoft account email",
    })
    .option("password", {
      type: "string",
      description: "Microsoft account password",
    })
    .option("username", {
      type: "string",
      description: "Bot display name",
    })
    .option("debug", {
      type: "boolean",
      default: false,
      description: "Enable debug logging",
    })
    .option("config", {
      type: "string",
      description: "Path to config file",
    })
    .option("ping-only", {
      type: "boolean",
      default: false,
      description: "Ping server only, do not login",
    })
    .option("diagnose", {
      type: "boolean",
      default: false,
      description: "Print connection stage timings",
    })
    .option("trace-packets", {
      type: "boolean",
      default: false,
      description: "Trace all packets sent/received",
    })
    .parseSync() as CliArgs;
}
