import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsers1755800000000 implements MigrationInterface {
    name = 'CreateUsers1755800000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // gen_random_uuid() é nativa a partir do Postgres 13 — não precisa da
        // extensão pgcrypto.
        await queryRunner.query(`
            CREATE TABLE "users" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "name" character varying(120) NOT NULL,
                "email" character varying(160) NOT NULL,
                "password_hash" character varying(100) NOT NULL,
                "role" character varying(20) NOT NULL DEFAULT 'leitor',
                "is_active" boolean NOT NULL DEFAULT true,
                "must_change_password" boolean NOT NULL DEFAULT false,
                "last_login_at" TIMESTAMP WITH TIME ZONE,
                "created_by_id" uuid,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_users" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_users_email" ON "users" ("email")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "UQ_users_email"`);
        await queryRunner.query(`DROP TABLE "users"`);
    }
}
