const axios = require('axios');

class XboxLiveAuth {
  constructor(clientId, clientSecret) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  async getAuthToken(authorizationCode) {
    try {
      const response = await axios.post('https://login.live.com/oauth20_token.srf', 
        new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code: authorizationCode,
          grant_type: 'authorization_code',
          redirect_uri: 'http://localhost:9000/auth/callback'
        }));
      return response.data;
    } catch (error) {
      throw new Error(`Xbox Live auth failed: ${error.message}`);
    }
  }

  async getXSTSToken(userToken) {
    try {
      const response = await axios.post('https://xsts.auth.xboxlive.com/xsts/authorize', 
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
        });
      return response.data;
    } catch (error) {
      throw new Error(`XSTS token failed: ${error.message}`);
    }
  }

  async getMinecraftToken(xstsToken) {
    try {
      const response = await axios.post('https://api.minecraftservices.com/authentication/login_with_xbox', 
        {
          identityToken: `XBL3.0 x=${xstsToken.DisplayClaims.xui[0].uhs};${xstsToken.Token}`
        });
      return response.data;
    } catch (error) {
      throw new Error(`Minecraft token failed: ${error.message}`);
    }
  }
}

module.exports = XboxLiveAuth;