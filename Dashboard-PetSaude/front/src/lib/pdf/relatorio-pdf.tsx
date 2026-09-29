import { Document, Page, Text, View } from "@react-pdf/renderer";

import { dataEHora, dataPorExtenso, hora } from "@/lib/datas";
import {
  COR_DA_BARRA,
  ORDEM_DAS_CAUSAS,
  ROTULO_CAUSA,
  ROTULO_SITUACAO,
  percentual,
  plural,
  segundos,
} from "@/lib/relatorio-rotulos";
import type { RelatorioDoDia } from "@/lib/relatorios.functions";
import { baixar, estilos, Rodape, TINTA } from "./comum";

/**
 * O relatório do dia em PDF, para ir ao grupo da equipe.
 *
 * Mesma ordem da tela: números, resumo, onde faltou resposta, áreas, temas para
 * revisar e cada pergunta. Quem recebe o arquivo não tem acesso ao painel, então
 * nada aqui pode depender de clicar em algo.
 */
export async function baixarRelatorioEmPdf(relatorio: RelatorioDoDia): Promise<void> {
  await baixar(<RelatorioPdf relatorio={relatorio} />, `relatorio-${relatorio.data}.pdf`);
}

/** A data do relatório como dia do calendário, sem fuso deslocando o dia. */
function diaDoRelatorio(data: string): string {
  return dataPorExtenso(`${data}T12:00:00-03:00`);
}

function RelatorioPdf({ relatorio }: { relatorio: RelatorioDoDia }) {
  const n = relatorio.numeros;
  const dia = diaDoRelatorio(relatorio.data);

  return (
    <Document title={`Relatório do dia ${dia}`} author="Painel PET-Saúde" language="pt-BR">
      <Page size="A4" style={estilos.pagina}>
        <Text style={estilos.titulo}>Relatório do dia: {dia}</Text>
        <Text style={estilos.subtitulo}>
          Assistente de Saúde do PET-Saúde. Gerado em {dataEHora(relatorio.terminadoEm ?? relatorio.iniciadoEm)} por{" "}
          {relatorio.atorNome}. Os números são contados pelo sistema; a classificação de cada pergunta e o
          resumo são escritos por IA ({relatorio.modelo ?? "modelo não registrado"}).
        </Text>

        {n && n.perguntas > 0 ? (
          <>
            <Numeros relatorio={relatorio} />
            {relatorio.resumo ? (
              <>
                <Text style={estilos.secao}>Resumo</Text>
                <Text>{relatorio.resumo}</Text>
              </>
            ) : null}
            <Causas relatorio={relatorio} />
            <Areas relatorio={relatorio} />
            <Escopos relatorio={relatorio} />
            <Comentarios relatorio={relatorio} />
            <Perguntas relatorio={relatorio} />
          </>
        ) : (
          <Text>Nenhuma pergunta foi feita ao chatbot neste dia.</Text>
        )}

        <Rodape texto={`Relatório do dia ${dia}`} />
      </Page>
    </Document>
  );
}

function Cartao({ rotulo, valor, contexto }: { rotulo: string; valor: string; contexto: string }) {
  return (
    <View style={[estilos.caixa, { flex: 1 }]}>
      <Text style={estilos.nota}>{rotulo}</Text>
      <Text style={{ fontSize: 17, fontFamily: "Helvetica-Bold", marginVertical: 2 }}>{valor}</Text>
      <Text style={estilos.nota}>{contexto}</Text>
    </View>
  );
}

