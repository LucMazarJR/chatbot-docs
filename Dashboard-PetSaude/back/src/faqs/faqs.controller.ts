import { Controller, Get, Post, Put, Delete, Body, BadRequestException, Headers } from '@nestjs/common';
import { FaqsService } from './faqs.service';
import { GateService } from '../gate/gate.service';
import { CreateFaqDto } from './dto/create-faq.dto';

@Controller('faqs')
export class FaqsController {
    constructor(
        private readonly faqsService: FaqsService,
        private readonly gateService: GateService
    ) { }

    @Get()
    listFaqs() {
        return this.faqsService.listFaqs();
    }

    private getActor(headers: any): string {
        const actor = headers['x-actor-name'];
        if (!actor) {
            throw new BadRequestException('Dashboard locked');
        }
        return actor as string;
    }

    @Post()
    createFaq(@Body() body: CreateFaqDto, @Headers() headers: any) {
        const actor = this.getActor(headers);
        return this.faqsService.createFaq(body, actor);
    }

    @Put()
    updateFaq(@Body() body: any, @Headers() headers: any) {
        const actor = this.getActor(headers);
        return this.faqsService.updateFaq(body.id, body, actor);
    }

    @Delete()
    deleteFaq(@Body() body: any, @Headers() headers: any) {
        const actor = this.getActor(headers);
        return this.faqsService.deleteFaq(body.id, actor);
    }
}
