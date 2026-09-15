import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/security/session";

const STAFF_ROLES = new Set(["OWNER", "ADMIN", "MANAGER", "FINANCE", "ANALYST", "ATTENDANCE", "AUDITOR"]);
const ADMIN_ROLES = new Set(["OWNER", "ADMIN"]);

export async function requireAdminPage() {
  const session = await getAdminSession();
  if (!session || !session.role || !STAFF_ROLES.has(session.role)) redirect("/equipe/login");
  return session;
}

export async function requireAdminApi() {
  const session = await getAdminSession();
  if (!session || !session.role || !ADMIN_ROLES.has(session.role)) throw new Response("Unauthorized", { status: 401 });
  return session;
}

export async function requireOwnerApi() {
  const session = await getAdminSession();
  if (!session || session.role !== "OWNER") throw new Response("Forbidden", { status: 403 });
  return session;
}
