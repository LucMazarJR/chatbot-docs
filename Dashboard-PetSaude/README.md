# Dashboard Pet

Esta pasta contém o projeto completo, limpo e consolidado pronto para ser subido para o GitHub.
- `/front`: Interface em React (Lovable).
- `/back`: Backend em NestJS refatorado com MongoDB (Mongoose) e integração do Google Gemini para embeddings de FAQs (preparado pro padrão do n8n).

## Executar o projeto (Desenvolvimento)
Lembre-se de recolocar os arquivos `.env` em ambas as pastas, já que os arquivos com senhas e credenciais originais foram automaticamente excluídos da cópia por questões de segurança (para você não subir credenciais no GitHub por acidente).

**No Back-end:**
```bash
cd back
npm install
npm run start:dev
```

**No Front-end:**
```bash
cd front
npm install
npm run dev
```
