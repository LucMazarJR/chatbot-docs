# Escopo da IA — chatbot PET-SAÚDE

## Deve cobrir

- Execução alinhada a `AGENTS.md` e às skills ativas
- Estado do plano (`docs/progresso/`, `docs/instalacao.md`, `docs/armadilhas.md`)
- Compose, gateway, n8n, PWA, scripts de FAQ
- Portas e deploy no host `172.21.31.167`
- Checagem de divergência Git (`origin` + `gitness`)
- Documentação em `docs/` (sem inventar decisão de negócio)

## Não deve cobrir

- Criar escopo novo sem pedido explícito
- Reinterpretar `docs/depende-de-voce.md`
- Skills inativas (mobile, APK, `atualizar-kit`)
- GLPI sem `tools/glpi/`
- Commitar `.env` ou expor tokens
- Rodar `scripts/limpar_banco.py` sem confirmação e sem ler a doc
- Subir `cloudflared` ou o profile `dashboard` neste host sem a pasta do dashboard
