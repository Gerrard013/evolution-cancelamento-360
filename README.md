# Evolution Cancelamento 360 — Final Operacional v4

Versão focada em uso real, com telas simplificadas para equipe e aluno. O sistema permite localizar o aluno pela matrícula EVO, identificar Condor/Umarizal, gerar o termo, apresentar prévia de estorno quando aplicável, receber o termo assinado e acompanhar o pedido.

## Fluxo de uso

### Equipe
1. Acesse `/equipe`.
2. Digite a matrícula EVO, por exemplo `29965`.
3. Se a API EVO já estiver conectada, o sistema traz nome, unidade, plano e contrato automaticamente.
4. Se a API ainda não estiver conectada, use o cadastro rápido com os mesmos dados vistos no EVO/W12. Isso permite começar a operar antes da integração.
5. Escolha o contrato e clique em **Iniciar cancelamento**.
6. O sistema cria um **link seguro** válido por 24 horas. A equipe só precisa copiar o link ou abrir o portal do aluno. O código aleatório não é exibido como campo para digitação.

### Aluno
1. Abre o link seguro recebido da equipe.
2. Confere nome, unidade e plano.
3. Informa motivo e data desejada.
4. Visualiza a prévia de estorno quando houver dados suficientes para cálculo seguro.
5. Preenche os dados mínimos do termo.
6. Gera e baixa o PDF do termo.
7. Assina e envia o PDF/JPG/PNG assinado pelo próprio portal.
8. Recebe o protocolo e acompanha a conclusão do pedido.

## Segurança do acesso

A matrícula EVO é usada pela equipe para localizar o cadastro, mas não funciona como senha pública. Matrículas como `29965` são previsíveis e não devem ser usadas sozinhas para abrir dados de contrato. A v4 usa um link temporário de alta entropia, colocado no fragmento da URL (`#acesso=`), que não é enviado ao servidor em logs de navegação. Ao abrir o portal, o token é trocado por uma sessão HttpOnly e removido da barra de endereço.

O portal não solicita CPF/RG. A matrícula EVO continua sendo dado pessoal quando vinculável ao aluno, portanto o sistema mantém minimização, criptografia, HMAC, controle de acesso e trilha de auditoria.

## Operação antes da API EVO

A v4 pode ser usada em `EVO_INTEGRATION_MODE="manual"`. A equipe informa manualmente os dados necessários do contrato e o fluxo completo de termo/upload funciona. Quando a API for configurada, a busca por matrícula passa a preencher esses dados automaticamente.

## Termos

Os modelos originais permanecem em `docs/templates-original/`. O termo digital é gerado pelo sistema com matrícula, nome, unidade, plano, datas, motivo e protocolo, sem exigir CPF/RG no portal.

- Recorrente: referência operacional de multa de R$ 258,00 e antecedência de 30 dias.
- Anual: referência operacional de 14,4% + 10% e prazo informado de até 60 dias úteis para eventual pagamento.

A prévia financeira é uma estimativa sujeita à conferência administrativa/financeira.

## Railway

Variáveis mínimas para começar em modo manual:

```env
DATABASE_URL="..."
APP_ORIGIN="https://SEU-DOMINIO.up.railway.app"
NEXT_PUBLIC_DEMO_MODE="false"
SESSION_SECRET="..."
PUBLIC_ID_PEPPER="..."
EXTERNAL_ID_PEPPER="..."
APP_DATA_ENCRYPTION_KEY="..."
IP_HASH_PEPPER="..."
ADMIN_EMAIL="..."
ADMIN_PASSWORD_HASH="..."
EVO_INTEGRATION_MODE="manual"
EVO_WRITE_ENABLED="false"
CUSTOMER_DIRECT_CANCELLATION="false"
```

Depois conecte a API EVO primeiro em modo `read`. Escrita e cancelamento direto devem ser habilitados somente após homologação dos endpoints reais.

## Verificações

```bash
npm run security:check
npm run production:check
npm run typecheck
npm run build
```

O `security:check` desta entrega foi executado com sucesso. O ambiente de geração não conseguiu concluir `npm install` por indisponibilidade de rede, então `build` e `typecheck` completos devem ser executados no Mac/Railway com as dependências instaladas.
