import { Controller, Get, Post, Body } from '@nestjs/common';
import { GateService } from './gate.service';

@Controller('gate')
export class GateController {
    constructor(private gateService: GateService) { }

    @Post('unlock')
    unlock(@Body() body: { name: string; password: string }) {
        return this.gateService.unlock(body.name, body.password);
    }
}
