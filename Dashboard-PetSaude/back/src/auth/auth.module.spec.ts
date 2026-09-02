import { ConfigService } from '@nestjs/config';

import { exigirSegredoJwt } from './auth.module';

/**
 * O segredo de assinatura dos tokens.
 *
 * LÓGICA DO LUCIANO: aqui havia um fallback constante — `?? 'troque-este-
 * segredo-no-env'` — e o `.env.example` distribui `JWT_SECRET=` vazio. Bastava
 * a variável não chegar ao ambiente para a API subir NORMALMENTE assinando
 * tokens com uma string publicada no GitHub, e qualquer pessoa forjar um token
 * de admin. Não havia erro, log nem sintoma: do ponto de vista do processo,
 * estava tudo funcionando.
 *
 * Este teste existe para que ninguém reintroduza o fallback "só para destravar
 * o ambiente local" — que é exatamente como ele apareceu da primeira vez.
 */
describe('exigirSegredoJwt', () => {
    const config = (valor?: string) =>
        ({ get: () => valor }) as unknown as ConfigService;

    it('recusa quando a variavel nao existe', () => {
        expect(() => exigirSegredoJwt(config(undefined))).toThrow(
            /JWT_SECRET nao esta definido/i,
        );
    });

    it('recusa string vazia', () => {
        expect(() => exigirSegredoJwt(config(''))).toThrow(/JWT_SECRET nao esta definido/i);
    });

    it('recusa string so de espacos', () => {
        // Um .env com `JWT_SECRET= ` e indistinguivel de um sem a variavel,
        // e o `??` original deixava passar os dois de formas diferentes.
        expect(() => exigirSegredoJwt(config('   '))).toThrow(/JWT_SECRET nao esta definido/i);
    });

    it('recusa segredo curto demais para resistir a forca bruta', () => {
        expect(() => exigirSegredoJwt(config('curto-demais'))).toThrow(/minimo e 32/i);
    });

    it('aceita um segredo de tamanho adequado', () => {
        const segredo = 'a'.repeat(32);
        expect(exigirSegredoJwt(config(segredo))).toBe(segredo);
    });

    it('devolve o segredo sem espaco nas pontas', () => {
        expect(exigirSegredoJwt(config('  ' + 'b'.repeat(40) + '  '))).toBe('b'.repeat(40));
    });
});
