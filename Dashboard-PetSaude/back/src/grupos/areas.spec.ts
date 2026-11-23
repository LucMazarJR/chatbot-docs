import {
    AREAS,
    cabeEm,
    normalizarPermissoes,
    papelLegado,
    permissoesTotais,
    permite,
} from './areas';

describe('permite', () => {
    it('editar inclui ver', () => {
        expect(permite({ conversas: 'editar' }, 'conversas', 'ver')).toBe(true);
    });

    it('ver não inclui editar', () => {
        expect(permite({ conversas: 'ver' }, 'conversas', 'editar')).toBe(false);
    });

    it('área ausente é sem acesso', () => {
        expect(permite({}, 'avisos', 'ver')).toBe(false);
    });
});

describe('normalizarPermissoes', () => {
    it('garante FAQs para ver mesmo quando o formulário tira', () => {
        const { permissoes, erros } = normalizarPermissoes({ faqs: 'nada', avisos: 'ver' });
        expect(erros).toEqual([]);
        expect(permissoes).toEqual({ faqs: 'ver', avisos: 'ver' });
    });

    it('recusa nível que a área não tem', () => {
        const { permissoes, erros } = normalizarPermissoes({ historico: 'editar', importar: 'ver' });
        expect(erros).toHaveLength(2);
        expect(permissoes.historico).toBeUndefined();
        expect(permissoes.importar).toBeUndefined();
    });

    it('recusa área desconhecida', () => {
        const { erros } = normalizarPermissoes({ painel_secreto: 'editar' });
        expect(erros[0]).toContain('painel_secreto');
    });

    it('recusa o que não é objeto', () => {
        expect(normalizarPermissoes(['faqs']).erros).toHaveLength(1);
        expect(normalizarPermissoes(null).erros).toHaveLength(1);
    });
});

describe('cabeEm', () => {
    const coordenacao = { faqs: 'editar', usuarios: 'editar', relatorios: 'ver' } as const;

    it('aceita grupo com acesso igual ou menor', () => {
        expect(cabeEm({ faqs: 'ver', relatorios: 'ver' }, coordenacao)).toBe(true);
        expect(cabeEm(coordenacao, coordenacao)).toBe(true);
    });

    it('recusa grupo que sobe o nível de uma área', () => {
        expect(cabeEm({ relatorios: 'editar' }, coordenacao)).toBe(false);
    });

    it('recusa grupo que abre área que o teto não tem', () => {
        expect(cabeEm({ conversas: 'ver' }, coordenacao)).toBe(false);
    });
});

describe('permissoesTotais', () => {
    it('cobre todas as áreas no nível mais alto de cada uma', () => {
        const todas = permissoesTotais();
        expect(Object.keys(todas).sort()).toEqual([...AREAS].sort());
        expect(todas.historico).toBe('ver');
        expect(todas.importar).toBe('editar');
        expect(todas.conversas).toBe('editar');
    });
});

describe('papelLegado', () => {
    it('master é admin mesmo num grupo pequeno', () => {
        expect(papelLegado(true, { faqs: 'ver' })).toBe('admin');
    });

    it('deduz editor e leitor pelas FAQs', () => {
        expect(papelLegado(false, { faqs: 'editar' })).toBe('editor');
        expect(papelLegado(false, { faqs: 'ver', conversas: 'editar' })).toBe('leitor');
    });
});
