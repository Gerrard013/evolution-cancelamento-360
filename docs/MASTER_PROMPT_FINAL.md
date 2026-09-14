# Especificação mestre — Evolution Cancelamento 360 v6

Finalize e preserve o projeto como canal digital oficial de cancelamento da Evolution Academia, unidades Condor e Umarizal.

## Usuários

### Aluno
- entra sem CPF;
- informa matrícula EVO + data de nascimento;
- escolhe contrato ativo;
- vê condições e cálculo;
- gera termo;
- assina e envia pelo portal;
- recebe protocolo;
- consulta o protocolo depois.

### Equipe
- Gerrard e Ruy usam contas separadas;
- acompanham pedidos e documentos;
- confirmam taxa recorrente quando existir;
- executam/confirmam cancelamento;
- registram estorno;
- atendimento assistido permanece como contingência.

## Regra anual

`mensal = total/12`

`restante = mensal * mesesRestantes`

`estorno = max(0, restante - total*0.144 - total*0.10)`

Meses utilizados são meses de calendário inclusivos. Exemplo oficial de teste: R$1.200, início 30/12/2025, pedido 13/09/2026 => 10 usados, 2 restantes, R$200 restantes, R$172,80 de 14,4%, R$120 de 10%, estorno R$0.

## Regra recorrente

- sem estorno;
- antes de 12 meses: R$258;
- com 12 meses ou mais: R$0;
- após requisitos, cancelar contrato;
- remover cartão/forma recorrente após cancelamento quando a API EVO estiver homologada.

## Segurança

Token EVO somente backend/Railway, cookies HttpOnly/Secure/SameSite, rate limit, HMAC, criptografia, auditoria, anti-IDOR, arquivos privados, validação de upload, CSP/HSTS e escrita EVO desabilitada até homologação.

## API EVO

Nunca inventar endpoint. Configurar paths exatos da documentação da conta. Validar primeiro ID 29965 e campos reais; depois homologar cancelamento e remoção da forma de pagamento.
