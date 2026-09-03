# LGPD e minimização de dados

## A decisão de não usar CPF
O portal público não pede CPF. Em vez disso, usa um ID temporário e aleatório emitido para um contrato específico.

Isso reduz exposição, phishing, enumeração e vazamento acidental. Porém, não “tira o sistema da LGPD”: se um identificador puder ser relacionado a uma pessoa, ele continua sendo dado pessoal.

## Dados mínimos do desenho atual
- nome de exibição;
- identificador EVO pseudonimizado;
- unidade e plano;
- datas do contrato;
- valor necessário ao cálculo;
- motivo de cancelamento;
- aceite do termo;
- protocolo e auditoria.

## O que não deve ser coletado sem necessidade
- CPF no portal público;
- número completo de cartão;
- CVV;
- senha do EVO;
- documento de identidade apenas “por garantia”;
- dados médicos detalhados quando o motivo “saúde” puder ser registrado apenas como categoria.

## Pseudonimização
- ID do EVO: HMAC para busca interna.
- ID do EVO em texto claro: somente cifrado com AES-256-GCM quando precisa ser reutilizado na integração.
- ID de acesso do cliente: somente hash persistido.
- IP e User-Agent: hash para auditoria, não valor bruto.

## Retenção
Defina política formal antes da produção. O sistema não deve manter solicitação, motivo, logs ou comprovantes por prazo indeterminado sem justificativa jurídica/operacional.

## Direitos do titular
O processo operacional deve prever atendimento a acesso, correção, informação, oposição/eliminação quando aplicável e demais direitos previstos em política interna e orientação jurídica.
