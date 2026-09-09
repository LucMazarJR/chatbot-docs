import Link from 'next/link';

import './escolha.css';

/**
 * Porta de entrada do protótipo.
 *
 * Existem dois desenhos concorrentes da mesma conversa, feitos em paralelo, e o
 * grupo precisa escolher um. Esta página apresenta os dois lado a lado.
 *
 * A ordem e os rótulos são deliberadamente neutros — "A" e "B", sem adjetivo de
 * qualidade e sem dizer quem fez cada um. Numa reunião de escolha, chamar uma de
 * "completa" ou citar o autor decide o resultado antes de alguém abrir o link.
 *
 * As duas usam exatamente o mesmo fluxo por trás: mesmo n8n, mesma base de FAQs,
 * mesmo modelo. O que está em avaliação é só a interface.
 */
export const metadata = {
  title: 'Assistente de Saúde — protótipos',
};

const VERSOES = [
  {
    href: '/a',
    letra: 'A',
    caracteristicas: [
      'Abre direto na conversa, sem etapas antes',
      'Aviso de privacidade como recado dentro do chat',
      'Polegar para cima ou para baixo em cada resposta',
      'Avaliação final com nota, recomendação e comentário',
    ],
  },
  {
    href: '/b',
    letra: 'B',
    caracteristicas: [
      'Começa pedindo o aceite dos termos, com botões',
      'Configurações de tema e tamanho do texto',
      'Polegar com espaço para explicar o porquê',
      'Feedback e “relatar um problema” pelo menu',
    ],
  },
];

export default function Escolha() {
  return (
    <main className="escolha">
      <header>
        <h1>Assistente de Saúde</h1>
        <p>
          Duas propostas de interface para o mesmo assistente. Experimente as duas e diga qual
          funciona melhor — por trás, as respostas vêm exatamente da mesma base.
        </p>
      </header>

      <div className="opcoes">
        {VERSOES.map(({ href, letra, caracteristicas }) => (
          <Link key={href} href={href} className="opcao">
            <span className="letra">{letra}</span>
            <span className="titulo">Versão {letra}</span>
            <ul>
              {caracteristicas.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <span className="abrir">Abrir conversa →</span>
          </Link>
        ))}
      </div>

      <p className="rodape">
        Protótipo em teste. As conversas são registradas para avaliação — não informe dados
        pessoais.
      </p>
    </main>
  );
}
