# ML Affiliate AI — versão online fácil

Esta versão foi preparada para publicação em Render com Docker, Postgres e Key Value/Redis. O navegador acessa um único endereço público.

## O que falta para ficar online
1. Conectar uma conta Render.
2. Publicar este repositório em um Git provider (GitHub é o caminho mais simples).
3. Criar o Blueprint usando `render.yaml`.
4. Informar no primeiro deploy: ADMIN_EMAIL, ADMIN_PASSWORD, ML_CLIENT_ID e ML_CLIENT_SECRET.
5. Registrar no app do Mercado Livre o redirect URI exatamente como:
   `https://SEU-DOMINIO/api/v1/marketplace/mercadolivre/callback`
6. Abrir o endereço público, entrar e clicar em Conectar Mercado Livre.

## Importante
- O sistema não recebe sua senha do Mercado Livre.
- Tokens ficam criptografados no banco e nunca são enviados ao frontend.
- Nenhum gasto é autorizado automaticamente.
- Recursos de afiliado não documentados oficialmente pela API não são simulados nem burlados.
