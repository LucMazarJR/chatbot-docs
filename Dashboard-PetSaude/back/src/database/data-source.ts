import 'dotenv/config';
import { DataSource } from 'typeorm';

import { User } from '../users/entities/user.entity';
import { UserSession } from '../users/entities/user-session.entity';

/**
 * DataSource usado apenas pela CLI do TypeORM (migrations e seed).
 *
 * A aplicação não usa este arquivo: ela monta a conexão no app.module.ts, via
 * ConfigService. Este aqui existe porque a CLI roda fora do contexto do Nest.
 */
export default new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: [User, UserSession],
    migrations: [__dirname + '/migrations/*.{ts,js}'],
    synchronize: false,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});
