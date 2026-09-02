import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ActivityDocument = Activity & Document;

/** O que foi mexido. Define também por quanto tempo o registro é guardado. */
export type TipoEntidade = 'faq' | 'usuario' | 'sessao' | 'regra_importacao' | 'sistema';

/** Registro de acesso vive menos que registro de alteração de conteúdo. */
export const RETENCAO_DIAS: Record<TipoEntidade, number> = {
    // Login, logout e tentativa recusada. São dados de acesso de pessoas
    // identificadas: guardar por 90 dias sustenta a finalidade de segurança da
    // informação sem virar um acervo permanente de rastreamento.
    sessao: 90,
    // Alteração de conteúdo é histórico editorial da base de FAQs, não
    // rastreamento de pessoa. Vale por muito mais tempo.
    faq: 730,
    regra_importacao: 730,
    // Criar conta, trocar papel, redefinir senha de terceiro. Fica entre os
    // dois: é ato administrativo, mas identifica pessoas.
    usuario: 365,
    sistema: 365,
};

@Schema({ collection: 'activities', timestamps: { createdAt: 'created_at', updatedAt: false } })
export class Activity {
    @Prop({ required: true })
    actor_name: string;

    // Id do usuário autenticado, quando houver. O nome continua gravado ao lado
    // porque o log precisa ser legível sem consultar outro banco.
    @Prop()
    actor_id?: string;

    @Prop({ required: true })
    action: string;

    /**
     * Descrição curta do alvo, para a tela mostrar sem consultar mais nada.
     *
     * Para FAQ é a pergunta; para usuário, o nome. Continua sendo texto livre
     * porque o registro precisa sobreviver ao alvo: se a FAQ for excluída ou a
     * pergunta reescrita, o histórico ainda diz sobre o que era.
     */
    @Prop()
    target: string;

    @Prop({ default: 'faq' })
    entity_type: TipoEntidade;

    /**
     * Id do que foi mexido.
     *
     * LÓGICA DO LUCIANO: sem isto o histórico era inútil para investigar. O
     * único ponteiro era `target`, o texto da pergunta — que muda justamente
     * quando alguém edita a pergunta, então duas linhas do histórico da MESMA
     * FAQ apareciam como coisas diferentes, e não havia como abrir a FAQ a
     * partir do registro.
     */
    @Prop()
    entity_id?: string;

    /**
     * Só os campos que mudaram, com o valor de antes e o de depois.
     *
     * O documento inteiro deixaria a coleção enorme e a tela ilegível. Guardar
     * a diferença é o que permite responder "o que essa pessoa mudou?", que é a
     * pergunta real quando algo sai errado, e é de onde sai o desfazer.
     */
    @Prop({ type: Object })
    before?: Record<string, unknown>;

    @Prop({ type: Object })
    after?: Record<string, unknown>;

    /**
     * Agrupa as linhas de uma mesma importação.
     *
     * Sem isto, importar uma planilha de 2000 linhas gravava 2000 registros de
     * "inserir" indistinguíveis de 2000 inserções manuais, e afogava o histórico
     * inteiro. Com o id do lote, a tela mostra uma linha por importação e abre o
     * detalhe só quando alguém pede.
     */
    @Prop()
    batch_id?: string;

    /** `negado` registra o que NÃO aconteceu: login recusado, acesso barrado. */
    @Prop({ default: 'sucesso' })
    status: 'sucesso' | 'negado';

    @Prop()
    ip?: string;

    @Prop()
    user_agent?: string;

    @Prop()
    created_at: Date;

    /**
     * Quando este registro deixa de existir.
     *
     * O Mongo apaga sozinho pelo índice TTL abaixo. É o que transforma "temos
     * um prazo de retenção" de intenção em mecanismo: sem isto, a coleção
     * cresceria para sempre e o prazo dependeria de alguém lembrar de limpar.
     */
    @Prop()
    expires_at?: Date;
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);

// A ordenação padrão da tela.
ActivitySchema.index({ created_at: -1 });

// LÓGICA DO LUCIANO: sem estes, qualquer filtro do painel varre a coleção
// inteira. Ela cresce a cada edição de FAQ e a cada login, então a varredura
// piora com o tempo — exatamente quando o histórico começa a ficar útil.
ActivitySchema.index({ actor_id: 1, created_at: -1 });
ActivitySchema.index({ entity_type: 1, created_at: -1 });
ActivitySchema.index({ entity_id: 1, created_at: -1 });
ActivitySchema.index({ batch_id: 1 });

// Expurgo automático. `expireAfterSeconds: 0` significa "apague quando a data
// em expires_at chegar" — o prazo é decidido por registro, na gravação, e não
// aqui, porque acesso e conteúdo têm prazos diferentes.
ActivitySchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
