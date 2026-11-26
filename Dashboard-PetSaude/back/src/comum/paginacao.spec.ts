// Os decorators do DTO no mesmo arquivo pedem os metadados, que o Nest carrega no boot.
import 'reflect-metadata';

import { pagina, paginado, POR_PAGINA_MAXIMO, POR_PAGINA_PADRAO } from './paginacao';

describe('paginacao', () => {
    it('usa a página 1 e o padrão quando nada vem', () => {
        expect(pagina()).toEqual({ page: 1, limit: POR_PAGINA_PADRAO, skip: 0 });
    });

    it('recusa valores inválidos em vez de pular registros', () => {
        expect(pagina(0, -5)).toEqual({ page: 1, limit: POR_PAGINA_PADRAO, skip: 0 });
        expect(pagina(1.5, 10).page).toBe(1);
    });

    it('limita o tamanho da página ao máximo', () => {
        expect(pagina(1, 5000).limit).toBe(POR_PAGINA_MAXIMO);
    });

    it('calcula o salto da página', () => {
        expect(pagina(3, 20).skip).toBe(40);
    });

    it('monta a resposta com o total real', () => {
        const r = paginado(['a', 'b'], 45, pagina(3, 20));
        expect(r).toMatchObject({ total: 45, page: 3, totalPages: 3, hasNext: false, hasPrev: true });
    });

    it('lista vazia ainda tem uma página', () => {
        expect(paginado([], 0, pagina()).totalPages).toBe(1);
    });
});
