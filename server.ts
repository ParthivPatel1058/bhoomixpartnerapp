import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json());

  // API Routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  /*
   * Dev twin of api/auth-health.ts. Reports whether this origin is in the
   * Supabase project's Redirect URLs allowlist; without it, Google sign-in
   * silently lands on the project's Site URL (the BhoomiX Main app) instead of
   * coming back here. Runs server-side because CORS hides the 302's Location
   * header from the browser.
   */
  app.get("/api/auth-health", async (req, res) => {
    const supabaseUrl =
      process.env.VITE_SUPABASE_URL ?? "https://tzmuivqtlnosgkubhyft.supabase.co";
    const origin = (req.query.origin as string) ?? `http://localhost:${PORT}`;

    const originOf = (url: string | null) => {
      if (!url) return null;
      try {
        return new URL(url).origin;
      } catch {
        return null;
      }
    };

    try {
      const started = await fetch(
        `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(`${origin}/`)}`,
        { redirect: "manual" },
      );
      const location = started.headers.get("location");
      const state = location ? new URL(location).searchParams.get("state") : null;
      if (!state) return res.json({ origin, googleRedirectOk: null, landedOn: null, fix: null });

      // Replay the callback as a DENIED consent — creates no account or session.
      const finished = await fetch(
        `${supabaseUrl}/auth/v1/callback?error=access_denied&error_description=probe&state=${state}`,
        {
          redirect: "manual",
          headers: started.headers.get("set-cookie")
            ? { cookie: started.headers.get("set-cookie") as string }
            : undefined,
        },
      );

      const landedOn = originOf(finished.headers.get("location"));
      const ok = landedOn === originOf(origin);
      res.json({
        origin,
        googleRedirectOk: ok,
        landedOn,
        fix: ok
          ? null
          : `Add ${origin}/** to Supabase -> Authentication -> URL Configuration -> Redirect URLs`,
      });
    } catch (error) {
      console.error("auth-health probe failed:", error);
      res.json({ origin, googleRedirectOk: null, landedOn: null, fix: null });
    }
  });

  app.post("/api/ai-advice", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.json({
          advice: "Peak delivery hours are between 5 PM and 8 PM in Market Yard and Bandra West. Maintain high speed and great customer ratings to unlock bonus multipliers!"
        });
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: 'Give a 2-sentence motivating and practical tip for an on-demand delivery partner in Mumbai (BhoomiX Partner) looking to maximize earnings and maintain high ratings during peak hours.',
      });

      res.json({ advice: response.text || "Focus on high-demand zones like Market Yard during peak evening hours for maximum surge multipliers." });
    } catch (error) {
      console.error("AI error:", error);
      res.json({
        advice: "Peak delivery hours are between 5 PM and 8 PM in Market Yard and Bandra West. Maintain high speed and great customer ratings to unlock bonus multipliers!"
      });
    }
  });

  // Vite middleware for development or static serving for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
