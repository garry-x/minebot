import { Authflow, Titles } from "prismarine-auth";
import crypto from "crypto";
import { getLogger } from "../utils/logger.js";

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface BedrockAuthResult {
  chain: string[];
  token: string;
}

export class AuthManager {
  private authflow: Authflow;

  constructor(credentials: AuthCredentials) {
    this.authflow = new Authflow(credentials.email, undefined, {
      flow: "live",
      authTitle: Titles.MinecraftNintendoSwitch,
      password: credentials.password,
    });
  }

  async authenticate(): Promise<BedrockAuthResult> {
    const logger = getLogger();
    logger.info("Authenticating with Microsoft...");
    try {
      const { publicKey } = crypto.generateKeyPairSync("ec", {
        namedCurve: "secp384r1",
      });
      const publicKeyBase64 = publicKey
        .export({ type: "spki", format: "der" })
        .toString("base64");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const token = await (this.authflow as any).getMinecraftBedrockToken(publicKeyBase64);
      logger.info("Authentication successful");
      return {
        chain: token.chain,
        token: token.token,
      };
    } catch (err) {
      logger.error({ err }, "Authentication failed");
      throw err;
    }
  }
}
