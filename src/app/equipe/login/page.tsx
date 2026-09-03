import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/security/session";
import LoginForm from "./LoginForm";

export default async function EquipeLoginPage() {
  if (await getAdminSession()) redirect("/equipe");
  return <main className="portal-page admin-login-page"><div className="portal-bg" /><LoginForm /></main>;
}
