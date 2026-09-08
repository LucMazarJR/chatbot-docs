/**
 * Gera os ícones PNG do PWA.
 *
 * Roda uma vez e commita o resultado — não faz parte do build. Escreve o PNG na
 * mão (cabeçalho + IDAT desinflado com o `zlib` do próprio Node) em vez de usar
 * `sharp` ou `canvas`: as duas trazem binários nativos de dezenas de megabytes
 * para um projeto que precisa de quatro imagens estáticas.
 *
 *   node scripts/gerar-icones.mjs
 *
 * O desenho é o mesmo do SVG em public/icons/icone.svg: balão de conversa
 * branco com uma cruz de saúde, sobre o verde do cabeçalho.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DESTINO = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const VERDE = [0x00, 0x80, 0x69];
const BRANCO = [0xff, 0xff, 0xff];

/** Distância com sinal até um retângulo de cantos arredondados. */
function sdfRetangulo(px, py, cx, cy, largura, altura, raio) {
  const dx = Math.abs(px - cx) - (largura / 2 - raio);
  const dy = Math.abs(py - cy) - (altura / 2 - raio);
  const fora = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return fora + Math.min(Math.max(dx, dy), 0) - raio;
}

/**
 * `true` se o ponto está dentro do desenho do ícone.
 *
 * `escala` reserva a margem do formato maskable: o Android recorta o ícone em
 * círculo, e sem folga a arte encosta na borda e perde pedaço.
 */
function dentroDoBalao(x, y, tamanho, escala) {
  const c = tamanho / 2;
  const u = tamanho * escala;

  // Corpo do balão.
  if (sdfRetangulo(x, y, c, c - u * 0.04, u * 0.62, u * 0.5, u * 0.14) <= 0) return true;

  // Rabinho: triângulo no canto inferior esquerdo, colado ao corpo.
  const topo = c + u * 0.19;
  const esquerda = c - u * 0.2;
  if (y >= topo && y <= topo + u * 0.13) {
    const avanco = (y - topo) / (u * 0.13);
    if (x >= esquerda && x <= esquerda + u * 0.16 * (1 - avanco)) return true;
  }

  return false;
}

/** A cruz vazada no meio do balão. */
function dentroDaCruz(x, y, tamanho, escala) {
  const c = tamanho / 2;
  const u = tamanho * escala;
  const cy = c - u * 0.04;
  const braco = u * 0.075;
  const comprimento = u * 0.26;

  const horizontal = Math.abs(x - c) <= comprimento / 2 && Math.abs(y - cy) <= braco / 2;
  const vertical = Math.abs(y - cy) <= comprimento / 2 && Math.abs(x - c) <= braco / 2;
  return horizontal || vertical;
}

function desenhar(tamanho, { maskable = false } = {}) {
  const escala = maskable ? 0.66 : 0.86;
  const raioFundo = maskable ? tamanho / 2 : tamanho * 0.22;
  const amostras = 3;

  // Uma linha PNG começa com o byte do filtro (0 = nenhum).
  const cru = Buffer.alloc(tamanho * (1 + tamanho * 4));

  for (let y = 0; y < tamanho; y += 1) {
    const inicioLinha = y * (1 + tamanho * 4);
    cru[inicioLinha] = 0;

    for (let x = 0; x < tamanho; x += 1) {
      // Supersampling: sem isso as bordas curvas ficam serrilhadas.
      let fundo = 0;
      let arte = 0;

      for (let sy = 0; sy < amostras; sy += 1) {
        for (let sx = 0; sx < amostras; sx += 1) {
          const px = x + (sx + 0.5) / amostras;
          const py = y + (sy + 0.5) / amostras;

          if (sdfRetangulo(px, py, tamanho / 2, tamanho / 2, tamanho, tamanho, raioFundo) <= 0) {
            fundo += 1;
          }
          if (dentroDoBalao(px, py, tamanho, escala) && !dentroDaCruz(px, py, tamanho, escala)) {
            arte += 1;
          }
        }
      }

      const total = amostras * amostras;
      const alfaFundo = fundo / total;
      const alfaArte = arte / total;

      // Branco sobre verde sobre transparente.
      const cor = [0, 1, 2].map((canal) => {
        const base = VERDE[canal] * alfaFundo;
        return Math.round(base * (1 - alfaArte) + BRANCO[canal] * alfaArte);
      });

      const posicao = inicioLinha + 1 + x * 4;
      cru[posicao] = cor[0];
      cru[posicao + 1] = cor[1];
      cru[posicao + 2] = cor[2];
      cru[posicao + 3] = Math.round(255 * Math.max(alfaFundo, alfaArte));
    }
  }

  return montarPng(tamanho, cru);
}

function montarPng(tamanho, dadosCrus) {
  const assinatura = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tamanho, 0);
  ihdr.writeUInt32BE(tamanho, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  // 10, 11, 12 = compressão, filtro e entrelaçamento padrão (todos 0).

  return Buffer.concat([
    assinatura,
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(dadosCrus, { level: 9 })),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

function bloco(tipo, dados) {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length, 0);

  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(calcularCrc(corpo), 0);

  return Buffer.concat([tamanho, corpo, crc]);
}

const TABELA_CRC = Array.from({ length: 256 }, (_, indice) => {
  let valor = indice;
  for (let bit = 0; bit < 8; bit += 1) {
    valor = valor & 1 ? 0xedb88320 ^ (valor >>> 1) : valor >>> 1;
  }
  return valor >>> 0;
});

function calcularCrc(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = TABELA_CRC[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

mkdirSync(DESTINO, { recursive: true });

for (const [arquivo, tamanho, opcoes] of [
  ['icone-180.png', 180, {}],
  ['icone-192.png', 192, {}],
  ['icone-512.png', 512, {}],
  ['icone-maskable-512.png', 512, { maskable: true }],
]) {
  const caminho = join(DESTINO, arquivo);
  writeFileSync(caminho, desenhar(tamanho, opcoes));
  console.log('gerado', arquivo);
}
