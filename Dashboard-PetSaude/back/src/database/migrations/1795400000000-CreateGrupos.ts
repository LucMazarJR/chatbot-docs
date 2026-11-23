import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Troca os três papéis fixos por grupos com permissão por item do menu.
 *
 * Cada papel antigo vira um grupo com o mesmo acesso, e cada conta entra no
 * grupo do papel que tinha: ninguém ganha nem perde acesso com a migração. A
 * única diferença é o Leitor, que agora abre Categorias de verdade: o menu já
 * mostrava o item, mas a consulta era recusada.
 *
 * A coluna `role` fica no banco, sem uso pelo back novo. O banco de produção
 * recebe esta migração antes do deploy, e o back antigo, que ainda lê `role`,
 * continua funcionando até ser substituído. Apagar a coluna é outra migração.
 *
 * As permissões estão escritas aqui por extenso, e não importadas de
 * `grupos/areas.ts`: a migração precisa dar o mesmo resultado amanhã, mesmo que
 * o catálogo de áreas mude.
 */
export class CreateGrupos1795400000000 implements MigrationInterface {
    name = 'CreateGrupos1795400000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "grupos" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "nome" character varying(60) NOT NULL,
                "descricao" character varying(200) NOT NULL DEFAULT '',
                "permissoes" jsonb NOT NULL DEFAULT '{}'::jsonb,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_grupos" PRIMARY KEY ("id")
            )
        `);

        // "Editor" e "editor" seriam dois grupos que ninguém distingue na lista.
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_grupos_nome" ON "grupos" (lower("nome"))`);

        await queryRunner.query(`
            INSERT INTO "grupos" ("nome", "descricao", "permissoes") VALUES
            ('Administrador', 'Acesso a todo o painel', '{"faqs":"editar","categorias":"editar","importar":"editar","conversas":"editar","unidades":"editar","curadoria":"editar","relatorios":"editar","avisos":"editar","usuarios":"editar","historico":"ver","configuracoes":"editar"}'),
            ('Editor', 'Escreve e importa FAQs', '{"faqs":"editar","categorias":"ver","importar":"editar"}'),
            ('Leitor', 'Consulta as FAQs e as categorias', '{"faqs":"ver","categorias":"ver"}')
        `);

        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "grupo_id" uuid`);
        await queryRunner.query(
            `ALTER TABLE "users" ADD COLUMN "master" boolean NOT NULL DEFAULT false`,
        );

        await queryRunner.query(`
            UPDATE "users" u SET "grupo_id" = g."id"
            FROM "grupos" g
            WHERE g."nome" = CASE u."role"
                WHEN 'admin' THEN 'Administrador'
                WHEN 'editor' THEN 'Editor'
                ELSE 'Leitor'
            END
        `);

        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "grupo_id" SET NOT NULL`);
        // RESTRICT: apagar um grupo com gente dentro deixaria contas sem acesso
        // definido. O serviço recusa antes, com uma frase; isto é a rede.
        await queryRunner.query(`
            ALTER TABLE "users" ADD CONSTRAINT "FK_users_grupo"
            FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE RESTRICT
        `);
        await queryRunner.query(`CREATE INDEX "IDX_users_grupo" ON "users" ("grupo_id")`);

        // O master é quem instalou o painel: a conta de administrador ativa mais
        // antiga, a que o seed criou. Ele passa o master adiante pela tela.
        await queryRunner.query(`
            UPDATE "users" SET "master" = true
            WHERE "id" = (
                SELECT "id" FROM "users"
                WHERE "role" = 'admin' AND "is_active"
                ORDER BY "created_at" ASC
                LIMIT 1
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // O back dos grupos não grava `role`: conta criada ou movida depois da
        // migração teria o papel errado na volta. O papel sai do grupo atual.
        await queryRunner.query(`
            UPDATE "users" u SET "role" = CASE
                WHEN u."master" OR g."permissoes"->>'usuarios' = 'editar' THEN 'admin'
                WHEN g."permissoes"->>'faqs' = 'editar' THEN 'editor'
                ELSE 'leitor'
            END
            FROM "grupos" g
            WHERE g."id" = u."grupo_id"
        `);
        await queryRunner.query(`DROP INDEX "IDX_users_grupo"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_users_grupo"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "master"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "grupo_id"`);
        await queryRunner.query(`DROP INDEX "UQ_grupos_nome"`);
        await queryRunner.query(`DROP TABLE "grupos"`);
    }
}
