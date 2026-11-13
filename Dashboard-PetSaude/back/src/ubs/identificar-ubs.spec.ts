import { chaveDaGrafia, chaveDeUbs, distancia, identificarUbs, type UnidadeParaBusca } from './identificar-ubs';
import { UNIDADES_INICIAIS } from './unidades-iniciais';

const unidades: UnidadeParaBusca[] = UNIDADES_INICIAIS.map((nome) => ({
    id: nome,
    chave: chaveDeUbs(nome),
    apelidos: [],
}));

const id = (texto: string, lista = unidades) => identificarUbs(texto, lista)?.id ?? null;

describe('chaveDeUbs', () => {
    it.each([
        ['UBS Aeroporto III', 'aeroporto iii'],
        ['ubs do aeroporto 3', 'aeroporto iii'],
        ['Posto de Saúde Aeroporto três', 'aeroporto iii'],
        ['  São   Sebastião ', 'sao sebastiao'],
        ['UBS Sta. Clara', 'santa clara'],
    ])('"%s" vira "%s"', (texto, chave) => expect(chaveDeUbs(texto)).toBe(chave));

    it('quem escreveu só o tipo fica sem chave, e agrupa pelo que escreveu', () => {
        expect(chaveDeUbs('UBS')).toBe('');
        expect(chaveDaGrafia(' UBS ')).toBe('ubs');
    });
});

describe('distancia', () => {
    it('conta letra trocada, faltando e invertida como um erro só', () => {
        expect(distancia('horto', 'horto')).toBe(0);
        expect(distancia('horto', 'hortu')).toBe(1);
        expect(distancia('horto', 'hoto')).toBe(1);
        expect(distancia('horto', 'hrotо'.replace('о', 'o'))).toBe(1);
    });
});

describe('identificarUbs', () => {
    it.each([
        ['ubs aeroporto', 'UBS Aeroporto'],
        ['AEROPORTO 3', 'UBS Aeroporto III'],
        ['aeroporto tres', 'UBS Aeroporto III'],
        ['sao sebastiao', 'UBS São Sebastião'],
        ['Ubs Sta Terezinha', 'UBS Santa Terezinha'],
        ['posto angela rosa', 'UBS Angela Rosa'],
    ])('"%s" é o nome de %s', (texto, nome) => {
        expect(identificarUbs(texto, unidades)).toEqual({ id: nome, como: 'nome' });
    });

    it.each([
        ['aeropoto', 'UBS Aeroporto'],
        ['aeropoto 3', 'UBS Aeroporto III'],
        ['guanabra', 'UBS Guanabara'],
        ['brazilandia', 'UBS Brasilândia'],
        ['luisa', 'UBS Luiza'],
        ['terezinha', 'UBS Santa Terezinha'],
        ['clara', 'UBS Santa Clara'],
        ['petropolis', 'ESF City Petrópolis'],
        ['aeroporto iii perto da escola', 'UBS Aeroporto III'],
    ])('"%s" é aproximadamente %s', (texto, nome) => {
        expect(identificarUbs(texto, unidades)).toEqual({ id: nome, como: 'aproximada' });
    });

    it('não confunde nomes parecidos', () => {
        expect(id('paulista')).toBe('UBS Paulista');
        expect(id('paulistano')).toBe('UBS Paulistano');
        expect(id('aeroporto')).toBe('UBS Aeroporto');
    });

    it.each(['paulistan', 'santa', 'aeroporto 1', 'hospital regional', 'oi', 'UBS', 'nao sei'])(
        'na dúvida, "%s" fica para alguém decidir',
        (texto) => expect(id(texto)).toBeNull(),
    );

    it('a correção feita no painel vale antes de qualquer aproximação', () => {
        const lista = unidades.map((u) =>
            u.id === 'UBS Paulista' ? { ...u, apelidos: [chaveDaGrafia('paulistan')] } : u,
        );
        expect(identificarUbs('Paulistan', lista)).toEqual({ id: 'UBS Paulista', como: 'corrigida' });
    });
});
