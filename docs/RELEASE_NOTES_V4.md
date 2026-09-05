# Release Final Operacional v4

## Objetivo
Remover a aparência de protótipo técnico e transformar o fluxo em uma operação simples para recepção/equipe e aluno.

## Mudanças principais
- removido o campo público de código longo;
- link seguro criado pela equipe e aberto com um clique;
- token temporário colocado no fragmento da URL e trocado por sessão HttpOnly;
- matrícula EVO usada somente pela equipe para localizar o aluno;
- busca por matrícula com exemplo 29965;
- fluxo preparado para Condor e Umarizal;
- modo manual operacional enquanto a API EVO não estiver conectada;
- painel administrativo simplificado;
- status internos convertidos para português operacional;
- removidos termos visuais de desenvolvimento como "EVO Bridge", "Hardening", "MVP Ultra" e numeração decorativa;
- fluxo do aluno reduzido para Contrato → Solicitação → Prévia → Termo → Assinatura;
- upload do termo assinado mantido em PDF/JPG/PNG até 8 MB;
- protocolo permanece como identificador do pedido;
- segredos EVO continuam exclusivamente no backend/Railway.
