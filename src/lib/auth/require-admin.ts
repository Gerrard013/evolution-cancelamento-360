import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/security/session";

export async function requireAdminPage() {
  const session = await getAdminSession();
  if (!session) redirect("/equipe/login");
  return session;
}

export async function requireAdminApi() {
  const session = await getAdminSession();
  if (!session || session.role !== "ADMIN") throw new Response("Unauthorized", { status: 401 });
  return session;
}
