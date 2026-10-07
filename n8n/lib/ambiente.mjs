// O .env da raiz e os argumentos da linha de comando, sem dependência nova.
import fs from 'node:fs';
import { createRequire } from 'node:module';

// O driver do Mongo vem do PWA: assim os scripts do n8n não precisam de um
// package.json próprio, com outra versão do driver para manter.
export const exigir = createRequire(new URL('../../pwa/package.json', import.meta.url));

export function lerAmbiente() {
  return Object.fromEntries(
    fs
      .readFileSync(new URL('../../.env', import.meta.url), 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
  );
}

/** O valor de `--nome valor`, ou o padrão. */
export function argumento(nome, padrao) {
  const i = process.argv.indexOf(`--${nome}`);
  const valor = i >= 0 ? process.argv[i + 1] : undefined;
  return valor !== undefined && !valor.startsWith('--') ? valor : padrao;
}

/** Todos os valores de um argumento que pode se repetir (`--buscar a --buscar b`). */
export function argumentos(nome) {
  const valores = [];
  process.argv.forEach((a, i) => {
    if (a === `--${nome}` && process.argv[i + 1] !== undefined) valores.push(process.argv[i + 1]);
  });
  return valores;
}

export const opcao = (nome) => process.argv.includes(`--${nome}`);
