# Runbook final — Evolution Cancelamento 360 v7

## 1. O que está pronto no código

- CPF validado e pesquisado no EVO/W12.
- E-mail informado deve ser igual ao e-mail retornado pelo EVO.
- OTP de 6 dígitos, uso único, expiração e limite de tentativas.
- SMTP do domínio da academia.
- registro de ciência/autorização LGPD com versão e data/hora.
- seleção de contrato ativo após identidade confirmada.
- consulta financeira configurável via entidade Invoices.
- bloqueio de cancelamento por débito aberto quando a consulta financeira está configurada.
- termo anual e anual recorrente baseado nos documentos oficiais fornecidos.
- RG, endereço, motivo, matrícula, plano e PIX no termo quando aplicável.
- upload do termo assinado com validação de tipo/tamanho e trilha de auditoria.
- protocolo por e-mail.
- prazo operacional de estorno de até 60 dias úteis registrado no 360.
- cancelamento no EVO protegido por flags de homologação.
- Ruy como OWNER, com criação/revogação de acessos e revogação válida na próxima requisição.
- painel 360 com separação clara entre EVO (base oficial) e fluxo operacional.

## 2. O que NÃO deve ser prometido ao Ruy

A API documentada do EVO não permite ao 360 criar, dentro da interface do EVO:

- protocolo administrativo;
- motivo/status customizado;
- anexo do PDF;
- campo personalizado;
- dashboard customizado;
- relatório nativo alimentado pelo 360.

O EVO continua mostrando o cadastro/contrato/financeiro e o resultado oficial do cancelamento. O painel 360 controla as etapas administrativas que o EVO não expõe por API.

## 3. Quatro itens externos obrigatórios antes do go-live

### A. Domínio

Escolher o subdomínio, por exemplo:

`cancelamento.dominio-da-academia.com.br`

Criar o DNS apontando para Railway e configurar Custom Domain no serviço.

O desenvolvedor do site oficial adiciona o link **Cancelar plano** apontando para esse subdomínio.

### B. SMTP do domínio

Criar a caixa/remetente, por exemplo:

`cancelamento@dominio-da-academia.com.br`

No DNS, configurar SPF, DKIM e DMARC de acordo com o provedor escolhido. Preencher as variáveis SMTP diretamente no Railway. Não enviar senha SMTP por chat, issue ou commit.

### C. Credencial EVO do Ruy

Ruy gera a integração/token na própria conta EVO. Preencher no Railway:

- `EVO_API_USERNAME` = DNS/usuário informado pelo EVO;
- `EVO_API_TOKEN` = token;
- `EVO_AUTH_MODE=basic`.

O token não vai para frontend, GitHub ou PDF.

### D. Especificação exata dos endpoints críticos

Antes de produção, obter da documentação da conta EVO os valores exatos de:

1. consulta de membro por CPF;
2. resumo de contratos por membro;
3. Invoices/faturas de um membro/contrato;
4. `POST cancel-membermembership`, incluindo body obrigatório e resposta de sucesso.

Copiar esses formatos para as variáveis `EVO_*_PATH` e `EVO_CANCEL_BODY_TEMPLATE`.

## 4. Fases da integração EVO

### Fase 1 — leitura

Usar:

`EVO_INTEGRATION_MODE=read`

`EVO_WRITE_ENABLED=false`

Testar com conta controlada:

- CPF localiza a pessoa correta;
- e-mail retornado é o correto;
- contrato correto aparece;
- unidade/plano/data estão corretos;
- invoices abertas/pagas são interpretadas corretamente.

### Fase 2 — homologação da escrita

Somente em ambiente/conta segura confirmada pelo EVO. Validar request e response do cancelamento sem afetar cliente real.

Após sucesso documentado:

`EVO_INTEGRATION_MODE=write`

`EVO_WRITE_ENABLED=true`

`EVO_WRITE_HOMOLOGATED=true`

Não ative `CUSTOMER_DIRECT_CANCELLATION=true` no primeiro dia. Deixe a equipe concluir pelo painel até estabilizar.

## 5. Perfis

- `OWNER`: Ruy — controle máximo e gestão de acessos.
- `ADMIN`: operação administrativa completa.
- `MANAGER`, `FINANCE`, `ANALYST`, `ATTENDANCE`, `AUDITOR`: visualização conforme papel; ações destrutivas permanecem protegidas.

Se Ruy clicar em **Revogar**, o usuário deixa de ser aceito na próxima requisição, mesmo que ainda possua cookie de sessão.

## 6. Variáveis e segredos

Use `.env.example` como contrato de configuração. Em produção, rode:

```bash
npm run production:check
```

Ele bloqueia a implantação se faltar domínio HTTPS, SMTP, OWNER, credencial EVO, consulta de invoices, payload de cancelamento ou homologação da escrita.

## 7. Validação antes de liberar ao site oficial

Execute:

```bash
npm install
npm run security:check
npm run business:check
npm run typecheck
npm run build
npm run production:check
```

Depois faça um teste ponta a ponta:

1. CPF real de teste.
2. e-mail real cadastrado no EVO.
3. recebimento do OTP.
4. código errado deve falhar.
5. código expirado deve falhar.
6. contrato de teste deve aparecer corretamente.
7. débito aberto deve bloquear quando a regra exigir.
8. termo deve conter dados e cláusulas corretos.
9. upload assinado deve gerar protocolo.
10. Ruy deve conseguir ver o processo no 360.
11. Ruy deve conseguir revogar um usuário e confirmar que o acesso cai.
12. somente depois da homologação, validar o POST de cancelamento no EVO.

## 8. Observação sobre o prazo de 60 dias úteis

O sistema reproduz o prazo operacional que consta no termo anual fornecido. Ele não deve ser apresentado como obrigação legal genérica sem base jurídica indicada pela academia/jurídico. A contagem automática atual considera segunda a sexta; feriados não estão embutidos. Se a academia quiser prazo com calendário oficial de feriados, deve ser adicionada fonte/calendário aprovado antes de usar a data estimada como prazo jurídico.
