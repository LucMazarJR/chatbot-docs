/**
 * Página devolvida quando o próprio servidor do painel falha ao montar a tela.
 *
 * É HTML puro, sem o CSS do app: se a renderização quebrou, a folha de estilo
 * pode nem ter sido gerada. As cores repetem os valores de styles.css (claro e
 * escuro) para a pessoa reconhecer que ainda está no painel.
 */
export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Não foi possível carregar a página | Central de FAQs</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root { --fundo: #f3f3f8; --cartao: #ffffff; --texto: #1c1d33; --suave: #575a76; --borda: #dcddea; --acao: #4b4fa8; --acao-texto: #ffffff; color-scheme: light; }
      @media (prefers-color-scheme: dark) {
        :root { --fundo: #15162a; --cartao: #1e2038; --texto: #e8e8f4; --suave: #a3a5c2; --borda: #30334f; --acao: #a5a8f0; --acao-texto: #191a40; color-scheme: dark; }
      }
      body { font: 15px/1.5 "IBM Plex Sans", system-ui, -apple-system, sans-serif; background: var(--fundo); color: var(--texto); display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1rem; box-sizing: border-box; }
      .card { max-width: 28rem; width: 100%; box-sizing: border-box; text-align: center; padding: 2rem 1.5rem; background: var(--cartao); border: 1px solid var(--borda); border-radius: 0.75rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: var(--suave); margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { display: inline-flex; align-items: center; min-height: 44px; padding: 0 1rem; border-radius: 0.5rem; font: inherit; font-weight: 600; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      a:focus-visible, button:focus-visible { outline: 2px solid var(--acao); outline-offset: 2px; }
      .primary { background: var(--acao); color: var(--acao-texto); }
      .secondary { background: transparent; color: var(--texto); border-color: var(--borda); }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Não foi possível carregar a página</h1>
      <p>Pode ser uma falha passageira no servidor. Toque em Tentar de novo. Se continuar, espere alguns minutos e avise um administrador do painel.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Tentar de novo</button>
        <a class="secondary" href="/">Ir para as FAQs</a>
      </div>
    </main>
  </body>
</html>`;
}
