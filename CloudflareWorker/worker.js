/**
 * gitCube Cloudflare Worker AI Proxy
 *
 * Uses Cloudflare Workers AI to run Llama 3.1 8B NATIVELY on Cloudflare's network.
 * This completely avoids the 530/1016 DNS error that occurs when trying to reach
 * external APIs (like Hugging Face) from Cloudflare Workers.
 *
 * To deploy:
 * 1. Ensure you have Wrangler installed: npm install -g wrangler
 * 2. Login to Cloudflare: wrangler login
 * 3. Deploy: npx wrangler deploy
 *    (No HF_TOKEN needed — Cloudflare AI is built-in and free!)
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Llama 3.3 70B — the latest active Cloudflare Workers AI model (fast fp8 quantized)
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
    }

    // Verify AI binding is available
    if (!env.AI) {
      return new Response(
        JSON.stringify({ error: "AI binding not configured. Run `npx wrangler deploy` with the [ai] binding in wrangler.toml." }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    try {
      const url = new URL(request.url);
      const data = await request.json();

      let systemPrompt = "";
      let userPrompt = "";

      // Route based on URL path
      if (url.pathname === "/summarize") {
        systemPrompt =
          "You are an AI code reviewer. Summarize the code changes in the provided git diff in a clear, concise bulleted list. " +
          "Highlight key changes, modifications, and any potential issues. Keep it brief and easy to read on a mobile screen. " +
          "Do not return any extra conversational filler.";

        const diffText = data.diffText || "";
        const maxChars = 6000;
        const truncatedDiff =
          diffText.length > maxChars
            ? diffText.substring(0, maxChars) + "\n\n[Diff truncated for brevity...]"
            : diffText;
        userPrompt = `Here is the git diff:\n\n${truncatedDiff}`;

      } else if (url.pathname === "/analyze") {
        systemPrompt =
          "You are an expert DevOps assistant. Analyze the provided failed build/CI pipeline logs. " +
          "Briefly explain in simple terms why the build failed, then suggest 2-3 specific, actionable steps to fix it. " +
          "Keep the response concise and easy to read on a mobile screen.";

        const logText = data.logText || "";
        const maxChars = 6000;
        // Take the LAST part of the log since errors appear at the end
        const truncatedLogs =
          logText.length > maxChars ? logText.substring(logText.length - maxChars) : logText;
        userPrompt = `Here are the CI/CD build logs:\n\n${truncatedLogs}`;

      } else {
        return new Response("Not found", { status: 404, headers: CORS_HEADERS });
      }

      // Run the model natively on Cloudflare's AI infrastructure
      const aiResponse = await env.AI.run(MODEL, {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 800,
      });

      // Cloudflare AI returns { response: "..." }
      const aiResult = aiResponse?.response || "No analysis generated.";

      return new Response(JSON.stringify({ result: aiResult }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });

    } catch (err) {
      console.error("Worker error:", err);
      return new Response(
        JSON.stringify({ error: `Worker error: ${err.message}` }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }
  },
};
