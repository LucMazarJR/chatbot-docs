import type { Metadata } from 'next';
import Link from 'next/link';

import { diasDeRetencao } from '@/lib/db';

// Dinâmica, e não gerada no build: o prazo e o contato vêm do ambiente em que o
// container roda. Gerada no build, a página prometeria o prazo da máquina que
// compilou, e mudar PWA_RETENCAO_DIAS não mudaria o que ela diz.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Como tratamos seus dados | Assistente de Saúde',
};

/**
 * Política de privacidade do protótipo.
 *
 * LÓGICA DO LUCIANO: escrita para quem está no posto de saúde com o celular na
 * mão, não para um advogado — frases curtas, e cada item dizendo o que
 * acontece de fato. E só promete o que o sistema cumpre sozinho: o prazo é o do
 * índice TTL, a exclusão é a rota que apaga inclusive as cópias da curadoria, e
 * o que sai do aparelho é exatamente o que o código envia.
 *
 * O que ainda é decisão da instituição (encarregado de dados, política oficial
 * do órgão) não aparece aqui como se estivesse resolvido — está listado em
 * docs/depende-de-voce.md.
 */
export default function Privacidade() {
  const dias = diasDeRetencao();
  const contato = process.env.PWA_CONTATO_PRIVACIDADE?.trim();

  return (
    <div className="privacidade">
      <header className="privacidade-topo">
        <Link href="/" aria-label="Voltar para a conversa">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2Z" />
          </svg>
        </Link>
        <h1>Como tratamos seus dados</h1>
      </header>

      <main className="privacidade-corpo">
        <section>
          <h2>O que é este chat</h2>
          <p>
            Um <b>protótipo em teste</b> do assistente de saúde do projeto PET-Saúde, usado para
            avaliar se as respostas estão corretas e úteis. Não é canal oficial de atendimento e
            não substitui a orientação de um profissional de saúde.
          </p>
        </section>

        <section>
          <h2>O que fica registrado</h2>
          <ul>
            <li>O texto das mensagens que você envia e das respostas do assistente, com data e hora.</li>
            <li>O momento em que você aceitou, ou recusou, os termos no começo da conversa.</li>
            <li>A avaliação, se você responder: nota, recomendação e comentário.</li>
            <li>O tipo de navegador e de aparelho, para a equipe investigar problemas de tela.</li>
            <li>
              Se você tocar no clipe ou no microfone: só o tipo, o tamanho e a duração. O arquivo e o
              áudio <b>não saem do seu aparelho</b>, e o nome do arquivo não é guardado.
            </li>
          </ul>
          <p>
            Não pedimos seu nome, CPF, cartão do SUS, telefone ou endereço — e pedimos que você
            não escreva esses dados nas mensagens.
          </p>
        </section>

        <section>
          <h2>Para que usamos</h2>
          <ul>
            <li>Conferir se as respostas do assistente estão corretas e úteis.</li>
            <li>
              Descobrir perguntas que o assistente ainda não sabe responder, para a equipe de saúde
              escrever novas respostas. Essas perguntas podem ser analisadas com ajuda de
              inteligência artificial, e toda resposta nova é revisada por uma pessoa da equipe
              antes de entrar no assistente.
            </li>
          </ul>
        </section>

        <section>
          <h2>Quem mais recebe os dados</h2>
          <ul>
            <li>
              Para gerar a resposta, sua mensagem é processada pelo <b>Gemini</b>, serviço de
              inteligência artificial do Google.
            </li>
            <li>
              As conversas ficam guardadas no <b>MongoDB Atlas</b>, serviço de banco de dados em
              nuvem, e passam pelos serviços de hospedagem que mantêm o chat no ar.
            </li>
            <li>
              Na equipe do projeto, só administradores do painel, com login individual, conseguem
              ler as conversas.
            </li>
          </ul>
        </section>

        <section>
          <h2>Por quanto tempo</h2>
          <ul>
            <li>
              A conversa <b>se apaga sozinha {dias} dias</b> depois de começar.
            </li>
            <li>A memória que o assistente usa para acompanhar o assunto some em 1 hora.</li>
            <li>
              Os registros técnicos do sistema que processa as mensagens se apagam em até 14 dias.
            </li>
            <li>
              Perguntas copiadas para o trabalho da equipe ficam guardadas enquanto esse trabalho
              durar, e são apagadas se você apagar a conversa.
            </li>
          </ul>
        </section>

        <section>
          <h2>Por que podemos usar</h2>
          <p>
            Porque você deu seu consentimento ao tocar em <b>Aceitar</b> no começo da conversa (Lei
            Geral de Proteção de Dados, art. 7º, I, e art. 11, I). Você pode recusar, e pode
            retirar o consentimento quando quiser apagando a conversa.
          </p>
        </section>

        <section>
          <h2>Seus direitos</h2>
          <ul>
            <li>
              <b>Ver o que foi registrado:</b> a conversa inteira fica visível no chat enquanto
              estiver no seu aparelho.
            </li>
            <li>
              <b>Apagar:</b> no menu <span aria-label="de três pontos">⋮</span> da conversa, toque em{' '}
              <b>Apagar minha conversa</b>. Isso apaga as mensagens e também as cópias usadas pela
              equipe.
            </li>
            <li>
              <b>Sem a conversa no aparelho</b> (trocou de celular ou limpou o navegador):{' '}
              {contato ? (
                <>
                  peça por <b>{contato}</b>
                </>
              ) : (
                <>procure a pessoa responsável pelo teste no local</>
              )}
              , informando o dia e o horário aproximado da conversa.
            </li>
          </ul>
        </section>

        <p className="privacidade-voltar">
          <Link href="/">Voltar para a conversa</Link>
        </p>
      </main>
    </div>
  );
}
