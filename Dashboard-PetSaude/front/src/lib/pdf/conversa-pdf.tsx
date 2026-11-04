import { Document, Page, Text, View } from "@react-pdf/renderer";

import type { ConversaResumida, MensagemConversa } from "@/lib/conversas.functions";
import { dataEHora, hora } from "@/lib/datas";
import { baixar, estilos, Rodape, TINTA } from "./comum";

/**
 * Uma conversa em PDF, do jeito que a pessoa viu.
 *
 * Para quem acompanha o teste e não usa o painel: o arquivo vai para o grupo e
 * abre em qualquer celular. Sem os bastidores (trechos e scores), que são
 * trabalho de quem revisa a base e continuam no painel.
 */
export async function baixarConversaEmPdf(
  sessao: ConversaResumida,
  mensagens: MensagemConversa[],
): Promise<void> {
  const nome = sessao.nome.replace(/[^\w-]+/g, "-").replace(/-+/g, "-").toLowerCase();
  await baixar(<ConversaPdf sessao={sessao} mensagens={mensagens} />, `conversa-${nome}.pdf`);
}

const COR = {
  pergunta: "#d9fdd3",
  resposta: "#ffffff",
  fundo: "#efeae2",
} as const;

/**
 * *negrito* do WhatsApp vira negrito de verdade; _itálico_ perde só os traços.
 *
 * O itálico da Helvetica existe, mas trocar de fonte no meio da frase por um
 * sublinhado solto (como em nomes de arquivo) estragava mais do que ajudava.
 */
function TextoFormatado({ texto }: { texto: string }) {
  const partes = texto.replace(/_([^_\n]+)_/g, "$1").split("*");
  return (
    <Text>
      {partes.map((parte, i) =>
        i % 2 ? (
          <Text key={i} style={estilos.negrito}>
            {parte}
          </Text>
        ) : (
          parte
        ),
      )}
    </Text>
  );
}

export function ConversaPdf({
  sessao,
  mensagens,
}: {
  sessao: ConversaResumida;
  mensagens: MensagemConversa[];
}) {
  const perguntas = mensagens.filter((m) => m.papel === "user").length;
  const semResposta = mensagens.filter((m) => m.semResposta).length;
  const aval = sessao.avaliacao;
  const resumo = [
    `Começou em ${dataEHora(sessao.iniciadaEm)}`,
    `${perguntas} ${perguntas === 1 ? "pergunta" : "perguntas"}`,
    semResposta ? `${semResposta} sem resposta` : null,
    aval?.estrelas != null ? `nota ${aval.estrelas} de 5` : null,
    aval?.nps != null ? `recomendaria ${aval.nps} de 10` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Document title={`Conversa ${sessao.nome}`} author="Painel PET-Saúde" language="pt-BR">
      <Page size="A4" style={estilos.pagina}>
        <Text style={estilos.titulo}>Conversa: {sessao.nome}</Text>
        <Text style={estilos.subtitulo}>
          Assistente de Saúde do PET-Saúde. {resumo}.
        </Text>

        {aval?.comentario ? (
          <View style={[estilos.caixa, { marginBottom: 10 }]}>
            <Text style={estilos.nota}>O que a pessoa escreveu na avaliação</Text>
            <Text style={{ marginTop: 2 }}>"{aval.comentario}"</Text>
          </View>
        ) : null}

        <View style={{ backgroundColor: COR.fundo, borderRadius: 6, padding: 10 }}>
          {mensagens.length === 0 ? (
            <Text style={{ textAlign: "center", color: TINTA.secundaria }}>
              A pessoa abriu o chat e saiu sem perguntar nada.
            </Text>
          ) : (
            mensagens.map((m) => <Balao key={m._id} mensagem={m} />)
          )}
        </View>

        <Rodape texto={`Assistente de Saúde PET-Saúde · Conversa ${sessao.nome}`} />
      </Page>
    </Document>
  );
}

function Balao({ mensagem }: { mensagem: MensagemConversa }) {
  const pergunta = mensagem.papel === "user";
  const marcas = [
    mensagem.semResposta ? "não encontrou resposta" : null,
    mensagem.erro ? "falhou" : null,
    mensagem.feedback === "up" ? "avaliada como boa" : null,
    mensagem.feedback === "down" ? "avaliada como ruim" : null,
  ].filter(Boolean);

  return (
    <View
      wrap={false}
      style={{
        alignSelf: pergunta ? "flex-end" : "flex-start",
        maxWidth: "80%",
        marginBottom: 6,
      }}
    >
      <View
        style={{
          backgroundColor: pergunta ? COR.pergunta : COR.resposta,
          borderRadius: 6,
          paddingHorizontal: 8,
          paddingVertical: 5,
        }}
      >
        <TextoFormatado texto={mensagem.texto || "(resposta vazia)"} />
        <Text style={{ fontSize: 7.5, color: TINTA.fraca, textAlign: "right", marginTop: 2 }}>
          {pergunta ? "Pessoa" : "Assistente"} · {hora(mensagem.em)}
        </Text>
      </View>
      {marcas.length > 0 ? (
        <Text
          style={{
            fontSize: 7.5,
            color: mensagem.erro ? TINTA.erro : TINTA.atencao,
            marginTop: 1,
            paddingLeft: 2,
          }}
        >
          {marcas.join(" · ")}
        </Text>
      ) : null}
    </View>
  );
}
