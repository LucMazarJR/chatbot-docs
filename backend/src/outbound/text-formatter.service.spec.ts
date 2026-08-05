import { TextFormatterService } from './text-formatter.service';

describe('TextFormatterService', () => {
  const formatter = new TextFormatterService();

  describe('HTML do Telegram (o bug que chegava ao cidadão)', () => {
    it('converte negrito e itálico para a sintaxe do WhatsApp', () => {
      expect(formatter.format('<b>Jejum:</b> 8 horas')).toBe('*Jejum:* 8 horas');
      expect(formatter.format('<i>observação</i>')).toBe('_observação_');
      expect(formatter.format('<strong>x</strong> e <em>y</em>')).toBe('*x* e _y_');
    });

    it('transforma parágrafos em quebras de linha', () => {
      expect(formatter.format('<p>Olá.</p><p>Como posso ajudar?</p>')).toBe(
        'Olá.\n\nComo posso ajudar?',
      );
    });

    it('remove qualquer tag remanescente', () => {
      expect(formatter.format('<div><span>texto</span></div>')).toBe('texto');
    });

    it('preserva o texto do link e mostra a URL', () => {
      expect(formatter.format('<a href="https://saude.gov.br">portal</a>')).toBe(
        'portal (https://saude.gov.br)',
      );
    });

    it('decodifica entidades HTML', () => {
      // O prompt antigo mandava escapar `&` como `&amp;` para o Telegram.
      expect(formatter.format('Exames &amp; Consultas')).toBe('Exames & Consultas');
      expect(formatter.format('&lt;teste&gt;')).toBe('<teste>');
    });

    it('converte a saída completa do prompt antigo de uma vez', () => {
      const respostaAntiga =
        '<p>Para o exame de zinco:</p><b>Jejum:</b> 8 horas.<br><b>Álcool:</b> Evite &amp; aguarde.';

      expect(formatter.format(respostaAntiga)).toBe(
        'Para o exame de zinco:\n\n*Jejum:* 8 horas.\n*Álcool:* Evite & aguarde.',
      );
    });
  });

  describe('Markdown', () => {
    it('converte negrito, itálico e negrito-itálico', () => {
      expect(formatter.format('**forte**')).toBe('*forte*');
      expect(formatter.format('__enfase__')).toBe('_enfase_');
      expect(formatter.format('***ambos***')).toBe('*_ambos_*');
    });

    it('converte títulos em negrito', () => {
      expect(formatter.format('## Preparo')).toBe('*Preparo*');
    });

    it('troca marcadores de lista por bullet', () => {
      // `*` no início de linha o WhatsApp lê como negrito e desconfigura tudo.
      expect(formatter.format('* Jejum\n* Álcool')).toBe('• Jejum\n• Álcool');
      expect(formatter.format('- Jejum\n- Álcool')).toBe('• Jejum\n• Álcool');
    });

    it('remove marcador de citação', () => {
      expect(formatter.format('> atenção')).toBe('atenção');
    });
  });

  describe('espaçamento', () => {
    it('limita a uma linha em branco entre blocos', () => {
      expect(formatter.format('a\n\n\n\n\nb')).toBe('a\n\nb');
    });

    it('remove espaços no fim das linhas e nas pontas', () => {
      expect(formatter.format('  texto   \n  outra   ')).toBe('texto\n  outra');
    });
  });

  it('não altera um texto que já está no formato do WhatsApp', () => {
    const jaCorreto = '*Jejum:* 8 horas.\n_Evite álcool._';

    expect(formatter.format(jaCorreto)).toBe(jaCorreto);
  });
});
