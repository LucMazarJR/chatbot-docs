import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RodadaDocument = Rodada & Document;

export type EstadoRodada = 'rodando' | 'concluida' | 'erro' | 'cota_esgotada';

/** Uma FAQ que a busca tinha devolvido para aquela pergunta, como estava na hora. */
@Schema({ _id: false })
export class VizinhaRegistrada {
    @Prop({ type: String, default: null })
    faqId: string | null;

    @Prop({ type: String, default: null })
    question: string | null;

    @Prop()
    score: number;
}

export const VizinhaRegistradaSchema = SchemaFactory.createForClass(VizinhaRegistrada);

/** Uma pergunta que entrou nesta rodada, com o que a busca tinha achado. */
@Schema({ _id: false })
export class LacunaRegistrada {
    @Prop()
    mensagemId: string;

    @Prop()
    sessaoId: string;

    /** A pergunta como o cidadão escreveu, congelada aqui. */
    @Prop()
    pergunta: string;

    @Prop({ type: [VizinhaRegistradaSchema], default: [] })
    vizinhas: VizinhaRegistrada[];
}

export const LacunaRegistradaSchema = SchemaFactory.createForClass(LacunaRegistrada);

/**
 * O registro de uma execução da curadoria.
 *
 * LÓGICA DO LUCIANO: sem isto, a única marca de que o modelo agiu seria a
 * sugestão que sobreviveu, e sugestão descartada some sem deixar rastro. Quem
 * olhasse depois veria FAQs criadas "pela curadoria" sem conseguir responder a
 * pergunta óbvia: com base em quê?
 *
 * Por isso a rodada guarda a ENTRADA, e não só o resultado. As perguntas ficam
 * copiadas aqui, com as FAQs que a busca tinha devolvido e os scores daquele
 * momento: a base muda, as conversas do protótipo são descartáveis, e sem a
 * cópia a decisão viraria inauditável em poucas semanas. É o mesmo princípio do
 * histórico de edição de FAQ: guardar o "antes", não só o "depois".
 *
 * A resposta crua do modelo fica junto porque é a única forma de distinguir
 * "o modelo errou" de "o código leu errado o que ele devolveu": foi
 * exatamente essa distinção que revelou o `faqRelacionada: "desconhecido"` no
 * primeiro ensaio com dados reais.
 */
@Schema({ collection: 'curadoria_rodadas', timestamps: false })
export class Rodada {
    @Prop({ default: 'rodando' })
    estado: EstadoRodada;

    @Prop({ default: () => new Date() })
    iniciadaEm: Date;

    @Prop()
    terminadaEm?: Date;

    /** Quem apertou o botão. A sugestão é da máquina; a decisão de rodar, não. */
    @Prop()
    atorNome: string;

    @Prop()
    atorId?: string;

    @Prop()
    modelo?: string;

    /** O id do job em memória, para casar com o andamento que a tela mostrou. */
    @Prop()
    jobId?: string;

    @Prop({ type: [LacunaRegistradaSchema], default: [] })
    lacunas: LacunaRegistrada[];

    /**
     * O JSON que o modelo devolveu, como texto.
     *
     * Guardado como string, e não como objeto: se o modelo devolver uma forma
     * inesperada, um campo tipado a descartaria em silêncio, e é justamente a
     * forma inesperada que se precisa poder ler depois.
     */
    @Prop({ default: '' })
    respostaBruta: string;

    @Prop({ type: [String], default: [] })
    sugestoesCriadas: string[];

    /** Perguntas encerradas por não serem sobre saúde. */
    @Prop({ type: [String], default: [] })
    foraDeEscopo: string[];

    @Prop({ type: String, default: null })
    erro: string | null;
}

export const RodadaSchema = SchemaFactory.createForClass(Rodada);

RodadaSchema.index({ iniciadaEm: -1 });
