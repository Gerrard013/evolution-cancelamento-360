# Release v5 — Atendimento Assistido

- Remove o link/código visível do fluxo operacional.
- Equipe pesquisa matrícula EVO e abre o formulário do aluno no mesmo aparelho.
- Dois usuários administrativos por Railway: Gerrard e Ruy.
- Login por usuário + senha, sem SMTP e sem TOTP obrigatório.
- Sessão administrativa de 8 horas.
- Prévia anual detalha 14,4% + 10% e mantém aviso de conferência financeira.
- Plano recorrente mantém referência de R$ 258 e antecedência de 30 dias, sem inventar estorno.
- Termo exibe matrícula/ID EVO validado pelo sistema e não exige CPF/RG.
- E-mail do aluno deixou de ser obrigatório; o fluxo não depende de SMTP.
- Upload assinado continua privado no PostgreSQL e vinculado ao protocolo.
- Docker inicializa com `prisma db push` para preparar as tabelas no Railway.
- Escrita no EVO continua desativada até homologação dos endpoints reais.
