import { describe, expect, it } from 'vitest';

import { emailValido, normalizarEmail } from './email';

describe('e-mail', () => {
  it('normaliza caixa e espaços, que é o que muda entre um cadastro e outro da mesma pessoa', () => {
    expect(normalizarEmail('  Ana.Silva@Exemplo.COM ')).toBe('ana.silva@exemplo.com');
  });

  it('não junta pontos nem o "+": em outros provedores são pessoas diferentes', () => {
    expect(normalizarEmail('ana.silva@provedor.com')).not.toBe(normalizarEmail('anasilva@provedor.com'));
    expect(normalizarEmail('ana+exames@provedor.com')).toBe('ana+exames@provedor.com');
  });

  it('pega erro de digitação óbvio', () => {
    expect(emailValido('ana@exemplo.com')).toBe(true);
    expect(emailValido('ana@exemplo')).toBe(false);
    expect(emailValido('ana exemplo.com')).toBe(false);
    expect(emailValido('ana@@exemplo.com')).toBe(false);
    expect(emailValido('')).toBe(false);
  });
});
