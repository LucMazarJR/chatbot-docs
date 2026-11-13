import { ConfigService } from '@nestjs/config';

import { GeminiService } from './gemini.service';

/**
 * Geração de texto com tentativas e reserva.
 *
 * LÓGICA DO LUCIANO: o que estes testes protegem é a diferença entre os dois
 * erros que parecem iguais. Sobrecarga (503) passa sozinha e vale repetir e ir
 * para a reserva; cota esgotada não passa hoje, e repetir só queima o resto.
 */
describe('GeminiService.gerarJsonComModelo', () => {
    const sobrecarga = new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand."}}');
    const cota = new Error('429 RESOURCE_EXHAUSTED: quota exceeded');

    function criar(respostas: (Error | string)[]) {
        const config = { get: (chave: string) => (chave === 'GEMINI_API_KEY' ? 'chave-de-teste' : undefined) };
        const service = new GeminiService(config as unknown as ConfigService);
        const modelos: string[] = [];
        const generateContent = jest.fn(async ({ model }: { model: string }) => {
            modelos.push(model);
            const proxima = respostas.shift();
            if (proxima instanceof Error) throw proxima;
            return { text: proxima };
        });

        (service as any).genAI = { models: { generateContent } };
        // Sem esperar de verdade entre as tentativas.
        (service as any).esperar = jest.fn(async () => undefined);
        return { service, modelos };
    }

    it('repete na sobrecarga e responde com o modelo principal', async () => {
        const { service, modelos } = criar([sobrecarga, sobrecarga, '{"ok":true}']);

        const resultado = await service.gerarJsonComModelo<{ ok: boolean }>('prompt');

        expect(resultado).toEqual({ dados: { ok: true }, modelo: 'gemini-3.1-flash-lite' });
        expect(modelos).toHaveLength(3);
    });

    describe('GeminiService.gerarEmbedding', () => {
        function criarEmbedding(respostas: (Error | number[])[]) {
            const config = { get: (chave: string) => (chave === 'GEMINI_API_KEY' ? 'chave-de-teste' : undefined) };
            const service = new GeminiService(config as unknown as ConfigService);
            const embedContent = jest.fn(async () => {
                const proxima = respostas.shift();
                if (proxima instanceof Error) throw proxima;
                return { embeddings: [{ values: proxima }] };
            });
            (service as any).genAI = { models: { embedContent } };
            (service as any).esperar = jest.fn(async () => undefined);
            return { service, embedContent };
        }

        it('repete limite temporario e conclui sem marcar cota diaria', async () => {
            const vetor = new Array(3072).fill(0);
            const { service, embedContent } = criarEmbedding([
                new Error('429 Too Many Requests: quota exceeded, retry after 60s'),
                vetor,
            ]);

            await expect(service.gerarEmbedding('texto')).resolves.toHaveLength(3072);
            expect(embedContent).toHaveBeenCalledTimes(2);
        });

        it('nao repete quando a API informa limite diario', async () => {
            const { service, embedContent } = criarEmbedding([
                new Error('429 RESOURCE_EXHAUSTED: EmbedContentRequestsPerDayPerUserPerProjectPerModel-FreeTier'),
            ]);

            await expect(service.gerarEmbedding('texto')).rejects.toThrow('PerDay');
            expect(embedContent).toHaveBeenCalledTimes(1);
            expect(GeminiService.ehCotaDiaria(new Error('requests per day exceeded'))).toBe(true);
        });
    });

    it('depois de três sobrecargas, vai para a reserva e diz que foi ela', async () => {
        const { service, modelos } = criar([sobrecarga, sobrecarga, sobrecarga, '{"ok":true}']);

        const resultado = await service.gerarJsonComModelo('prompt');

        expect(resultado.modelo).toBe('gemini-2.5-flash-lite');
        expect(modelos).toEqual([
            'gemini-3.1-flash-lite',
            'gemini-3.1-flash-lite',
            'gemini-3.1-flash-lite',
            'gemini-2.5-flash-lite',
        ]);
    });

    it('cota esgotada não se repete nem vai para a reserva', async () => {
        const { service, modelos } = criar([cota, '{"ok":true}']);

        await expect(service.gerarJsonComModelo('prompt')).rejects.toThrow('quota');
        expect(modelos).toHaveLength(1);
    });
});
