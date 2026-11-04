import { Controller, Get, Post, Put, Delete, Body, Query, Param, NotFoundException } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { BuscaSemanticaService } from './busca.service';
import { TestarBuscaDto } from './dto/testar-busca.dto';
import { FaqsService } from './faqs.service';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';
import { DeleteFaqDto } from './dto/delete-faq.dto';
import { ListFaqsQueryDto } from './dto/list-faqs-query.dto';

@Controller('faqs')
export class FaqsController {
    constructor(
        private readonly faqsService: FaqsService,
        private readonly buscaSemantica: BuscaSemanticaService,
    ) { }

    /**
     * Roda a busca do chatbot para uma pergunta digitada, e devolve os scores.
     *
     * POST porque gasta: é um embedding por teste, na mesma cota diária que a
     * ingestão e o chatbot dividem. De editor para cima: é quem escreve FAQ que
     * precisa saber se a que escreveu vai ser encontrada.
     */
    @Post('testar-busca')
    @Roles('admin', 'editor')
    testarBusca(@Body() body: TestarBuscaDto) {
        return this.buscaSemantica.testar(body.pergunta, body.topK);
    }

    // Declarado ANTES de qualquer rota com parametro: se um dia existir um
    // @Get(':id'), o Nest casaria "categories" como se fosse um id.
    @Get('categories')
    getCategories() {
        return this.faqsService.getCategories();
    }

    @Get()
    listFaqs(@Query() query: ListFaqsQueryDto, @CurrentUser() user: AuthenticatedUser) {
        const { minhas, ...filtro } = query;
        return this.faqsService.listFaqs({
            ...filtro,
            ...(minhas === 'sim' ? { minhasDe: user.name } : {}),
        });
    }

    // Declarada por ultimo entre os GET: qualquer rota fixa nova precisa vir
    // ANTES desta, senao o Nest casa o nome dela como se fosse um id.
    @Get(':id')
    async buscarPorId(@Param('id') id: string) {
        const faq = await this.faqsService.buscarPorId(id);
        if (!faq) throw new NotFoundException('Pergunta não encontrada. Ela pode ter sido excluída: volte para as FAQs.');
        return faq;
    }

    // LÓGICA DO LUCIANO: o ator saía do header x-actor-name, que era só o nome
    // digitado na tela do cadeado: qualquer pessoa podia escrever qualquer
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
