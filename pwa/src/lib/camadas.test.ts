import { describe, expect, it } from 'vitest';

import { criarCamadas } from './camadas';

/** Um histórico de mentira: conta entradas e guarda as tarefas para rodar quando o teste mandar. */
function historicoFalso() {
  const estado = { entradas: 1, endereco: '/staging', tarefas: [] as (() => void)[] };
  const camadas = criarCamadas({
    empilhar: () => void (estado.entradas += 1),
    voltar: () => void (estado.entradas -= 1),
    endereco: () => estado.endereco,
    depois: (tarefa) => void estado.tarefas.push(tarefa),
  });
  const rodar = () => estado.tarefas.splice(0).forEach((tarefa) => tarefa());
  /** O voltar do celular: o navegador tira a entrada e avisa pelo popstate. */
  const apertarVoltar = () => {
    estado.entradas -= 1;
    camadas.aoVoltar();
  };
  return { estado, camadas, rodar, apertarVoltar };
}

describe('camadas', () => {
  it('abrir põe uma entrada, e o voltar fecha a camada', () => {
    const { estado, camadas, apertarVoltar } = historicoFalso();
    let fechada = false;
    camadas.abrir(() => (fechada = true));
    expect(estado.entradas).toBe(2);

    apertarVoltar();
    expect(fechada).toBe(true);
    expect(estado.entradas).toBe(1);
  });

  it('fechar pela tela tira a entrada, e o popstate dessa volta é ignorado', () => {
    const { estado, camadas, rodar } = historicoFalso();
    let fechadas = 0;
    const id = camadas.abrir(() => fechadas++);
    camadas.soltar(id);
    rodar();
    expect(estado.entradas).toBe(1);

    camadas.aoVoltar();
    expect(fechadas).toBe(0);
  });

  it('trocar o menu pelo painel no mesmo toque não mexe no histórico', () => {
    const { estado, camadas, rodar, apertarVoltar } = historicoFalso();
    const menu = camadas.abrir(() => {});
    camadas.soltar(menu);
    let painelFechado = false;
    camadas.abrir(() => (painelFechado = true));
    rodar();
    expect(estado.entradas).toBe(2);

    apertarVoltar();
    expect(painelFechado).toBe(true);
    expect(estado.entradas).toBe(1);
  });

  it('camada sobre camada: cada voltar fecha a de cima', () => {
    const { estado, camadas, apertarVoltar } = historicoFalso();
    const fechadas: string[] = [];
    camadas.abrir(() => fechadas.push('painel'));
    camadas.abrir(() => fechadas.push('voz'));
    expect(estado.entradas).toBe(2);

    apertarVoltar();
    expect(fechadas).toEqual(['voz']);
    expect(estado.entradas).toBe(2);

    apertarVoltar();
    expect(fechadas).toEqual(['voz', 'painel']);
    expect(estado.entradas).toBe(1);
  });

  it('saindo por um link, não volta: a entrada vira a página nova', () => {
    const { estado, camadas, rodar } = historicoFalso();
    const id = camadas.abrir(() => {});
    camadas.sair(id);
    estado.endereco = '/staging/conta';
    camadas.soltar(id);
    rodar();
    expect(estado.entradas).toBe(2);
  });

  it('a página mudou antes de a camada sair da tela: não volta', () => {
    const { estado, camadas, rodar } = historicoFalso();
    const id = camadas.abrir(() => {});
    estado.endereco = '/privacidade';
    camadas.soltar(id);
    rodar();
    expect(estado.entradas).toBe(2);
  });

  it('voltar sem camada aberta é da página, e não é tocado', () => {
    const { camadas } = historicoFalso();
    expect(() => camadas.aoVoltar()).not.toThrow();
  });
});
