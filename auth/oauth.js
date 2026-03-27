const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class MicrosoftOAuth {
  constructor(clientId, clientSecret, redirectUri) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.stateStore = new Map(); // In production, use Redis or database
  }

  getAuthUrl() {
    const state = uuidv4();
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

  async validateState(state) {
    const expiry = this.stateStore.get(state);
    if (!expiry) return false;
    
    const now = Date.now();
    if (now > expiry) {
      this.stateStore.delete(state);
      return false;
    }
    return true;
  }

  async consumeState(state) {
    const valid = await this.validateState(state);
    if (valid) {
      this.stateStore.delete(state);
      return true;
    }
    return false;
  }

  async getAuthToken(authorizationCode) {
    try {
      const response = await axios.post('https://login.live.com/oauth20_token.srf', 
        new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code: authorizationCode,
          grant_type: 'authorization_code',
          redirect_uri: this.redirectUri
        }));
      return response.data;
    } catch (error) {
      throw new Error(`Xbox Live auth failed: ${error.message}`);
    }
  }
}

module.exports = MicrosoftOAuth;