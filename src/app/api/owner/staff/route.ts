import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireOwnerApi } from "@/lib/auth/require-admin";
import { assertTrustedOrigin, readJsonLimited, requestFingerprint } from "@/lib/security/request";
import { hashPassword } from "@/lib/security/password";

const roleSchema = z.enum(["ATTENDANCE", "ANALYST", "FINANCE", "MANAGER", "ADMIN", "AUDITOR"]);
const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  username: z.string().trim().min(3).max(60).regex(/^[A-Za-z0-9._-]+$/),
  password: z.string().min(14).max(200),
  role: roleSchema,
  unit: z.string().trim().max(80).optional().or(z.literal(""))
});
const updateSchema = z.object({
  id: z.string().cuid(),
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(200).optional(),
  role: roleSchema.optional(),
  unit: z.string().trim().max(80).optional().or(z.literal("")),
  password: z.string().min(14).max(200).optional(),
  active: z.boolean().optional()
});
const deleteSchema = z.object({ id: z.string().cuid() });

function safeUser(user: { id:string; name:string; email:string; username:string|null; role:string; unit:string|null; active:boolean; lastLoginAt:Date|null; createdAt:Date }) {
  return { id:user.id, name:user.name, email:user.email, username:user.username, role:user.role, unit:user.unit, active:user.active, lastLoginAt:user.lastLoginAt, createdAt:user.createdAt };
}

export async function GET() {
  try {
    await requireOwnerApi();
    const users = await prisma.user.findMany({ where: { role: { not: "OWNER" } }, orderBy: [{ active: "desc" }, { name: "asc" }] });
    return Response.json({ users: users.map(safeUser) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Não foi possível carregar os acessos." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    const owner = await requireOwnerApi();
    const input = createSchema.parse(await readJsonLimited(req, 12_000));
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        username: input.username.toLowerCase(),
        passwordHash: hashPassword(input.password),
        role: input.role,
        unit: input.unit || null,
        active: true,
        createdBy: owner.sub
      }
    });
    const fp = requestFingerprint(req);
    await prisma.auditEvent.create({ data: { action: "STAFF_ACCESS_CREATED", entity: "User", entityId: user.id, after: { username:user.username, role:user.role, unit:user.unit, by:owner.sub }, ...fp } });
    return Response.json({ user: safeUser(user) }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Confira os dados do usuário." }, { status: 400 });
    return Response.json({ error: "Não foi possível criar o acesso. Verifique se usuário/e-mail já existem." }, { status: 409 });
  }
}

export async function PATCH(req: Request) {
  try {
    assertTrustedOrigin(req);
    const owner = await requireOwnerApi();
    const input = updateSchema.parse(await readJsonLimited(req, 12_000));
    const current = await prisma.user.findUnique({ where: { id: input.id } });
    if (!current || current.role === "OWNER") return Response.json({ error: "Usuário não encontrado." }, { status: 404 });

    const invalidatesSession = input.active !== undefined || input.password !== undefined || input.role !== undefined;
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.email !== undefined) data.email = input.email.toLowerCase();
    if (input.role !== undefined) data.role = input.role;
    if (input.unit !== undefined) data.unit = input.unit || null;
    if (input.password !== undefined) data.passwordHash = hashPassword(input.password);
    if (input.active !== undefined) {
      data.active = input.active;
      data.disabledAt = input.active ? null : new Date();
    }
    if (invalidatesSession) data.sessionVersion = { increment: 1 };

    const user = await prisma.user.update({ where: { id: input.id }, data });
    const fp = requestFingerprint(req);
    await prisma.auditEvent.create({ data: { action: "STAFF_ACCESS_UPDATED", entity: "User", entityId: user.id, before: { role:current.role, active:current.active, unit:current.unit }, after: { role:user.role, active:user.active, unit:user.unit, by:owner.sub }, ...fp } });
    return Response.json({ user: safeUser(user) });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Alteração inválida." }, { status: 400 });
    return Response.json({ error: "Não foi possível alterar o acesso." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    assertTrustedOrigin(req);
    const owner = await requireOwnerApi();
    const input = deleteSchema.parse(await readJsonLimited(req, 4096));
    const current = await prisma.user.findUnique({ where: { id: input.id } });
    if (!current || current.role === "OWNER") return Response.json({ error: "Usuário não encontrado." }, { status: 404 });

    const user = await prisma.user.update({ where: { id: input.id }, data: { active: false, disabledAt: new Date(), sessionVersion: { increment: 1 } } });
    const fp = requestFingerprint(req);
    await prisma.auditEvent.create({ data: { action: "STAFF_ACCESS_REVOKED", entity: "User", entityId: user.id, before: { active: current.active }, after: { active:false, by:owner.sub }, ...fp } });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Usuário inválido." }, { status: 400 });
    return Response.json({ error: "Não foi possível revogar o acesso." }, { status: 500 });
  }
}
