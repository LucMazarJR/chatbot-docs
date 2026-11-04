import { Document, Page, Text, View } from "@react-pdf/renderer";

import { dataEHora, dataPorExtenso, hora } from "@/lib/datas";
import {
  COR_DA_BARRA,
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

export function RelatorioPdf({ relatorio }: { relatorio: RelatorioDoDia }) {
  const n = relatorio.numeros;
  const dia = diaDoRelatorio(relatorio.data);

  return (
    <Document title={`Relatório do dia ${dia}`} author="Painel PET-Saúde" language="pt-BR">
      <Page size="A4" style={estilos.pagina}>
        <Text style={estilos.titulo}>Relatório do dia: {dia}</Text>
        <Text style={estilos.subtitulo}>
          Assistente de Saúde do PET-Saúde. Gerado em{" "}
          {dataEHora(relatorio.terminadoEm ?? relatorio.iniciadoEm)} por {relatorio.atorNome}. Os
          números são contados pelo sistema; a classificação de cada pergunta e o resumo são
          escritos por IA ({relatorio.modelo ?? "modelo não registrado"}).
        </Text>

        {n && n.perguntas > 0 ? (
          <>
            <Numeros relatorio={relatorio} />
            <PrincipaisPontos relatorio={relatorio} />
            <PontosImportantes relatorio={relatorio} />
            <Areas relatorio={relatorio} />
            <Comentarios relatorio={relatorio} />
          </>
        ) : (
          <Text>Nenhuma pergunta foi feita ao chatbot neste dia.</Text>
        )}

        <Rodape texto={`Assistente de Saúde PET-Saúde · Relatório do dia ${dia}`} />
      </Page>

      {/* A tabela numa página própria do documento. Dentro da mesma página,
          com `break` e o cabeçalho repetido, a biblioteca errava a conta na
          quebra e o PDF inteiro falhava com "unsupported number". */}
      {n && n.perguntas > 0 ? (
        <Page size="A4" style={estilos.pagina}>
          <Perguntas relatorio={relatorio} />
          <Rodape texto={`Assistente de Saúde PET-Saúde · Relatório do dia ${dia}`} />
        </Page>
      ) : null}
    </Document>
  );
}

function Cartao({ rotulo, valor, contexto }: { rotulo: string; valor: string; contexto: string }) {
  return (
    // Largura fixa em vez de flex com `gap`: a biblioteca de PDF calcula mal o
    // `gap` combinado com porcentagem e devolvia "unsupported number" ao montar.
    <View style={[estilos.caixa, { width: "24%" }]}>
      <Text style={estilos.nota}>{rotulo}</Text>
      <Text
        style={{ fontSize: 17, fontFamily: "Helvetica-Bold", lineHeight: 1.25, marginVertical: 3 }}
      >
        {valor}
      </Text>
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
        (n.notaMedia != null
          ? `, nota média ${n.notaMedia.toFixed(1).replace(".", ",")} de 5`
          : "") +
        (n.npsMedio != null
          ? `, recomendação média ${n.npsMedio.toFixed(1).replace(".", ",")} de 10`
          : "")
      : "nenhuma avaliação no fim da conversa",
    n.aceitaramSemPerguntar > 0
      ? `${plural(
          n.aceitaramSemPerguntar,
          "pessoa aceitou os termos e não fez",
          "pessoas aceitaram os termos e não fizeram",
        )} pergunta nenhuma`
      : null,
  ].filter(Boolean);

  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
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

function PrincipaisPontos({ relatorio }: { relatorio: RelatorioDoDia }) {
  if (relatorio.destaques.length === 0 && !relatorio.resumo) return null;
  return (
    <View wrap={false}>
      <Text style={estilos.secao}>Principais pontos</Text>
      {relatorio.destaques.map((frase) => (
        <View key={frase} style={{ flexDirection: "row", marginBottom: 2 }}>
          <Text style={{ width: 10 }}>•</Text>
          <Text style={{ flex: 1 }}>{frase}</Text>
        </View>
      ))}
      {relatorio.resumo ? (
        <View style={[estilos.caixa, { marginTop: 6 }]}>
          <Text>{relatorio.resumo}</Text>
          <Text style={[estilos.nota, { marginTop: 2 }]}>
            Leitura da IA. As frases de cima e os números são contados pelo sistema.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const COLUNAS_DOS_PONTOS = { tema: "46%", perguntas: "12%", fazer: "42%" };

function PontosImportantes({ relatorio }: { relatorio: RelatorioDoDia }) {
  if (relatorio.escopos.length === 0) return null;

  return (
    <View>
      <Text style={estilos.secao}>Pontos importantes</Text>
      <View
        style={{
          flexDirection: "row",
          borderBottomWidth: 1,
          borderBottomColor: TINTA.linha,
          paddingBottom: 3,
          marginBottom: 2,
        }}
      >
        <Text style={[estilos.negrito, { width: COLUNAS_DOS_PONTOS.tema }]}>Tema</Text>
        <Text style={[estilos.negrito, { width: COLUNAS_DOS_PONTOS.perguntas }]}>Perguntas</Text>
        <Text style={[estilos.negrito, { width: COLUNAS_DOS_PONTOS.fazer }]}>O que fazer</Text>
      </View>
      {relatorio.escopos.map((e, i) => (
        <View
          key={`${e.tema}-${i}`}
          wrap={false}
          style={{
            flexDirection: "row",
            paddingVertical: 4,
            borderBottomWidth: 0.5,
            borderBottomColor: TINTA.linha,
          }}
        >
          <View style={{ width: COLUNAS_DOS_PONTOS.tema, paddingRight: 8 }}>
            <Text style={estilos.negrito}>
              {i + 1}. {e.tema}
            </Text>
            {e.motivo ? <Text style={[estilos.nota, { marginTop: 1 }]}>{e.motivo}</Text> : null}
            <Text style={[estilos.nota, { marginTop: 2, color: TINTA.fraca }]}>
              Ex.:{" "}
              {e.perguntas
                .slice(0, 3)
                .map((indice) => `"${relatorio.perguntas[indice]?.pergunta ?? ""}"`)
                .join("; ")}
              {e.perguntas.length > 3 ? ` e mais ${e.perguntas.length - 3}` : ""}
            </Text>
          </View>
          <Text style={{ width: COLUNAS_DOS_PONTOS.perguntas }}>{e.perguntas.length}</Text>
          <Text style={{ width: COLUNAS_DOS_PONTOS.fazer }}>
            {e.sugestao || "Sem sugestão da IA."}
          </Text>
        </View>
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
    <View style={{ flexDirection: "row", marginBottom: 6 }}>
      {itens.map((item) => (
        <View
          key={item.rotulo}
          style={{ flexDirection: "row", alignItems: "center", marginRight: 12 }}
        >
          <View
            style={{
              width: 8,
              height: 8,
              marginRight: 4,
              borderRadius: 2,
              backgroundColor: item.cor,
            }}
          />
          <Text style={estilos.nota}>{item.rotulo}</Text>
        </View>
      ))}
    </View>
  );
}

/** A barra mais longa, em pontos: 36% da largura útil de uma página A4. */
const LARGURA_DA_BARRA = 185;
const ESPACO_ENTRE_PARTES = 1.5;

function Areas({ relatorio }: { relatorio: RelatorioDoDia }) {
  if (relatorio.porArea.length === 0) return null;
  const maior = Math.max(...relatorio.porArea.map((a) => a.total));

  return (
    // Quebra entre páginas por área, e não o bloco inteiro: inteiro, ele não
    // cabia no resto da página e deixava a anterior quase vazia.
    <View>
      <View minPresenceAhead={60}>
        <Text style={estilos.secao}>Perguntas por área</Text>
        <Legenda />
      </View>
      {relatorio.porArea.map((a) => {
        const partes = [
          { valor: a.respondidas, cor: COR_DA_BARRA.respondidas },
          { valor: a.semResposta, cor: COR_DA_BARRA.semResposta },
          { valor: a.falhas, cor: COR_DA_BARRA.falhas },
        ].filter((p) => p.valor > 0);
        return (
          <View key={a.area} style={{ marginBottom: 5 }} wrap={false}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ width: 175, paddingRight: 6 }}>{a.area}</Text>
              {/* Larguras em pontos, calculadas aqui. Com flexGrow, flexBasis 0
                  e gap, a biblioteca de PDF errava a conta e o PDF inteiro
                  falhava com "unsupported number". */}
              <View style={{ width: LARGURA_DA_BARRA, flexDirection: "row" }}>
                {partes.map((p, i) => {
                  const ultima = i === partes.length - 1;
                  const largura =
                    (p.valor / maior) * LARGURA_DA_BARRA - (ultima ? 0 : ESPACO_ENTRE_PARTES);
                  return (
                    <View
                      key={p.cor}
                      style={{
                        width: Math.max(1, largura),
                        marginRight: ultima ? 0 : ESPACO_ENTRE_PARTES,
                        height: 9,
                        backgroundColor: p.cor,
                        // Ponta arredondada só no fim da barra; a base fica reta.
                        borderTopRightRadius: ultima ? 2 : 0,
                        borderBottomRightRadius: ultima ? 2 : 0,
                      }}
                    />
                  );
                })}
              </View>
              <Text style={{ flex: 1, paddingLeft: 8, color: TINTA.secundaria }}>
                {plural(a.total, "pergunta", "perguntas")}
                {a.semResposta > 0 ? `, ${a.semResposta} sem resposta` : ""}
                {a.falhas > 0 ? `, ${a.falhas} falharam` : ""}
              </Text>
            </View>
            {a.nota ? <Text style={[estilos.nota, { marginTop: 1 }]}>{a.nota}</Text> : null}
          </View>
        );
      })}
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
    <>
      <Text style={[estilos.secao, { marginTop: 0 }]}>Cada pergunta do dia</Text>
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
              {p.feedback === "up"
                ? ", voto positivo"
                : p.feedback === "down"
                  ? ", voto negativo"
                  : ""}
            </Text>
          </View>
          <Text style={{ width: COLUNAS.area, paddingRight: 6 }}>{p.area ?? "Sem área"}</Text>
          <Text
            style={{
              width: COLUNAS.situacao,
              color:
                p.situacao === "respondida"
                  ? TINTA.primaria
                  : p.situacao === "sem_resposta"
                    ? TINTA.atencao
                    : TINTA.erro,
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
    </>
  );
}
