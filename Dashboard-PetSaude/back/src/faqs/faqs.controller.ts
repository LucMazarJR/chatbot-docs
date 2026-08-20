import { Controller, Get, Post, Put, Delete, Body, BadRequestException, Headers, Query } from '@nestjs/common';
import { FaqsService } from './faqs.service';
import { GateService } from '../gate/gate.service';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';
import { DeleteFaqDto } from './dto/delete-faq.dto';
import { ListFaqsQueryDto } from './dto/list-faqs-query.dto';

@Controller('faqs')
export class FaqsController {
    constructor(
        private readonly faqsService: FaqsService,
        private readonly gateService: GateService
    ) { }

    // Declarado ANTES de qualquer rota com parametro: se um dia existir um
    // @Get(':id'), o Nest casaria "categories" como se fosse um id.
    @Get('categories')
    getCategories() {
        return this.faqsService.getCategories();
    }

    @Get()
    listFaqs(@Query() query: ListFaqsQueryDto) {
        return this.faqsService.listFaqs(query);
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
    updateFaq(@Body() body: UpdateFaqDto, @Headers() headers: any) {
        const actor = this.getActor(headers);
        return this.faqsService.updateFaq(body.id, body, actor);
    }

    @Delete()
    deleteFaq(@Body() body: DeleteFaqDto, @Headers() headers: any) {
        const actor = this.getActor(headers);
        return this.faqsService.deleteFaq(body.id, actor);
    }
}
