# Evolution Cancelamento 360 — v7 Final Ruy

Canal digital de cancelamento da **Evolution Academia** para Condor e Umarizal, integrado ao **EVO/W12**.

## Arquitetura aprovada

**EVO/W12 é a fonte oficial** de aluno, e-mail, contrato, plano, situação financeira e cancelamento do contrato. O **Cancelamento 360** registra somente o fluxo que a API do EVO não oferece: validação de identidade, aceite/ciência LGPD, motivo, PIX, termo, assinatura, protocolo, auditoria e acompanhamento de estorno.

O suporte EVO informou que a API documentada **não oferece** criação de protocolo administrativo, PDF, campos personalizados, dashboard ou relatório nativo alimentado pelo 360. Por isso o painel do 360 é operacional; o resultado oficial do cancelamento é refletido no EVO pela operação de cancelamento do contrato.

## Fluxo do cliente

1. Acessa o link **Cancelar plano** no site oficial da academia.
2. Informa **CPF + o mesmo e-mail cadastrado no EVO/W12**.
3. Aceita a ciência/autorização de tratamento de dados para este fluxo.
4. O backend consulta o EVO pelo CPF e compara o e-mail informado com o e-mail oficial retornado.
5. O sistema envia um **código OTP de 6 dígitos** ao e-mail cadastrado, via SMTP do domínio da academia.
6. Somente após o código correto o cliente vê seus contratos ativos.
7. O sistema consulta contrato, plano e situação financeira no EVO.
8. Cliente informa motivo e data; o 360 apresenta as condições e valores.
9. Para o termo oficial, informa RG, endereço e, quando houver estorno, PIX. O CPF já vem da identidade validada no EVO.
10. O 360 gera o termo conforme os modelos oficiais, cria protocolo e registra a trilha de auditoria.
11. Cliente assina e envia o termo pelo próprio portal.
12. A equipe autorizada conclui o cancelamento; a escrita no EVO só é habilitada após homologação segura do endpoint/payload.
13. O cliente recebe confirmação do protocolo pelo e-mail oficial.

## Segurança e controle do Ruy

- Ruy usa o perfil **OWNER**.
- Apenas OWNER pode criar, reativar ou revogar acessos da equipe.
- O perfil proprietário não pode ser removido pela própria tela de gestão.
- CPF, RG, e-mail e IDs externos necessários ao fluxo são cifrados/pseudonimizados no banco.
- O código OTP nunca é salvo em texto puro; somente HMAC.
- Tokens EVO, senha SMTP, chaves de criptografia e peppers ficam somente nas Variables do Railway.
- Cookies de sessão são HTTP-only, SameSite Strict e Secure em produção.
- Endpoints públicos têm rate limiting e validação de origem.
- Ações relevantes geram eventos de auditoria.
- Escrita destrutiva no EVO é **fail-closed**: sem homologação e flags explícitas, o sistema não cancela contrato automaticamente.

## Termos oficiais

Os modelos originais ficam em `docs/templates-original/`.

### Plano anual

O termo mantém as cláusulas 21, 22 e 23 fornecidas pela academia. A memória de cálculo usa:

- valor mensal = valor total do plano ÷ 12;
- meses restantes = 12 − meses utilizados;
- saldo restante = valor mensal × meses restantes;
- desconto de antecipação = **14,4% do valor total**;
- multa/taxa = **10% do valor total**;
- estorno = `máximo(0, saldo restante − 14,4% − 10%)`.

Quando houver estorno, o termo registra PIX e o prazo operacional informado pela academia de **até 60 dias úteis**. O sistema não apresenta esse prazo como “lei” porque o documento fornecido não cita base legal específica.

### Plano anual recorrente

- termo próprio da academia;
- multa de **R$ 258,00** conforme documento fornecido;
- observação de solicitação com 30 dias de antecedência da próxima mensalidade;
- não há estorno no fluxo recorrente atual.

## EVO/W12 — confirmado pelo suporte

- autenticação: **Basic Auth** (DNS/usuário + token);
- busca de membro: `GET /api/v1/members`, com suporte informado para CPF/e-mail;
- contrato: entidade `MemberMembership`;
- resumo: `get-summary-of-membermemberships-by-id`;
- financeiro: entidade `Invoices`;
- cancelamento: `POST /cancel-membermembership`;
- webhooks: API Pro.

### Importante

O suporte ainda não forneceu nesta conversa a especificação completa de **query params/body** dos endpoints acima. Por isso os paths e payloads são configuráveis por environment variables e `npm run production:check` bloqueia produção até os parâmetros críticos serem preenchidos e a escrita ter sido homologada.

Nunca cole o token EVO ou a senha SMTP em issue, PR, código ou chat. Coloque-os diretamente no Railway.

## Domínio e SMTP

Recomendado:

- `https://cancelamento.dominio-da-academia.com.br` → aplicação 360;
- `cancelamento@dominio-da-academia.com.br` → comunicação oficial;
- SPF, DKIM e DMARC configurados no DNS;
- site oficial da academia inclui o botão/link **Cancelar plano** para o subdomínio.

## Produção

Copie `.env.example` para a configuração de ambiente e preencha somente no Railway. Antes de ativar escrita EVO:

```bash
npm run security:check
npm run business:check
npm run production:check
npm run typecheck
npm run build
```

`production:check` exige domínio HTTPS, SMTP, OWNER, CPF/EVO, invoices, payload de cancelamento e homologação explícita antes do modo destrutivo.

## Estado de implantação

Código v7: pronto para validação técnica e CI.

Produção: depende de 4 itens externos da academia/EVO: **domínio/subdomínio**, **SMTP**, **credencial EVO criada pelo Ruy** e **especificação/homologação dos parâmetros exatos de Invoices e cancel-membermembership**.
