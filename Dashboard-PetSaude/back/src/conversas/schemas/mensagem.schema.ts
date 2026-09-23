import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MensagemDocument = Mensagem & Document;

export type Papel = 'user' | 'bot';
export type Voto = 'up' | 'down';

/**
 * Um trecho que a busca vetorial devolveu, com o veredito do filtro de score.
 *
 * É o que liga a conversa às FAQs que a geraram: `faqId` aponta para o
 * documento em ministerio_saude.faq_medicamentos, e a tela de revisão usa isso
 * para levar de uma resposta ruim direto à FAQ que precisa ser corrigida.
 */
@Schema({ _id: false })
export class TrechoDebug {
    @Prop()
    score: number;

    @Prop()
    usado: boolean;

    @Prop({ type: String, default: null })
    faqId: string | null;

    @Prop({ type: String, default: null })
    category: string | null;

    @Prop({ type: String, default: null })
    question: string | null;

    @Prop({ type: String, default: null })
    previa: string | null;
}

export const TrechoDebugSchema = SchemaFactory.createForClass(TrechoDebug);

// Espelha 1:1 o que o protótipo PWA grava em pwa_prototipo.mensagens. O dono do
// formato é o PWA (pwa/src/lib/tipos.ts); aqui é leitura.
@Schema({ collection: 'mensagens', timestamps: false })
export class Mensagem {
    @Prop({ type: String })
    _id: string;

    @Prop()
    sessaoId: string;

    @Prop()
    papel: Papel;

    @Prop()
    texto: string;

    @Prop()
    em: Date;

    @Prop()
    correlationId: string;

    /** A resposta ainda não voltou do n8n. Só existe em mensagens do bot. */
    @Prop({ default: false })
    pendente: boolean;

    // Daqui para baixo, só nas mensagens do bot.

    @Prop()
    latenciaMs: number;

    @Prop({ type: Boolean, default: null })
    temContexto: boolean | null;

    @Prop({ type: Number, default: null })
    qtdTrechos: number | null;

    @Prop({ type: [TrechoDebugSchema], default: [] })
    trechosDebug: TrechoDebug[];

    @Prop({ type: Number, default: null })
    limiarScore: number | null;

    @Prop({ type: String, default: null })
    modelo: string | null;

    /** O agente respondeu o texto de "não encontrei": lacuna de conteúdo. */
    @Prop({ default: false })
    semResposta: boolean;

    /**
     * Onde esta lacuna está na fila de curadoria.
     *
     * LÓGICA DO LUCIANO: é o ÚNICO campo desta coleção que não vem do PWA: quem
     * escreve é o job de curadoria daqui. Está gravado junto da mensagem, e não
     * numa coleção à parte, porque a pergunta é "esta lacuna já foi tratada?", e
     * a resposta pertence à lacuna. Uma tabela de controle separada precisaria
     * ser mantida em sincronia com mensagens que podem ser apagadas junto com o
     * protótipo.
     *
     * Ausente quer dizer pendente: as mensagens que já existiam antes deste
     * campo são lacunas legítimas e precisam entrar na fila.
     */
    @Prop({ type: String, default: null })
    curadoria: 'pendente' | 'processada' | 'descartada' | null;

    @Prop({ default: false })
    erro: boolean;

    @Prop({ type: String, default: null })
    motivoErro: string | null;

    @Prop({ type: String, default: null })
    feedback: Voto | null;

    @Prop({ type: String, default: null })
    feedbackComentario: string | null;

    @Prop()
    feedbackEm: Date;
}

export const MensagemSchema = SchemaFactory.createForClass(Mensagem);

// Montar uma transcrição é ler todas as mensagens de uma sessão em ordem.
MensagemSchema.index({ sessaoId: 1, em: 1 });
MensagemSchema.index({ feedback: 1 });
MensagemSchema.index({ semResposta: 1 });

// A fila de curadoria: lacunas ainda não tratadas, mais antigas primeiro.
MensagemSchema.index({ semResposta: 1, curadoria: 1, em: 1 });

// O job precisa achar a pergunta do cidadão a partir da resposta do bot, e o
// par é o correlationId: um por troca.
MensagemSchema.index({ correlationId: 1 });
