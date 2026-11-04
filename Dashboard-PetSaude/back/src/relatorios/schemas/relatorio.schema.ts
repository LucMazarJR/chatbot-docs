import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RelatorioDocument = Relatorio & Document;

export type EstadoRelatorio = 'rodando' | 'concluido' | 'erro' | 'cota_esgotada';

/** Uma pergunta do dia, com o que o banco registrou e o que o modelo disse dela. */
@Schema({ _id: false })
export class PerguntaDoRelatorio {
    @Prop()
    perguntaId: string;

    @Prop({ type: String, default: null })
    respostaId: string | null;

    @Prop()
    sessaoId: string;

    /** O nome da sessão ("Participante 7"), e nunca a conta dona dela. */
    @Prop()
    participante: string;

    @Prop()
    em: Date;

    /** A pergunta como o cidadão escreveu, congelada aqui. */
    @Prop()
    pergunta: string;

    @Prop({ type: String })
    situacao: string;

    @Prop({ type: String, default: null })
    feedback: string | null;

    @Prop({ type: Number, default: null })
    latenciaMs: number | null;

    // Os quatro abaixo vêm do modelo, já conferidos pelo `sanearClassificacao`.
    // Ficam vazios enquanto a análise não termina.

    @Prop({ type: String, default: null })
    area: string | null;

    @Prop({ type: String, default: null })
    publico: string | null;

    @Prop({ type: String, default: null })
    causa: string | null;

    @Prop({ default: '' })
    comentario: string;
}

export const PerguntaDoRelatorioSchema = SchemaFactory.createForClass(PerguntaDoRelatorio);

@Schema({ _id: false })
export class EscopoDoRelatorio {
    @Prop()
    tema: string;

    /** Posições em `perguntas`, base 0. */
    @Prop({ type: [Number], default: [] })
    perguntas: number[];

    @Prop({ default: '' })
    motivo: string;

    @Prop({ default: '' })
    sugestao: string;
}

export const EscopoDoRelatorioSchema = SchemaFactory.createForClass(EscopoDoRelatorio);

@Schema({ _id: false })
export class AreaDoRelatorio {
    @Prop({ type: String })
    area: string;

    @Prop()
    total: number;

    @Prop()
    respondidas: number;

    @Prop()
    semResposta: number;

    @Prop()
    falhas: number;

    /** O que a IA disse da área: o resumo por grande assunto. */
    @Prop({ default: '' })
    nota?: string;
}

export const AreaDoRelatorioSchema = SchemaFactory.createForClass(AreaDoRelatorio);

/**
 * Um relatório do dia, gerado a pedido.
 *
 * LÓGICA DO LUCIANO: é um acionamento de IA sobre texto de cidadão, e por isso
 * guarda a ENTRADA e não só o resultado, como a rodada da curadoria: as
 * perguntas que foram ao modelo ficam copiadas aqui, e a resposta crua dele
 * também. Sem isso, um relatório que classificou errado não teria como ser
 * conferido depois.
 *
 * Por ser cópia, a exclusão de uma conversa precisa alcançar este documento. As
 * duas portas de exclusão (o chat e a transcrição do painel) trocam a pergunta
 * e o comentário pela marca de apagada, e a resposta crua inteira.
 */
@Schema({ collection: 'relatorios_ia', timestamps: false })
export class Relatorio {
    /** O dia analisado, AAAA-MM-DD, no fuso da equipe. */
    @Prop()
    data: string;

    @Prop({ type: String, default: 'rodando' })
    estado: EstadoRelatorio;

    @Prop({ default: () => new Date() })
    iniciadoEm: Date;

    @Prop()
    terminadoEm?: Date;

    @Prop()
    atorNome: string;

    @Prop()
    atorId?: string;

    @Prop()
    modelo?: string;

    @Prop()
    jobId?: string;

    /** Contados do banco pelo `calcularNumeros`. O modelo não escreve número. */
    @Prop({ type: Object, default: null })
    numeros: Record<string, unknown> | null;

    @Prop({ type: [AreaDoRelatorioSchema], default: [] })
    porArea: AreaDoRelatorio[];

    @Prop({ type: Object, default: null })
    porCausa: Record<string, number> | null;

    @Prop({ type: [EscopoDoRelatorioSchema], default: [] })
    escopos: EscopoDoRelatorio[];

    /** As frases do topo, escritas pelo código a partir das contagens. */
    @Prop({ type: [String], default: [] })
    destaques: string[];

    @Prop({ default: '' })
    resumo: string;

    @Prop({ type: [PerguntaDoRelatorioSchema], default: [] })
    perguntas: PerguntaDoRelatorio[];

    /** O JSON de cada chamada ao modelo, como texto, na ordem em que saíram. */
    @Prop({ default: '' })
    respostaBruta: string;

    @Prop({ type: String, default: null })
    erro: string | null;
}

export const RelatorioSchema = SchemaFactory.createForClass(Relatorio);

RelatorioSchema.index({ iniciadoEm: -1 });
// A exclusão de uma conversa procura as cópias pela sessão.
RelatorioSchema.index({ 'perguntas.sessaoId': 1 });
