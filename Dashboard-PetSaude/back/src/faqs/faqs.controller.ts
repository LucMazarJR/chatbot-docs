import { Controller, Get, Post, Put, Delete, Body, Query } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { FaqsService } from './faqs.service';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';
import { DeleteFaqDto } from './dto/delete-faq.dto';
import { ListFaqsQueryDto } from './dto/list-faqs-query.dto';

@Controller('faqs')
export class FaqsController {
    constructor(private readonly faqsService: FaqsService) { }

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

    // LÓGICA DO LUCIANO: o ator saía do header x-actor-name, que era só o nome
    // digitado na tela do cadeado — qualquer pessoa podia escrever qualquer
    // nome. Agora vem do JWT, verificado pelo guard.
    @Post()
    @Roles('admin', 'editor')
    createFaq(@Body() body: CreateFaqDto, @CurrentUser() user: AuthenticatedUser) {
        return this.faqsService.createFaq(body, { id: user.id, name: user.name });
    }

    @Put()
    @Roles('admin', 'editor')
    updateFaq(@Body() body: UpdateFaqDto, @CurrentUser() user: AuthenticatedUser) {
        return this.faqsService.updateFaq(body.id, body, { id: user.id, name: user.name });
    }

    @Delete()
    @Roles('admin', 'editor')
    deleteFaq(@Body() body: DeleteFaqDto, @CurrentUser() user: AuthenticatedUser) {
        return this.faqsService.deleteFaq(body.id, { id: user.id, name: user.name });
    }
}
