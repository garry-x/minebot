import axios, { AxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';

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
 * Configuration for Microsoft OAuth client
 */
export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Microsoft OAuth authentication class for Xbox Live authentication flow
 */
export class MicrosoftOAuth {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private stateStore: Map<string, number>; // In production, use Redis or database

  constructor(clientId: string, clientSecret: string, redirectUri: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.stateStore = new Map<string, number>();
  }

  /**
   * Generate OAuth authorization URL with state parameter
   * @returns Authorization URL for Microsoft login
   */
  getAuthUrl(): string {
    const state: string = uuidv4();
    // Store state for validation (expire after 10 minutes)
    this.stateStore.set(state, Date.now() + 10 * 60 * 1000);

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: 'XboxLive.signin XboxLive.offline_access',
      state: state
    });

    return `https://login.live.com/oauth20_authorize.srf?${params.toString()}`;
  }

  /**
   * Validate if a state parameter is valid and not expired
   * @param state - State parameter to validate
   * @returns True if state is valid, false otherwise
   */
  async validateState(state: string): Promise<boolean> {
    const expiry = this.stateStore.get(state);
    if (!expiry) return false;

    const now = Date.now();
    if (now > expiry) {
      this.stateStore.delete(state);
      return false;
    }
    return true;
  }

  /**
   * Consume a state parameter (validate and remove if valid)
   * @param state - State parameter to consume
   * @returns True if state was valid and consumed, false otherwise
   */
  async consumeState(state: string): Promise<boolean> {
    const valid = await this.validateState(state);
    if (valid) {
      this.stateStore.delete(state);
      return true;
    }
    return false;
  }

  /**
   * Exchange authorization code for access token
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
          redirect_uri: this.redirectUri
        })
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      throw new Error(`Xbox Live auth failed: ${axiosError.message}`);
    }
  }
}

export default MicrosoftOAuth;