function Numeros({ relatorio }: { relatorio: RelatorioDoDia }) {
  const n = relatorio.numeros!;
  const extras = [
    `${plural(n.positivos, "voto positivo", "votos positivos")} e ${plural(n.negativos, "negativo", "negativos")} nas respostas`,
    n.avaliacoes > 0
      ? `${plural(n.avaliacoes, "avaliação", "avaliações")} no fim da conversa` +
        (n.notaMedia != null ? `, nota média ${n.notaMedia.toFixed(1).replace(".", ",")} de 5` : "") +
        (n.npsMedio != null ? `, recomendação média ${n.npsMedio.toFixed(1).replace(".", ",")} de 10` : "")
      : "nenhuma avaliação no fim da conversa",
    n.aceitaramSemPerguntar > 0
      ? `${plural(n.aceitaramSemPerguntar, "pessoa aceitou", "pessoas aceitaram")} os termos e não fez pergunta`
      : null,
  ].filter(Boolean);

  return (
    <View>
      <View style={{ flexDirection: "row", gap: 6 }}>
        <Cartao
          rotulo="Perguntas"
          valor={n.perguntas.toLocaleString("pt-BR")}
          contexto={`em ${plural(n.conversas, "conversa", "conversas")}`}
        />
        <Cartao
          rotulo="Respondidas"
          valor={percentual(n.respondidas, n.perguntas)}
          contexto={`${n.respondidas} de ${n.perguntas}`}
        />
        <Cartao
          rotulo="Sem resposta"
          valor={percentual(n.semResposta, n.perguntas)}
          contexto={plural(n.semResposta, "pergunta", "perguntas")}
        />
        <Cartao
          rotulo="Tempo de resposta"
          valor={n.latenciaMediana != null ? segundos(n.latenciaMediana) : "sem dado"}
          contexto={
            n.latenciaP90 != null
              ? `9 em cada 10 em até ${segundos(n.latenciaP90)}; ${n.respostasAcimaDe60s} acima de 60 s`
              : "metade das respostas chega em até esse tempo"
          }
        />
      </View>
      <Text style={[estilos.nota, { marginTop: 6 }]}>{extras.join(". ")}.</Text>
    </View>
  );
}

function Causas({ relatorio }: { relatorio: RelatorioDoDia }) {
  const linhas = ORDEM_DAS_CAUSAS.map((causa) => ({ causa, n: relatorio.porCausa[causa] ?? 0 })).filter(
    (l) => l.n > 0,
  );
  if (linhas.length === 0) return null;

  return (
    <View wrap={false}>
      <Text style={estilos.secao}>O que aconteceu com as que não foram bem</Text>
      {linhas.map((l) => (
        <Text key={l.causa}>
          {ROTULO_CAUSA[l.causa]}: <Text style={estilos.negrito}>{l.n}</Text>
        </Text>
      ))}
    </View>
  );
}

function Legenda() {
  const itens = [
    { cor: COR_DA_BARRA.respondidas, rotulo: "Respondidas" },
    { cor: COR_DA_BARRA.semResposta, rotulo: "Sem resposta" },
    { cor: COR_DA_BARRA.falhas, rotulo: "Falharam" },
  ];
  return (
    <View style={{ flexDirection: "row", gap: 12, marginBottom: 6 }}>
      {itens.map((item) => (
        <View key={item.rotulo} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: item.cor }} />
          <Text style={estilos.nota}>{item.rotulo}</Text>
        </View>
      ))}
    </View>
  );
}

