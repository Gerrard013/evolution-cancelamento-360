import { cookies } from "next/headers";
import { ADMIN_COOKIE } from "@/lib/security/session";
import { assertTrustedOrigin } from "@/lib/security/request";

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    const jar = await cookies();
    jar.set(ADMIN_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Falha ao sair" }, { status: 500 });
  }
}
