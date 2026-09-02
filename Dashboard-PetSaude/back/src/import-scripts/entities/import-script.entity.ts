import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Script de geração de FAQs — o que transforma um documento em pares P/R.
 *
 * LÓGICA DO LUCIANO: mora no Postgres, não no Mongo, pela mesma razão dos
 * usuários — a coleção faq_medicamentos é contrato compartilhado com a ingestão
 * Python e com o fluxo do n8n, e código de tela não entra lá.
 *
 * Cada gravação cria uma LINHA NOVA, com version + 1, e desativa a anterior.
 * Sobrescrever seria mais simples e estaria errado: cada FAQ importada guarda o
 * id e a versão do script que a gerou, e sem o histórico esse par apontaria
 * para um código que não existe mais. É também o que permite voltar atrás
 * quando um script novo sai pior que o antigo — descobrir isso costuma levar
 * dias, tempo suficiente para ninguém lembrar o que foi mudado.
 *
 * O servidor guarda e devolve o código. Nunca o executa: quem executa é o
 * navegador, num iframe de origem nula com a rede cortada por CSP.
 */
@Entity('import_scripts')
export class ImportScript {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'name', type: 'varchar', length: 120 })
    name: string;

    // text, não varchar: um parser com comentários passa fácil de 8 KB, e o
    // teto de verdade é o do DTO (256 KB), verificado antes de chegar aqui.
    @Column({ name: 'code', type: 'text' })
    code: string;

    @Column({ name: 'version', type: 'integer' })
    version: number;

    @Index()
    @Column({ name: 'is_active', type: 'boolean', default: false })
    isActive: boolean;

    /** Anotação de quem gravou: o que mudou e por quê. */
    @Column({ name: 'notes', type: 'varchar', length: 500, nullable: true })
    notes: string | null;

    @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
    createdById: string | null;

    // O nome fica gravado ao lado do id de propósito, como nas FAQs: quem lê
    // este histórico não alcança a tabela de usuários, e um uuid solto não diz
    // nada. E o usuário pode ter sido desativado desde então.
    @Column({ name: 'created_by_name', type: 'varchar', length: 120, nullable: true })
    createdByName: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}

/** O que sai na listagem: tudo menos o código, que é grande. */
export type ImportScriptResumo = {
    id: string;
    name: string;
    version: number;
    isActive: boolean;
    notes: string | null;
    createdByName: string | null;
    createdAt: Date;
    /** Tamanho do código em bytes, para a tela mostrar algo sem baixar tudo. */
    codeSize: number;
};

export function toResumo(script: ImportScript): ImportScriptResumo {
    return {
        id: script.id,
        name: script.name,
        version: script.version,
        isActive: script.isActive,
        notes: script.notes ?? null,
        createdByName: script.createdByName ?? null,
        createdAt: script.createdAt,
        codeSize: Buffer.byteLength(script.code, 'utf8'),
    };
}
