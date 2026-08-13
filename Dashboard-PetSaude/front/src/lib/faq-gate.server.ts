import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

export type GateSession = { unlocked?: boolean; name?: string };

function sessionConfig() {
  const password = process.env.SESSION_SECRET || "fallback_default_secret_that_must_be_at_least_32_chars_123456789";
  return {
    password,
    name: "faq-gate",
    maxAge: 60 * 60 * 8,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

export function gateSession() {
  return useSession<GateSession>(sessionConfig());
}

export function passwordMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export async function requireUnlocked(): Promise<string> {
  const session = await gateSession();
  const name = session.data.name?.trim();
  if (!session.data.unlocked || !name) {
    throw new Error("Sessão não autorizada. Identifique-se novamente.");
  }
  return name;
}
