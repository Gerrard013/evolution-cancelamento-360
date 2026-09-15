import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireOwnerApi } from "@/lib/auth/require-admin";
import { assertTrustedOrigin, readJsonLimited, requestFingerprint } from "@/lib/security/request";
import { hashPassword } from "@/lib/security/password";

const staffRole = z.enum(["ADMIN","MANAGER","FINANCE","ANALYST","ATTENDANCE","AUDITOR"]);
const createSchema = z.object({
  name:z.string().trim().min(2).max(120),
  username:z.string().trim().toLowerCase().min(2).max(80).regex(/^[a-z0-9._-]+$/),
  email:z.string().trim().toLowerCase().email().max(200),
  password:z.string().min(14).max(200),
  role:staffRole,
  unit:z.string().trim().max(80).optional().or(z.literal(""))
});
const patchSchema = z.object({
  userId:z.string().cuid(),
  active:z.boolean().optional(),
  role:staffRole.optional(),
  unit:z.string().trim().max(80).nullable().optional(),
  password:z.string().min(14).max(200).optional()
}).refine(v=>v.active!==undefined||v.role!==undefined||v.unit!==undefined||v.password!==undefined,{message:"Nenhuma alteração informada"});

export async function GET() {
  try {
    await requireOwnerApi();
    const users=await prisma.user.findMany({orderBy:[{role:"asc"},{name:"asc"}],select:{id:true,name:true,username:true,email:true,role:true,unit:true,active:true,lastLoginAt:true,createdAt:true,createdBy:true}});
    return Response.json({users});
  } catch(error){if(error instanceof Response)return error;return Response.json({error:"Não foi possível listar acessos."},{status:500});}
}

export async function POST(req:Request){
  try{
    assertTrustedOrigin(req);
    const owner=await requireOwnerApi();
    const input=createSchema.parse(await readJsonLimited(req,16_384));
    const exists=await prisma.user.findFirst({where:{OR:[{username:input.username},{email:input.email}]}});
    if(exists)return Response.json({error:"Usuário ou e-mail já cadastrado."},{status:409});
    const fingerprint=requestFingerprint(req);
    const created=await prisma.$transaction(async tx=>{
      const user=await tx.user.create({data:{name:input.name,username:input.username,email:input.email,passwordHash:hashPassword(input.password),role:input.role,unit:input.unit||null,active:true,createdBy:owner.sub}});
      await tx.auditEvent.create({data:{action:"OWNER_USER_CREATED",entity:"User",entityId:user.id,after:{by:owner.sub,username:user.username,role:user.role,unit:user.unit},...fingerprint}});
      return user;
    });
    return Response.json({id:created.id,name:created.name,username:created.username,role:created.role,active:created.active},{status:201});
  }catch(error){if(error instanceof Response)return error;if(error instanceof z.ZodError)return Response.json({error:"Confira os dados do novo acesso."},{status:400});return Response.json({error:"Não foi possível criar o acesso."},{status:500});}
}

export async function PATCH(req:Request){
  try{
    assertTrustedOrigin(req);
    const owner=await requireOwnerApi();
    const input=patchSchema.parse(await readJsonLimited(req,16_384));
    const target=await prisma.user.findUnique({where:{id:input.userId}});
    if(!target)return Response.json({error:"Usuário não encontrado."},{status:404});
    if(target.role==="OWNER")return Response.json({error:"O acesso proprietário não pode ser removido ou rebaixado por esta tela."},{status:409});
    const before={active:target.active,role:target.role,unit:target.unit};
    const fingerprint=requestFingerprint(req);
    const updated=await prisma.$transaction(async tx=>{
      const user=await tx.user.update({where:{id:target.id},data:{
        active:input.active,
        role:input.role,
        unit:input.unit===undefined?undefined:(input.unit||null),
        passwordHash:input.password?hashPassword(input.password):undefined
      }});
      await tx.auditEvent.create({data:{action:input.active===false?"OWNER_ACCESS_REVOKED":"OWNER_USER_UPDATED",entity:"User",entityId:user.id,before,after:{by:owner.sub,active:user.active,role:user.role,unit:user.unit,passwordReset:Boolean(input.password)},...fingerprint}});
      return user;
    });
    return Response.json({id:updated.id,name:updated.name,username:updated.username,role:updated.role,active:updated.active,unit:updated.unit});
  }catch(error){if(error instanceof Response)return error;if(error instanceof z.ZodError)return Response.json({error:"Alteração inválida."},{status:400});return Response.json({error:"Não foi possível alterar o acesso."},{status:500});}
}
