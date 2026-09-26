import OpenAI from "openai";
import { z } from "zod";
import { authenticated } from "@/lib/server";
import { createLearningReport } from "@/lib/ai";
import { Attempt } from "@/lib/types";
export const maxDuration = 60;
export async function POST(request: Request) {
  let auth;
  try {
    auth = await authenticated(request);
  } catch {
    return Response.json(
      { error: "Sign in to generate a report." },
      { status: 401 },
    );
  }
  const { db } = auth;
  try {
    const input = z.object({ sessionId: z.uuid() }).parse(await request.json());
    const { data: session, error: se } = await db
      .from("mcat_sessions")
      .select("*")
      .eq("id", input.sessionId)
      .single();
    if (se || !session?.completed_at)
      return Response.json(
        { error: "Finish your session first." },
        { status: 400 },
      );
    const { data: saved } = await db
      .from("mcat_reports")
      .select("report")
      .eq("session_id", input.sessionId)
      .maybeSingle();
    if (saved) return Response.json({ report: saved.report });
    if (!process.env.OPENAI_API_KEY)
      return Response.json(
        { error: "AI is not configured yet. Your statistics are still saved." },
        { status: 503 },
      );
    const history: Attempt[] = [];
    for (let offset = 0; offset < 100000; offset += 1000) {
      const { data, error } = await db
        .from("mcat_attempts")
        .select("*")
        .lte("created_at", session.completed_at)
        .order("created_at")
        .order("id")
        .range(offset, offset + 999);
      if (error) throw error;
      history.push(...(data as Attempt[]));
      if (data.length < 1000) break;
    }
    const current = history.filter((a) => a.session_id === input.sessionId);
    if (!current.length)
      return Response.json(
        { error: "Answer at least one question to get a report." },
        { status: 400 },
      );
    const { data: claimed, error: ce } = await db.rpc("mcat_claim_report", {
      p_session: input.sessionId,
    });
    if (ce) throw ce;
    if (!claimed)
      return Response.json(
        {
          error:
            "A report is already processing, or the retry/daily allowance was reached. Wait two minutes before retrying. Your statistics are saved.",
        },
        { status: 429 },
      );
    const report = await createLearningReport(current, history);
    const { error } = await db.rpc("mcat_save_report", {
      p_session: input.sessionId,
      p_report: report,
    });
    if (error) throw error;
    return Response.json({ report });
  } catch (e) {
    console.error(
      "Report generation failed:",
      e instanceof OpenAI.APIError
        ? `provider status ${e.status}`
        : e instanceof z.ZodError
          ? "invalid input"
          : "processing error",
    );
    return Response.json(
      {
        error:
          "The AI report could not be completed. Your answers and statistics are saved. Retry in two minutes.",
      },
      { status: 503 },
    );
  }
}
