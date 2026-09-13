# Prompt mestre — Evolution Cancelamento 360

Você é um engenheiro de software sênior responsável por finalizar o **Evolution Cancelamento 360** para uso real da Evolution Academia nas unidades **Condor** e **Umarizal**.

## Objetivo central
Automatizar o fluxo de cancelamento de contratos, reduzir e-mails e planilhas, gerar protocolo e termo, receber o termo assinado, apresentar **prévia de estorno quando aplicável** e, após homologação, integrar o cancelamento ao EVO/W12.

## Regras operacionais
- A equipe pesquisa o aluno pela **matrícula/ID EVO**, exemplo `29965`.
- Não usar CPF como chave de acesso do portal.
- O ID EVO não pode funcionar sozinho como senha pública; é previsível e sujeito a enumeração.
- Para o fluxo assistido, a equipe autentica, localiza o aluno, confere o contrato e clica **Atender aluno agora**. A sessão do aluno é criada internamente e o formulário abre no mesmo aparelho, sem exibir link ou token.
- Unidades válidas: **Condor** e **Umarizal**.
- Usuários administrativos: **Gerrard** e **Ruy**, com contas separadas para auditoria.
- Não depender de SMTP para operar. O sistema gera e recebe documentos no próprio portal.

## Fluxo do aluno
1. Conferir nome, unidade, plano e contrato.
2. Informar motivo e data desejada.
3. Visualizar prévia financeira se o plano for anual e houver dados suficientes.
4. Preencher endereço e chave PIX apenas quando aplicável.
5. Confirmar a solicitação.
6. Gerar PDF do termo.
7. Assinar o documento.
8. Fazer upload do termo assinado em PDF/JPG/PNG.
9. Receber protocolo e status.

## Regras financeiras fornecidas
### Plano anual
O modelo fornecido informa:
- 14,4% relacionado à antecipação das parcelas;
- 10% relacionado à multa/taxa do sistema;
- prazo de até 60 dias úteis para eventual pagamento de estorno.

Para a **prévia operacional**, mostrar separadamente 14,4% + 10%, aplicados sobre o saldo proporcional não utilizado, com aviso claro de que é uma estimativa sujeita à conferência do financeiro. Não apresentar como valor jurídico definitivo.

### Plano recorrente
O modelo fornecido informa:
- multa de referência de R$ 258,00;
- pedido com 30 dias de antecedência da próxima mensalidade.

Não inventar fórmula automática de estorno para recorrente se o contrato não fornecer uma fórmula suficiente.

## Termo digital
Gerar PDF com:
- nome;
- matrícula/ID EVO;
- unidade;
- plano;
- data de início;
- data da solicitação;
- motivo;
- protocolo;
- endereço;
- PIX quando aplicável;
- condições do plano anual ou recorrente;
- área para assinatura.

Não exigir CPF/RG no portal. O termo assinado deve ser armazenado de forma privada e vinculado ao protocolo.

## Administração
Painel deve permitir:
- localizar aluno;
- sincronizar contrato do EVO em modo `read`;
- cadastro rápido manual enquanto API não estiver conectada;
- iniciar atendimento;
- acompanhar solicitações;
- visualizar status em português;
- baixar termo assinado;
- aprovar/rejeitar;
- registrar estorno/comprovante;
- trilha de auditoria.

## EVO API
Arquitetura:
- token somente no backend/Railway;
- jamais usar `NEXT_PUBLIC_` para credenciais;
- primeiro `manual`, depois `read`, por último `write`;
- cachear aluno/contrato;
- limitar chamadas;
- sem polling agressivo;
- webhooks somente se oficialmente disponíveis;
- cancelamento automático somente depois de confirmar o endpoint oficial e homologar;
- em falha de escrita, enviar para revisão manual; nunca perder a solicitação.

## Segurança
- cookies HttpOnly + Secure + SameSite;
- HSTS, CSP, anti-clickjacking, nosniff;
- rate limit;
- validação de origem/CSRF;
- criptografia de identificadores sensíveis quando necessário;
- HMAC para busca pseudonimizada;
- prevenção de IDOR;
- upload privado com limite de tamanho e validação de MIME/magic bytes;
- bloquear PDF ativo suspeito;
- não expor secrets em GitHub, frontend ou logs;
- auditoria de ações administrativas;
- manter escrita EVO desativada por padrão.

## Railway
- PostgreSQL no mesmo projeto;
- `DATABASE_URL` referenciando o serviço Postgres;
- banco preparado automaticamente no startup;
- duas credenciais administrativas por usuário e hash de senha em variáveis de ambiente;
- sem senha em texto puro: armazenar somente hashes.

## Resultado esperado
Entregar projeto completo e coerente, sem telas técnicas desnecessárias para o operador, com UX simples para recepção e aluno, documentação de deploy e `.env.example` sem segredos reais. Entregar também ZIP final e comandos de push Git/Railway.
