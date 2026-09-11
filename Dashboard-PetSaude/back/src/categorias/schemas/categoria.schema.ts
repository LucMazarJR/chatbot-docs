import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CategoriaDocument = Categoria & Document;

/**
 * A lista fechada de assuntos.
 *
 * LÓGICA DO LUCIANO: até aqui categoria não era entidade — era um agregado
 * derivado, o resultado de um $group sobre o campo `category` das FAQs
 * (faqs.service.ts, getCategories). Quem "criava" uma categoria era quem
 * digitava um nome novo no formulário, e ninguém podia renomear ou aposentar
 * nada: a categoria existia enquanto houvesse uma FAQ apontando para ela, e
 * sumia sozinha quando a última fosse editada.
 *
 * Com a lista virando entidade, ela passa a existir antes das FAQs — que é o
 * que permite ao pessoal da saúde definir a taxonomia primeiro e ao formulário
 * oferecer escolhas em vez de campo livre.
 *
 * A coleção começa VAZIA de propósito. Nada aqui é gerado a partir das 236
 * categorias que a base tem hoje: quem decide quais assuntos existem é a área
 * de saúde, e uma lista pré-carregada com o que está lá seria justamente
 * carimbar a bagunça como oficial.
 */
@Schema({ collection: 'categorias', timestamps: false })
export class Categoria {
    /** A grafia oficial, com acento e maiúscula. É o que vai para a tela e para
     * o campo `category` das FAQs — e, por consequência, para o texto embedado. */
    @Prop({ required: true })
    nome: string;

    /** Forma canônica para comparação. Ver chaveDeCategoria. */
    @Prop({ required: true })
    chave: string;

    /** Para quem preenche o formulário saber o que entra aqui e o que não entra. */
    @Prop({ default: '' })
    descricao: string;

    /**
     * Categoria aposentada continua existindo, mas não é oferecida em
     * formulário novo.
     *
     * LÓGICA DO LUCIANO: apagar seria pior. As FAQs guardam o NOME da categoria,
     * não o id — é assim que a ingestão Python e o n8n leem a coleção, e mudar
     * isso quebraria os dois. Apagar a categoria deixaria as FAQs apontando para
     * um nome que não existe mais em lugar nenhum, sem nenhum registro de que
     * aquilo já foi legítimo. Desativar mantém a resposta para "o que era isso?"
     * e joga as FAQs afetadas para a lista de revisão, onde alguém decide.
     */
    @Prop({ default: true })
    ativa: boolean;

    @Prop({ default: () => new Date() })
    criadaEm: Date;

    @Prop()
    criadaPor?: string;

    @Prop()
    atualizadaEm?: Date;

    @Prop()
    atualizadaPor?: string;
}

export const CategoriaSchema = SchemaFactory.createForClass(Categoria);

// A trava contra o problema que motivou o módulo. Sem índice único, duas
// pessoas cadastrando "Exames" e "exames" no mesmo dia recriariam a duplicata
// que a chave existe para impedir — a verificação no service é uma corrida, o
// índice é a garantia.
CategoriaSchema.index({ chave: 1 }, { unique: true });
CategoriaSchema.index({ ativa: 1, nome: 1 });
