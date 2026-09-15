import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { getAdminSession, type SessionPayload } from "@/lib/security/session";

const OPERATIONAL_ROLES = new Set(["OWNER", "ADMIN", "MANAGER", "FINANCE", "ANALYST", "ATTENDANCE", "AUDITOR"]);

async function validateStaffSession(session: SessionPayload | null) {
  if (!session || !session.role || !OPERATIONAL_ROLES.has(session.role)) return null;

  if (session.role === "OWNER" && session.sub.startsWith("owner:")) return session;

  if (!session.sub.startsWith("user:")) return null;
  const id = session.sub.slice(5);
  if (!id || typeof session.sv !== "number") return null;

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, active: true, role: true, sessionVersion: true, username: true, name: true } });
  if (!user || !user.active || user.sessionVersion !== session.sv || user.role !== session.role) return null;
  return session;
}

export async function requireAdminPage() {
  const session = await validateStaffSession(await getAdminSession());
  if (!session) redirect("/equipe/login");
  return session;
}

export async function requireAdminApi() {
  const session = await validateStaffSession(await getAdminSession());
  if (!session || !["OWNER", "ADMIN", "MANAGER", "FINANCE"].includes(session.role || "")) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return session;
}

export async function requireOwnerPage() {
  const session = await validateStaffSession(await getAdminSession());
  if (!session || session.role !== "OWNER") redirect("/equipe");
  return session;
}

export async function requireOwnerApi() {
  const session = await validateStaffSession(await getAdminSession());
  if (!session || session.role !== "OWNER") throw new Response("Forbidden", { status: 403 });
  return session;
}
