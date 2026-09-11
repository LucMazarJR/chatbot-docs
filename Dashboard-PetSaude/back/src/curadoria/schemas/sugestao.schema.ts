import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SugestaoDocument = Sugestao & Document;

export type EstadoSugestao = 'pendente' | 'aprovada' | 'descartada';
export type TipoSugestao = 'nova' | 'complemento';

/**
 * De qual conversa saiu a pergunta que originou a sugestão.
 *
 * LÓGICA DO LUCIANO: é o pedido que motivou a fase inteira — "boa rastreabilidade
 * pra qual chat deu problema". Sem isto, a sugestão chega à tela de aprovação
 * como uma frase sem contexto, e quem revisa não tem como saber se a pessoa
 * perguntava sobre agendamento ou sobre o resultado de um exame. O texto da
 * pergunta fica gravado aqui junto do id porque o protótipo é descartável: se o
 * banco dele sumir, a sugestão ainda diz de onde veio.
 */
@Schema({ _id: false })
export class OrigemSugestao {
    @Prop()
    sessaoId: string;

    @Prop()
    mensagemId: string;

    /** A pergunta como o cidadão escreveu, sem correção. */
    @Prop()
    pergunta: string;

    @Prop()
    em: Date;
}

export const OrigemSugestaoSchema = SchemaFactory.createForClass(OrigemSugestao);

/**
 * Uma FAQ proposta a partir de perguntas que o chatbot não soube responder.
 *
 * Mora em ministerio_saude, e não no banco do protótipo, de propósito: a
 * conversa é dado de validação e some com o protótipo; a sugestão é material da
 * base de conteúdo e precisa sobreviver a ele.
 */
@Schema({ collection: 'sugestoes_faq', timestamps: false })
export class Sugestao {
    @Prop({ default: 'pendente', index: true })
    estado: EstadoSugestao;

    /** `complemento` quer dizer que já existe FAQ do assunto e ela é que falha. */
    @Prop({ default: 'nova' })
    tipo: TipoSugestao;

    /** A pergunta canônica proposta, que vira a `question` da FAQ. */
    @Prop({ required: true })
    pergunta: string;

    /**
     * Rascunho da resposta, extraído das FAQs vizinhas.
     *
     * LÓGICA DO LUCIANO: vem VAZIO quando as FAQs fornecidas não continham a
     * informação, e o prompt exige isso explicitamente. A diferença é séria: se
     * o modelo pudesse inventar orientação de saúde, a tela de aprovação viraria
     * um botão para publicar texto inventado sobre medicamento na voz do
     * Ministério. Vazio aqui significa "isto é conteúdo que falta de verdade" —
     * que é exatamente a conclusão a que os dados do primeiro teste chegaram.
     */
    @Prop({ default: '' })
    rascunhoResposta: string;

    @Prop({ type: String, default: null })
    categoriaSugerida: string | null;

    @Prop({ type: [String], default: [] })
    tagsSugeridas: string[];

    /** Para `complemento`: a FAQ que já cobre o assunto e precisa ser ampliada. */
    @Prop({ type: String, default: null })
    faqRelacionadaId: string | null;

    /** Por que o modelo agrupou estas perguntas, em uma frase. */
    @Prop({ default: '' })
    justificativa: string;

    @Prop({ type: [OrigemSugestaoSchema], default: [] })
    origens: OrigemSugestao[];

    @Prop({ default: () => new Date() })
    criadaEm: Date;

    /** Quem disparou o job. A sugestão é da máquina; a decisão de rodar é de alguém. */
    @Prop()
    criadaPor?: string;

    @Prop()
    modelo?: string;

    @Prop()
    decididaEm?: Date;

    @Prop()
    decididaPor?: string;

    /** Preenchido quando a aprovação virou FAQ, para fechar o rastro. */
    @Prop({ type: String, default: null })
    faqCriadaId: string | null;
}

export const SugestaoSchema = SchemaFactory.createForClass(Sugestao);

// A tela lista as pendentes, mais recentes primeiro.
SugestaoSchema.index({ estado: 1, criadaEm: -1 });