function Areas({ relatorio }: { relatorio: RelatorioDoDia }) {
  if (relatorio.porArea.length === 0) return null;
  const maior = Math.max(...relatorio.porArea.map((a) => a.total));

  return (
    <View wrap={false}>
      <Text style={estilos.secao}>Perguntas por área</Text>
      <Legenda />
      {relatorio.porArea.map((a) => {
        const partes = [
          { valor: a.respondidas, cor: COR_DA_BARRA.respondidas },
          { valor: a.semResposta, cor: COR_DA_BARRA.semResposta },
          { valor: a.falhas, cor: COR_DA_BARRA.falhas },
        ].filter((p) => p.valor > 0);
        return (
          <View key={a.area} style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
            <Text style={{ width: "34%", paddingRight: 6 }}>{a.area}</Text>
            <View style={{ width: "36%", flexDirection: "row" }}>
              <View style={{ width: `${(a.total / maior) * 100}%`, flexDirection: "row", gap: 1.5 }}>
                {partes.map((p, i) => (
                  <View
                    key={p.cor}
                    style={{
                      flexGrow: p.valor,
                      flexBasis: 0,
                      height: 9,
                      backgroundColor: p.cor,
                      // Ponta arredondada só no fim da barra; a base fica reta.
                      borderTopRightRadius: i === partes.length - 1 ? 2 : 0,
                      borderBottomRightRadius: i === partes.length - 1 ? 2 : 0,
                    }}
                  />
                ))}
              </View>
            </View>
            <Text style={{ width: "30%", paddingLeft: 6, color: TINTA.secundaria }}>
              {plural(a.total, "pergunta", "perguntas")}
              {a.semResposta > 0 ? `, ${a.semResposta} sem resposta` : ""}
              {a.falhas > 0 ? `, ${a.falhas} falharam` : ""}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function Escopos({ relatorio }: { relatorio: RelatorioDoDia }) {
  if (relatorio.escopos.length === 0) return null;

  return (
    <View>
      <Text style={estilos.secao}>Temas para revisar na base</Text>
      {relatorio.escopos.map((e, i) => (
        <View key={`${e.tema}-${i}`} style={[estilos.caixa, { marginBottom: 6 }]} wrap={false}>
          <Text style={estilos.negrito}>
            {i + 1}. {e.tema} ({plural(e.perguntas.length, "pergunta", "perguntas")})
          </Text>
          {e.motivo ? <Text style={{ marginTop: 2 }}>{e.motivo}</Text> : null}
          {e.sugestao ? (
            <Text style={{ marginTop: 2 }}>
              <Text style={estilos.negrito}>O que fazer: </Text>
              {e.sugestao}
            </Text>
          ) : null}
          <Text style={[estilos.nota, { marginTop: 3 }]}>
            Exemplos:{" "}
            {e.perguntas
              .slice(0, 4)
              .map((indice) => `"${relatorio.perguntas[indice]?.pergunta ?? ""}"`)
              .join("; ")}
            {e.perguntas.length > 4 ? ` e mais ${e.perguntas.length - 4}` : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Comentarios({ relatorio }: { relatorio: RelatorioDoDia }) {
  const comentarios = relatorio.numeros?.comentarios ?? [];
  if (comentarios.length === 0) return null;
  return (
    <View wrap={false}>
      <Text style={estilos.secao}>O que escreveram na avaliação</Text>
      {comentarios.map((c, i) => (
        <Text key={i}>"{c}"</Text>
      ))}
    </View>
  );
}

const COLUNAS = { hora: "8%", pergunta: "38%", area: "18%", situacao: "12%", comentario: "24%" };

function Perguntas({ relatorio }: { relatorio: RelatorioDoDia }) {
  return (
    <View break>
      <Text style={estilos.secao}>Cada pergunta do dia</Text>
      <Text style={[estilos.nota, { marginBottom: 6 }]}>
        Em ordem de horário. A situação vem do sistema; a área e o comentário, da IA.
      </Text>

      <View
        fixed
        style={{
          flexDirection: "row",
          borderBottomWidth: 1,
          borderBottomColor: TINTA.linha,
          paddingBottom: 3,
          marginBottom: 3,
        }}
      >
        <Text style={[estilos.negrito, { width: COLUNAS.hora }]}>Hora</Text>
        <Text style={[estilos.negrito, { width: COLUNAS.pergunta }]}>Pergunta</Text>
        <Text style={[estilos.negrito, { width: COLUNAS.area }]}>Área</Text>
        <Text style={[estilos.negrito, { width: COLUNAS.situacao }]}>Situação</Text>
        <Text style={[estilos.negrito, { width: COLUNAS.comentario }]}>Comentário da IA</Text>
      </View>

      {relatorio.perguntas.map((p) => (
        <View
          key={p.perguntaId}
          wrap={false}
          style={{
            flexDirection: "row",
            paddingVertical: 3,
            borderBottomWidth: 0.5,
            borderBottomColor: TINTA.linha,
            fontSize: 8.5,
          }}
        >
          <Text style={{ width: COLUNAS.hora }}>{hora(p.em)}</Text>
          <View style={{ width: COLUNAS.pergunta, paddingRight: 6 }}>
            <Text>{p.pergunta}</Text>
            <Text style={{ color: TINTA.fraca, fontSize: 7.5 }}>
              {p.participante}
              {p.feedback === "up" ? ", voto positivo" : p.feedback === "down" ? ", voto negativo" : ""}
            </Text>
          </View>
          <Text style={{ width: COLUNAS.area, paddingRight: 6 }}>{p.area ?? "Sem área"}</Text>
          <Text
            style={{
              width: COLUNAS.situacao,
              color:
                p.situacao === "respondida" ? TINTA.primaria : p.situacao === "sem_resposta" ? TINTA.atencao : TINTA.erro,
            }}
          >
            {ROTULO_SITUACAO[p.situacao]}
          </Text>
          <Text style={{ width: COLUNAS.comentario, color: TINTA.secundaria }}>
            {p.causa && p.causa !== "respondida" ? `${ROTULO_CAUSA[p.causa]}. ` : ""}
            {p.comentario}
          </Text>
        </View>
      ))}
    </View>
  );
}
