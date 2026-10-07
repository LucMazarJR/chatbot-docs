// Cache em disco das chamadas ao Gemini.
//
// Rodar o teste de novo depois de mudar um passo só deve gastar cota no que
// mudou. A chave é o hash do pedido inteiro (etapa, modelo e corpo): qualquer
// mudança de prompt, de trecho ou de histórico vira outra chave. Falha não
// entra no cache, para ser tentada de novo na rodada seguinte.
//
// O cache guarda texto derivado das perguntas (a pergunta entendida, a
// resposta). Por isso fica em n8n/.local, fora do git, e a rodada completa
// apaga o que não usou: uma conversa apagada no banco sai do teste e, na
// rodada seguinte, sai também daqui.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function criarCache(pasta) {
  const usados = new Set();

  const arquivoDe = (etapa, chave) => {
    const hash = crypto.createHash('sha256').update(JSON.stringify(chave)).digest('hex');
    return path.join(pasta, etapa, hash.slice(0, 2), `${hash}.json`);
  };

  function* arquivos(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const caminho = path.join(dir, entrada.name);
      if (entrada.isDirectory()) yield* arquivos(caminho);
      else yield caminho;
    }
  }

  return {
    /** O valor guardado para a chave, ou o que `produzir` devolver (e que passa a ficar guardado). */
    async ou(etapa, chave, produzir) {
      const arquivo = arquivoDe(etapa, chave);
      usados.add(arquivo);
      if (fs.existsSync(arquivo)) return { ...JSON.parse(fs.readFileSync(arquivo, 'utf8')), doCache: true };
      const valor = await produzir();
      fs.mkdirSync(path.dirname(arquivo), { recursive: true });
      fs.writeFileSync(arquivo, JSON.stringify(valor));
      return valor;
    },
    /** Apaga o que esta rodada não usou. Só faz sentido depois de uma rodada completa. */
    podar() {
      let apagados = 0;
      for (const arquivo of arquivos(pasta)) {
        if (!usados.has(arquivo)) {
          fs.rmSync(arquivo);
          apagados++;
        }
      }
      return apagados;
    },
    limpar() {
      fs.rmSync(pasta, { recursive: true, force: true });
    },
  };
}
