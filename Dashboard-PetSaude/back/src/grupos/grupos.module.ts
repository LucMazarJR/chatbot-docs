import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '../users/entities/user.entity';
import { Grupo } from './entities/grupo.entity';
import { GruposController } from './grupos.controller';
import { GruposService } from './grupos.service';

@Module({
    imports: [TypeOrmModule.forFeature([Grupo, User])],
    controllers: [GruposController],
    providers: [GruposService],
})
export class GruposModule { }
