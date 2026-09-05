# Runbook operacional — Final v3

## 1. Funcionalidades e propósito

| Funcionalidade | Propósito |
|---|---|
| Pesquisa por ID EVO | Localizar o aluno sem pedir CPF no portal público. |
| Normalização Condor/Umarizal | Evitar pedido associado à unidade errada. |
| Código temporário do aluno | Impedir enumeração/IDOR usando matrícula previsível. |
| Cache EVO | Reduzir hits e manter o plano Plus dentro do limite. |
| Prévia de estorno | Dar transparência ao aluno sem executar pagamento automaticamente. |
| Protocolo único | Rastreabilidade ponta a ponta. |
| Termo gerado em PDF | Eliminar preenchimento manual e divergência de dados. |
| Upload do termo assinado | Substituir o retorno por e-mail por um fluxo ligado ao protocolo. |
| Arquivo privado | Evitar exposição pública de documentos. |
| Fila administrativa | Permitir conferência humana de casos de risco/erro. |
| Escrita EVO por feature flag | Impedir cancelamentos acidentais antes da homologação. |
| Idempotency-Key | Evitar cancelamento duplicado em retries. |
| Auditoria | Registrar quem/quando/o que mudou. |
| Rate limit | Reduzir brute force e abuso. |
| CSP/HSTS/anti-clickjacking | Hardening web contra classes comuns de ataque. |
| HMAC/criptografia de IDs | Reduzir exposição de identificadores internos no banco/logs. |

## 2. Fluxo da equipe

1. Login com MFA.
2. Informar matrícula EVO, por exemplo `29965`.
3. O sistema consulta aluno + contratos.
4. Confirmar unidade e plano.
5. Gerar ID temporário para o contrato correto.
6. Entregar o código ao aluno por canal confiável.
7. Acompanhar o protocolo no painel.
8. Quando aparecer **Termo assinado**, baixar somente em estação corporativa protegida.
9. Aprovar/revisar conforme política financeira.

## 3. Fluxo do aluno

1. Informar o código temporário.
2. Confirmar contrato/unidade.
3. Informar motivo e data desejada.
4. Visualizar prévia, se calculável.
5. Informar endereço/e-mail e PIX apenas quando aplicável ao plano anual.
6. Gerar PDF.
7. Assinar.
8. Fazer upload.
9. Concluir e guardar protocolo.

O processo pode ser retomado: se o aluno sair depois de gerar o termo ou depois do upload, o mesmo código temporário abre a solicitação pendente enquanto estiver válido.

## 4. Estados principais

- `AWAITING_SIGNATURE`: termo gerado, aguardando upload.
- `SIGNED_RECEIVED`: documento recebido.
- `UNDER_REVIEW`: pedido completo em análise.
- `EVO_CANCEL_REQUESTED`: escrita solicitada ao EVO.
- `EVO_CANCELLED`: EVO confirmou cancelamento.
- `MANUAL_REVIEW`: integração não conseguiu confirmar com segurança.
- `REFUND_PENDING`: financeiro precisa tratar eventual estorno.
- `COMPLETED`: processo encerrado.

## 5. Upload e malware

Controles implementados no app:

- apenas PDF/JPG/PNG;
- máximo de 8 MB;
- validação pelo conteúdo real (magic bytes), não apenas extensão;
- MIME compatível;
- nome sanitizado;
- SHA-256;
- PDFs com `/JavaScript`, `/JS`, `/OpenAction`, `/Launch`, `/EmbeddedFile`, `/RichMedia` ou `/AA` são rejeitados;
- armazenamento privado no PostgreSQL;
- documentos administrativos são entregues como `Content-Disposition: attachment` e `nosniff`;
- nenhum upload é colocado em `public/` ou executado.

Para defesa empresarial adicional, use antivírus/EDR no endpoint administrativo e, se o volume crescer, mover o arquivo para storage privado com scanner dedicado de malware. O sistema não afirma que análise por assinatura substitui um antivírus completo.

## 6. Regras financeiras dos modelos recebidos

### Recorrente
O documento de referência informa multa de R$ 258,00 e antecedência de 30 dias, mas não oferece fórmula de estorno suficiente. Portanto o sistema **não inventa estorno automático** para recorrente; envia para conferência.

### Anual
O documento de referência menciona 14,4% sobre antecipação das parcelas + 10% de multa/taxa do sistema. Quando não existe regra financeira formal cadastrada, o sistema usa 24,4% somente como referência de **prévia**, sobre o saldo proporcional não utilizado. O valor continua sujeito à validação financeira.

Antes de uso financeiro definitivo, cadastre e aprove uma regra oficial da Evolution.
