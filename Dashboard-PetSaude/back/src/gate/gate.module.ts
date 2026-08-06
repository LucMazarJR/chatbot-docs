import { Module } from '@nestjs/common';
import { GateController } from './gate.controller';
import { GateService } from './gate.service';

@Module({
    controllers: [GateController],
    providers: [GateService],
    exports: [GateService]
})
export class GateModule { }
