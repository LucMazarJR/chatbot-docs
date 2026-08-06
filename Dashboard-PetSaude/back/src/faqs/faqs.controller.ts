import { Controller, Get, Post, Put, Delete, Body, BadRequestException } from '@nestjs/common';
import { FaqsService } from './faqs.service';
import { GateService } from '../gate/gate.service';
import { CreateFaqDto } from './dto/create-faq.dto';

@Controller('faqs')
export class FaqsController {
    constructor(
        private readonly faqsService: FaqsService,
        private readonly gateService: GateService
    ) { }

    private requireActor(): string {
        const status = this.gateService.getStatus();
        if (!status.unlocked || !status.name) {
            throw new BadRequestException('Dashboard locked');
        }
        return status.name || "";
    }

    @Get()
    listFaqs() {
        return this.faqsService.listFaqs();
    }

    @Post()
    createFaq(@Body() body: CreateFaqDto) {
        const actor = this.requireActor();
        return this.faqsService.createFaq(body, actor);
    }

    @Put()
    updateFaq(@Body() body: any) {
        const actor = this.requireActor();
        return this.faqsService.updateFaq(body.id, body, actor);
    }

    @Delete()
    deleteFaq(@Body() body: any) {
        const actor = this.requireActor();
        return this.faqsService.deleteFaq(body.id, actor);
    }
}
