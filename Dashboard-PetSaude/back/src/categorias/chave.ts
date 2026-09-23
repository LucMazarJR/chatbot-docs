/**
 * A forma canônica de uma categoria, usada para comparar, nunca para exibir.
 *
 * LÓGICA DO LUCIANO: a base tem 236 categorias distintas para 2491 FAQs, e boa
 * parte da diferença não é de assunto, é de digitação. A criação manual gravava
 * a categoria exatamente como foi escrita; a importação em lote forçava
 * minúsculo. "Exames" digitado na tela e "exames" vindo da planilha viravam
 * duas categorias, com duas páginas, dois contadores e dois grupos de FAQs que
 * o chatbot enxerga como assuntos diferentes.
 *
 * Daí a chave: minúsculo, sem acento, sem espaço sobrando e sem espaço
 * repetido. "Exames  de Sangue", "exames de sangue" e "EXAMES DE SANGUE" têm a
 * mesma chave e passam a ser a mesma coisa.
 *
 * O acento cai só na CHAVE. O nome visível guarda a grafia correta, com acento,
 * porque é ele que vai para a tela e para o texto embedado ("Assunto: ..."). O
 * que se perde aqui é poder de distinguir duas categorias que só diferem por
 * acento, e isso é exatamente o que se quer perder.
 */
export function chaveDeCategoria(nome: string | null | undefined): string {
    return (nome ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}
