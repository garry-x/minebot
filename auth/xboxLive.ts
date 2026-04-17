import axios, { AxiosError } from 'axios';

/**
 * OAuth token response from Microsoft login endpoint
 */
export interface OAuthTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

/**
 * XSTS token response from Xbox Live XSTS endpoint
 */
export interface XSTSResponse {
  Token: string;
  DisplayClaims: {
    xui: Array<{
      uhs: string;
    }>;
  };
}

/**
 * Minecraft token response from Minecraft services
 */
export interface MinecraftTokenResponse {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
}

/**
 * Xbox Live authentication class for Minecraft authentication flow
 */
export class XboxLiveAuth {
  private clientId: string;
  private clientSecret: string;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  /**
   * Exchange authorization code for OAuth access token
   * @param authorizationCode - Authorization code from OAuth callback
   * @returns OAuth token response
   */
  async getAuthToken(authorizationCode: string): Promise<OAuthTokenResponse> {
    try {
      const response = await axios.post<OAuthTokenResponse>(
        'https://login.live.com/oauth20_token.srf',
        new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code: authorizationCode,
          grant_type: 'authorization_code',
          redirect_uri: 'http://localhost:9000/auth/callback'
        })
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      throw new Error(`Xbox Live auth failed: ${axiosError.message}`);
    }
  }

  /**
   * Exchange user token for XSTS token
   * @param userToken - User token from OAuth flow
   * @returns XSTS response with token and display claims
   */
  async getXSTSToken(userToken: string): Promise<XSTSResponse> {
    try {
      const response = await axios.post<XSTSResponse>(
        'https://xsts.auth.xboxlive.com/xsts/authorize',
        {
          Properties: {
            SandboxId: 'RETAIL',
            UserTokens: [userToken]
          },
          RelyingParty: 'rp://api.minecraftservices.com/',
          TokenType: 'JWT'
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      throw new Error(`XSTS token failed: ${axiosError.message}`);
    }
  }

  /**
   * Exchange XSTS token for Minecraft access token
   * @param xstsToken - XSTS token from getXSTSToken
   * @returns Minecraft token response
   */
  async getMinecraftToken(xstsToken: XSTSResponse): Promise<MinecraftTokenResponse> {
    try {
      const response = await axios.post<MinecraftTokenResponse>(
        'https://api.minecraftservices.com/authentication/login_with_xbox',
        {
          identityToken: `XBL3.0 x=${xstsToken.DisplayClaims.xui[0].uhs};${xstsToken.Token}`
        }
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      throw new Error(`Minecraft token failed: ${axiosError.message}`);
    }
  }
}

export default XboxLiveAuth;