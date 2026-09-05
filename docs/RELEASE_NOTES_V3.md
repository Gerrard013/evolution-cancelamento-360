# Release Final v3

## Incluído

- fluxo real por ID EVO para equipe;
- identificação de Condor/Umarizal;
- código público temporário anti-IDOR;
- geração server-side do termo PDF;
- adaptação do termo para identificação por matrícula/ID, sem CPF/RG no portal;
- campos endereço, e-mail e PIX quando aplicável;
- upload do termo assinado;
- retomada de solicitação incompleta;
- armazenamento privado do documento no PostgreSQL;
- validações de arquivo + bloqueio de conteúdo ativo conhecido em PDF;
- download administrativo autenticado;
- cancelamento EVO somente após assinatura e por feature flag;
- fallback para revisão manual;
- referência financeira separada para recorrente/anual;
- preservação dos PDFs originais em `docs/templates-original/`;
- documentação de homologação e segurança.

## Ainda depende de configuração externa

- token e endpoints reais da API EVO;
- banco PostgreSQL Railway;
- regra financeira aprovada pela Evolution;
- aprovação formal do novo termo digital;
- MFA administrativo;
- domínio/WAF/monitoramento conforme infraestrutura escolhida.
