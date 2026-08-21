import 'dotenv/config';
import * as bcrypt from 'bcryptjs';

import dataSource from '../data-source';
import { User } from '../../users/entities/user.entity';

/**
 * Cria o primeiro administrador, uma vez só.
 *
 * Por que script e não endpoint: um POST /auth/bootstrap fica para sempre na
 * superfície de ataque e alguém precisa lembrar de desativá-lo. E "só funciona
 * com a tabela vazia" falha aberto no dia em que alguém truncar a tabela.
 *
 * Por que não uma migration: o hash da senha ficaria versionado no git.
 *
 * Uso:
 *   ADMIN_NAME="Fulano" ADMIN_EMAIL=... ADMIN_PASSWORD=... pnpm run seed:admin
 */
async function main() {
    const nome = process.env.ADMIN_NAME?.trim();
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const senha = process.env.ADMIN_PASSWORD;

    if (!nome || !email || !senha) {
        console.error('Defina ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD no ambiente.');
        process.exit(1);
    }

    if (senha.length < 8) {
        console.error('A senha do administrador precisa ter ao menos 8 caracteres.');
        process.exit(1);
    }

    await dataSource.initialize();
    const repo = dataSource.getRepository(User);

    // Idempotente: rodar de novo não faz nada e não é erro.
    const existentes = await repo.count();
    if (existentes > 0) {
        console.log(`Já existem ${existentes} usuário(s). Nada a fazer.`);
        await dataSource.destroy();
        return;
    }

    const admin = repo.create({
        name: nome,
        email,
        passwordHash: await bcrypt.hash(senha, 10),
        role: 'admin',
        isActive: true,
        mustChangePassword: true,
    });

    await repo.save(admin);
    console.log(`Administrador criado: ${email}`);
    console.log('A troca de senha será exigida no primeiro acesso.');

    await dataSource.destroy();
}

main().catch((erro) => {
    console.error('Falha ao criar o administrador:', erro);
    process.exit(1);
});
