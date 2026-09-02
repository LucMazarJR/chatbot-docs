import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateImportScripts1755800200000 implements MigrationInterface {
    name = 'CreateImportScripts1755800200000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "import_scripts" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "name" character varying(120) NOT NULL,
                "code" text NOT NULL,
                "version" integer NOT NULL,
                "is_active" boolean NOT NULL DEFAULT false,
                "notes" character varying(500),
                "created_by_id" uuid,
                "created_by_name" character varying(120),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_import_scripts" PRIMARY KEY ("id")
            )
        `);

        // Índice parcial: o banco garante que existe no máximo UM script ativo.
        // Sem isto, uma corrida entre dois administradores salvando ao mesmo
        // tempo deixaria dois ativos, e a importação escolheria um deles ao
        // acaso — cada pessoa veria um parser diferente sem nada indicar isso.
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_import_scripts_ativo"
            ON "import_scripts" ("is_active") WHERE "is_active" = true
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_import_scripts_version" ON "import_scripts" ("version")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "UQ_import_scripts_version"`);
        await queryRunner.query(`DROP INDEX "UQ_import_scripts_ativo"`);
        await queryRunner.query(`DROP TABLE "import_scripts"`);
    }
}
