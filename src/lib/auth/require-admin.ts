import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/security/session";
import { prisma } from "@/lib/db/prisma";

const STAFF_ROLES = new Set(["OWNER", "ADMIN", "MANAGER", "FINANCE", "ANALYST", "ATTENDANCE", "AUDITOR"]);
const ADMIN_ROLES = new Set(["OWNER", "ADMIN"]);

async function activeStaffSession() {
  const session = await getAdminSession();
  if (!session) return null;
  const user = await prisma.user.findFirst({ where: { username: session.sub, active: true }, select: { role: true } }).catch(() => null);
  if (!user || !STAFF_ROLES.has(user.role)) return null;
  return { ...session, role: user.role };
}

export async function requireAdminPage() {
  const session = await activeStaffSession();
  if (!session) redirect("/equipe/login");
  return session;
}

export async function requireAdminApi() {
  const session = await activeStaffSession();
  if (!session || !session.role || !ADMIN_ROLES.has(session.role)) throw new Response("Unauthorized", { status: 401 });
  return session;
}

export async function requireOwnerApi() {
  const session = await activeStaffSession();
  if (!session || session.role !== "OWNER") throw new Response("Forbidden", { status: 403 });
  return session;
}
