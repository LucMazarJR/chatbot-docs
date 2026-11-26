import { BadRequestException, ConflictException } from '@nestjs/common';

import { UbsService } from './ubs.service';

/**
 * Só a lógica do lote: o `criar` de verdade grava no banco e é conferido contra
 * o ambiente real. Aqui ele é trocado por um dublê que decide o resultado.
 */
function servicoComCriar(criar: (nome: string) => Promise<unknown>) {
    const servico = Object.create(UbsService.prototype) as UbsService;
    (servico as unknown as { criar: typeof criar }).criar = criar;
    return servico;
}

const ator = { name: 'Teste' };

describe('UbsService.criarEmLote', () => {
    it('cria as novas, aponta as que já existiam e segue depois de uma linha ruim', async () => {
        const servico = servicoComCriar(async (nome) => {
            if (nome === 'UBS Progresso') throw new ConflictException('já existe');
            return { nome };
        });

        const r = await servico.criarEmLote(['UBS Palma', 'UBS Progresso', 'UBS', 'x', 'ESF Horto'], ator);

        expect(r.criadas).toEqual(['UBS Palma', 'ESF Horto']);
        expect(r.jaExistiam).toEqual(['UBS Progresso']);
        expect(r.recusadas.map((x) => x.nome)).toEqual(['UBS', 'x']);
    });

    it('nome feito só de palavras genéricas é recusado com o motivo', async () => {
        // "centro" é ignorado na chave por causa de "Centro de Saúde X": "UBS
        // Centro" fica sem chave, como já era no cadastro de uma por vez.
        const servico = servicoComCriar(async (nome) => ({ nome }));
        const r = await servico.criarEmLote(['UBS Centro'], ator);
        expect(r.recusadas[0]?.nome).toBe('UBS Centro');
    });

    it('linhas repetidas na própria lista entram uma vez só', async () => {
        const criadas: string[] = [];
        const servico = servicoComCriar(async (nome) => criadas.push(nome));

        await servico.criarEmLote(['UBS Aeroporto III', 'ubs do aeroporto 3', '  ', 'UBS  Aeroporto III'], ator);

        expect(criadas).toEqual(['UBS Aeroporto III']);
    });

    it('a recusa de uma linha pelo criar vira aviso, e não erro da lista', async () => {
        const servico = servicoComCriar(async () => {
            throw new BadRequestException('nome inválido');
        });

        const r = await servico.criarEmLote(['UBS Palma'], ator);

        expect(r.recusadas).toEqual([{ nome: 'UBS Palma', motivo: 'nome inválido' }]);
    });
});
