import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Revisão por data das FAQs: a preferência de cada pessoa e a área nos grupos.
 *
 * `revisao_padrao_dias` é o "toda FAQ que eu criar já vem com revisão em N
 * dias", de Minha conta. Vazio é sem padrão, que é como todo mundo começa.
 *
 * A área Revisões entra nos grupos com o mesmo espírito da migração dos grupos:
 * quem já escrevia FAQ passa a revisar as próprias, e o Administrador revisa
 * todas. Grupo que o master já tenha montado com a área fica como está.
 */
export class RevisaoPadraoEArea1795500000000 implements MigrationInterface {
    name = 'RevisaoPadraoEArea1795500000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "revisao_padrao_dias" integer`);

        await queryRunner.query(`
            UPDATE "grupos" SET "permissoes" = "permissoes" || '{"revisoes":"editar"}'::jsonb
            WHERE "nome" = 'Administrador' AND NOT ("permissoes" ? 'revisoes')
        `);
        await queryRunner.query(`
            UPDATE "grupos" SET "permissoes" = "permissoes" || '{"revisoes":"ver"}'::jsonb
            WHERE "permissoes"->>'faqs' = 'editar' AND NOT ("permissoes" ? 'revisoes')
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`UPDATE "grupos" SET "permissoes" = "permissoes" - 'revisoes'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "revisao_padrao_dias"`);
    }
}
