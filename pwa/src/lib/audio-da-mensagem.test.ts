import { describe, expect, it } from 'vitest';

import { lerAudio } from './audio-da-mensagem';

describe('lerAudio', () => {
  it('aceita a duração e guarda o registro da transcrição', () => {
    expect(lerAudio({ duracaoSegundos: 7.4, modelo: 'gemini-3.1-flash-lite', transcricaoMs: 2600.2 })).toEqual({
      duracaoSegundos: 7,
      transcritoPor: 'ia',
      modelo: 'gemini-3.1-flash-lite',
      transcricaoMs: 2600,
    });
  });

  it('sem duração razoável não é mensagem de áudio', () => {
    expect(lerAudio(undefined)).toBeNull();
    expect(lerAudio({ duracaoSegundos: 0 })).toBeNull();
    expect(lerAudio({ duracaoSegundos: 'muito' })).toBeNull();
    expect(lerAudio({ duracaoSegundos: 600 })).toBeNull();
  });

  it('modelo e tempo estranhos viram nulo, sem derrubar o resto', () => {
    expect(lerAudio({ duracaoSegundos: 3, modelo: 42, transcricaoMs: -1 })).toEqual({
      duracaoSegundos: 3,
      transcritoPor: 'ia',
      modelo: null,
      transcricaoMs: null,
    });
  });
});
