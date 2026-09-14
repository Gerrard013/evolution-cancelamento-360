# Configurar API EVO agora

## O que já sabemos

Segundo a conversa com o suporte:
- API EVO em padrão REST;
- credencial/token em **Configuração > Integrações > EVO**;
- documentação em `https://api.abcevo.com/`;
- a conta/plano precisa ter o recurso de API habilitado;
- a integração deve evitar chamadas desnecessárias.

## 1. Copiar da documentação EVO

Precisamos de quatro informações exatas:
1. URL base real das requisições;
2. formato de autenticação da conta (basic/bearer/header);
3. rota para localizar aluno pelo ID;
4. rota para listar contratos do aluno.

Não confundir o endereço da documentação com a URL base da API se a documentação indicar hosts diferentes.

## 2. Railway — leitura

```env
EVO_INTEGRATION_MODE=read
EVO_WRITE_ENABLED=false
EVO_API_BASE_URL=<URL BASE REAL>
EVO_AUTH_MODE=basic
EVO_API_USERNAME=<DNS OU USUÁRIO>
EVO_API_TOKEN=<TOKEN>
EVO_MEMBER_BY_ID_PATH=<PATH EXATO>
EVO_CONTRACTS_BY_MEMBER_PATH=<PATH EXATO>
EVO_CONTRACT_BY_ID_PATH=<PATH EXATO OU VAZIO>
CUSTOMER_DIRECT_CANCELLATION=false
EVO_REMOVE_PAYMENT_METHOD_ENABLED=false
```

## 3. Primeiro teste

Use uma matrícula conhecida, por exemplo `29965`.

Confirme no sistema:
- nome correto;
- data de nascimento reconhecida;
- unidade Condor ou Umarizal;
- plano;
- data de início;
- status ativo;
- valor total do plano/contrato;
- tipo anual ou recorrente.

Se algum campo vier errado, corrija o mapeamento antes de ativar escrita.

## 4. Cancelamento

Somente após leitura validada:

```env
EVO_INTEGRATION_MODE=write
EVO_WRITE_ENABLED=true
EVO_CANCEL_CONTRACT_PATH=<PATH OFICIAL>
EVO_CANCEL_METHOD=<DELETE OU PUT CONFORME DOCUMENTAÇÃO>
CUSTOMER_DIRECT_CANCELLATION=false
```

Teste pelo painel da equipe.

## 5. Cartão/forma de pagamento

Depois de homologar a rota correta:

```env
EVO_REMOVE_PAYMENT_METHOD_ENABLED=true
EVO_REMOVE_PAYMENT_METHOD_PATH=<PATH OFICIAL>
EVO_REMOVE_PAYMENT_METHOD_METHOD=<DELETE OU PUT>
```

## 6. Automação direta

Só depois dos testes:

```env
CUSTOMER_DIRECT_CANCELLATION=true
```

O código nunca deve receber token EVO em variável `NEXT_PUBLIC_*`.
