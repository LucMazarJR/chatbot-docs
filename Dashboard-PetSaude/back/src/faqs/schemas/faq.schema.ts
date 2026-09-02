import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FaqDocument = Faq & Document;

@Schema({ collection: 'faq_medicamentos', timestamps: false })
// LÓGICA DO LUCIANO: O Schema do Mongoose abaixo possui tipagem 1:1 com os dados
// enviados ao Mongo pelo script 'enviar_dados.py'.
export class Faq {
    @Prop({ required: true })
    question: string;

    @Prop()
    question_normalized: string;

    @Prop({ required: true })
    answer: string;

    @Prop()
    category: string;

    @Prop({ type: [String], default: [] })
    tags: string[];

    @Prop()
    source: string;

    @Prop()
    file_id: string;

    @Prop()
    file_origin: string;

    @Prop()
    line_reference: number;

    @Prop()
    content_hash: string;

    @Prop({ default: true })
    isActive: boolean;

    @Prop({ default: () => new Date() })
    updatedAt: Date;

    @Prop()
    created_by?: string;

    @Prop()
    updated_by?: string;

    // LÓGICA DO LUCIANO: o NOME continua gravado ao lado do id de propósito.
    // Esta coleção é lida pelo n8n e pela ingestão Python, e nenhum dos dois
    // alcança o Postgres — um uuid solto ali não diria nada a ninguém.
    @Prop()
    created_by_id?: string;

    @Prop()
    updated_by_id?: string;

    @Prop({ type: [Number], default: [] })
    embedding: number[];

    // LÓGICA DO LUCIANO: campo lido pelo nó Vector Store do n8n para montar o
    // `pageContent` do trecho. Sem ele o nó encontra o documento e devolve texto
    // vazio — a busca "funciona", o agente recebe nada e responde "não
    // encontrei", sem erro em lugar nenhum. Mesmo formato do enviar_dados.py.
    @Prop()
    text?: string;

    // LÓGICA DO LUCIANO: procedência do vetor. O `embedding_model` é o mesmo
    // campo que o scripts/reindexar_embeddings.py grava e consulta para saber o
    // que já está no modelo atual — sem ele, a única forma de descobrir em que
    // modelo a base está é re-embedar uma amostra e comparar por cosseno, porque
    // a dimensão não distingue (o gemini-embedding-001 também produz 3072).
    @Prop()
    embedding_model?: string;

    @Prop()
    embedding_dim?: number;

    @Prop()
    embedded_at?: Date;

    // LÓGICA DO LUCIANO: o content_hash que o vetor representa. Quando a edição
    // muda o texto mas a chamada ao Gemini falha, o documento fica com conteúdo
    // novo e vetor velho — o chatbot encontra a FAQ pelo texto antigo e mostra o
    // novo, sem erro em lugar nenhum. Com este campo isso vira uma consulta:
    // embedding_content_hash != content_hash significa vetor desatualizado.
    @Prop()
    embedding_content_hash?: string;

    // LÓGICA DO LUCIANO: qual script de geração produziu esta FAQ, e em que
    // versão. Guardar a VERSÃO, e não só o id, é o que permite descobrir depois
    // que um lote inteiro saiu torto por causa de uma regra que já foi trocada.
    // O par file_id/file_origin continua dizendo de onde veio o conteúdo
    // ("dashboard_import" + nome do arquivo); estes dois dizem por qual regra
    // ele passou.
    @Prop()
    import_script_id?: string;

    @Prop()
    import_script_version?: number;
}

export const FaqSchema = SchemaFactory.createForClass(Faq);

// LÓGICA DO LUCIANO: caminhos da listagem paginada. O primeiro cobre a home
// (ativas, mais recentes primeiro) e o segundo o filtro por categoria.
//
// A busca por texto continua varrendo: um $regex não ancorado não usa índice.
// Com ~2500 documentos isso são milissegundos, e um índice $text não
// resolveria — ele faz prefixo e radical, não trecho, e viraria uma segunda
// semântica de busca para manter em sincronia com o enviar_dados.py.
//
// NÃO confundir com o vector_index_3072: aquele é um Atlas Search index,
// criado pelo script Python e consumido pelo n8n. Namespaces independentes.
// O _id faz parte do indice porque faz parte da ORDENACAO.
//
// LOGICA DO LUCIANO: a listagem ordena por { updatedAt: -1, _id: -1 } -- o _id
// entrou como criterio de desempate porque a ingestao grava lotes inteiros com
// o mesmo updatedAt, e sem ele as paginas repetiam linhas. Mas os indices nao
// tinham o _id, entao o Mongo nao conseguia satisfazer a ordenacao pelo indice
// e caia em ordenacao EM MEMORIA da colecao inteira: 2451 documentos que
// carregam um vetor de 3072 numeros cada.
//
// Numa pagina qualquer isso e so lento. Nas ultimas, com o skip somando, a
// consulta ficava na fronteira do tempo limite e falhava de forma intermitente:
// as perguntas apareciam, sumiam, e voltavam sozinhas na tentativa seguinte.
FaqSchema.index({ isActive: 1, updatedAt: -1, _id: -1 });
FaqSchema.index({ isActive: 1, category: 1, updatedAt: -1, _id: -1 });

// Filtros novos da listagem. Sem indice, cada um vira varredura da colecao
// inteira -- e ela cresce a cada importacao em lote.
FaqSchema.index({ isActive: 1, tags: 1, updatedAt: -1, _id: -1 });
FaqSchema.index({ isActive: 1, file_id: 1, updatedAt: -1, _id: -1 });
