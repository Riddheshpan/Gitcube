# gitCube AI Proxy Worker

This directory contains a Cloudflare Worker script that acts as a proxy for the Hugging Face AI features (PR Summaries and Pipeline Log Analysis).

By hosting this worker on Cloudflare, you can securely keep your `HF_TOKEN` hidden from the standalone React Native app, without having to run a full Node.js backend.

## Deployment Instructions

1. **Install Wrangler** (the Cloudflare Workers CLI):
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare**:
   ```bash
   npx wrangler login
   ```

3. **Deploy the Worker** (this will give you a public `*.workers.dev` URL):
   ```bash
   npx wrangler deploy
   ```

4. **Set your Hugging Face Token as a Secret**:
   ```bash
   npx wrangler secret put HF_TOKEN
   ```
   *Paste your Hugging Face token when prompted.*

## Connecting the App

Once deployed, copy the `*.workers.dev` URL provided in your terminal.
Open `Client/src/constants/api.ts` in your app code and paste it as the `AI_PROXY_URL`:

```typescript
export const AI_PROXY_URL = "https://gitcube-ai-proxy.<your-cloudflare-subdomain>.workers.dev";
```

Now, the app will securely use this worker for AI features!
