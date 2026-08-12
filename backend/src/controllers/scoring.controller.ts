import { Request, Response } from "express";
import pool from "../config/database";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "~openai/gpt-latest";

const buildAiPrompt = (title: string | null, description: string | null, budget: string | null) => {
  const lines = [
    "Rate this Instagram post as a real estate lead on a scale of 1-10 (10 = clear plot/property listing with price and contact info, 1 = generic intro/bio post with no actual listing).",
    "Then provide a single-line summary.",
    "Respond in JSON with { \"score\": <integer>, \"summary\": <string> }."
  ];

  lines.push(`Property title: ${title ?? "N/A"}`);
  lines.push(`Description: ${description ?? "N/A"}`);
  lines.push(`Budget text: ${budget ?? "N/A"}`);

  return lines.join("\n");
};

const requestAiScore = async (title: string | null, description: string | null, budget: string | null) => {
  const prompt = buildAiPrompt(title, description, budget);

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: "user", content: prompt }
      ],
      max_tokens: 200,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${bodyText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Invalid OpenRouter response format");
  }

  const jsonText = content.trim().replace(/^```json\s*/, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(jsonText);
    return {
      score: Math.min(10, Math.max(1, Number(parsed.score) || 0)),
      summary: String(parsed.summary || "No summary provided").slice(0, 240),
    };
  } catch (error) {
    throw new Error(`Failed to parse OpenRouter response: ${error}`);
  }
};

export const scoreProperties = async (req: Request, res: Response) => {
  const { searchRequestId } = req.params;

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({
      success: false,
      message: "Missing OPENROUTER_API_KEY in environment",
    });
  }

  try {
    const properties = await pool.query(
      `SELECT id, property_title, description, budget
       FROM properties
       WHERE search_request_id = $1 AND ai_score IS NULL`,
      [searchRequestId]
    );

    const updatedRows = [];

    for (const property of properties.rows) {
      const { score, summary } = await requestAiScore(
        property.property_title,
        property.description,
        property.budget
      );

      await pool.query(
        `UPDATE properties
         SET ai_score = $1, ai_summary = $2
         WHERE id = $3`,
        [score, summary, property.id]
      );

      updatedRows.push({ id: property.id, score, summary });
    }

    return res.status(200).json({
      success: true,
      message: "AI scoring completed",
      updatedCount: updatedRows.length,
      results: updatedRows,
    });
  } catch (error) {
    console.error("AI scoring error:", error);
    const errText = String(error || "");
    if (errText.includes("OpenRouter API error: 402") || errText.toLowerCase().includes("insufficient credits")) {
      return res.status(402).json({
        success: false,
        message: "AI scoring failed: insufficient OpenRouter credits",
        error: errText,
        remedy: "Add credits at https://openrouter.ai/settings/credits or use a free model/alternative provider",
      });
    }

    return res.status(500).json({
      success: false,
      message: "AI scoring failed",
      error: errText,
    });
  }
};
