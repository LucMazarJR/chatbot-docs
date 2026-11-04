import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ImportScript } from './entities/import-script.entity';
import { ImportScriptsController } from './import-scripts.controller';
import { ImportScriptsService } from './import-scripts.service';

@Module({
    imports: [TypeOrmModule.forFeature([ImportScript])],
    controllers: [ImportScriptsController],
    providers: [ImportScriptsService],
    exports: [ImportScriptsService],
})
export class ImportScriptsModule { }
