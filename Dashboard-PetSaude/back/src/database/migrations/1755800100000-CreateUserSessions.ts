import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserSessions1755800100000 implements MigrationInterface {
    name = 'CreateUserSessions1755800100000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "user_sessions" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "jti" character varying(64) NOT NULL,
                "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "revoked_at" TIMESTAMP WITH TIME ZONE,
                "user_agent" character varying(255),
                "ip" character varying(64),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_user_sessions" PRIMARY KEY ("id"),
                CONSTRAINT "FK_user_sessions_user" FOREIGN KEY ("user_id")
                    REFERENCES "users"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_user_sessions_jti" ON "user_sessions" ("jti")`);
        // O guard consulta por jti a cada requisição; o índice por usuário
        // serve à revogação em massa quando alguém é desativado.
        await queryRunner.query(`CREATE INDEX "IDX_user_sessions_user" ON "user_sessions" ("user_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_user_sessions_user"`);
        await queryRunner.query(`DROP INDEX "UQ_user_sessions_jti"`);
        await queryRunner.query(`DROP TABLE "user_sessions"`);
    }
}
