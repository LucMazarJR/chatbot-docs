import {
    Injectable,
    Logger,
    NotFoundException,
    OnModuleInit,
    ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { CreateImportScriptDto } from './dto/create-import-script.dto';
import { ImportScript, ImportScriptResumo, toResumo } from './entities/import-script.entity';
import { NOME_SCRIPT_PADRAO, SCRIPT_PADRAO } from './script-padrao';

/** O script ativo, como a tela de importação precisa dele. */
export type ScriptAtivo = {
    id: string;
    name: string;
    version: number;
    code: string;
    createdByName: string | null;
    createdAt: Date;
};

@Injectable()
export class ImportScriptsService implements OnModuleInit {
    private readonly logger = new Logger(ImportScriptsService.name);

    constructor(
        @InjectRepository(ImportScript) private readonly repo: Repository<ImportScript>,
        @InjectDataSource() private readonly dataSource: DataSource,
    ) { }

    /**
     * Grava o script padrão na primeira subida, se a tabela estiver vazia.
     *
     * LÓGICA DO LUCIANO: o padrão poderia ser devolvido de memória quando não há
     * nenhuma linha, e era o desenho mais simples. Mas cada FAQ importada grava
     * o id e a versão do script que a gerou, e um id inventado ("padrao")
     * apontaria para lugar nenhum — justamente nas primeiras importações, que
     * são as mais prováveis de dar errado e precisar ser rastreadas depois.
     *
     * Semeia no boot, e não numa leitura: um GET que escreve surpreende, e duas
     * requisições simultâneas o fariam duas vezes. Duas instâncias subindo
     * juntas ainda podem tentar ao mesmo tempo — quem perde leva o erro do
     * índice único de version, que é engolido de propósito.
     */
    async onModuleInit(): Promise<void> {
        try {
            const ativo = await this.repo.findOne({ where: { isActive: true } });

            if (!ativo) {
                await this.semear(1, 'Versao inicial, gravada automaticamente na primeira subida.');
                return;
            }

            // LÓGICA DO LUCIANO: o padrão embutido no código só era gravado na
            // PRIMEIRA subida. Corrigir a regra padrão e publicar não mudava
            // nada em quem já tinha o sistema no ar: o banco continuava com a
            // versão semeada meses antes, e a correção ficava invisível.
            //
            // Aconteceu de verdade: a regra passou a tirar os colchetes de
            // "P: [pergunta] R: [resposta]", a correção subiu, e a importação
            // continuou gravando "[" no texto que o cidadão lê.
            //
            // A atualização só acontece se o script ativo for um padrão que
            // NINGUÉM tocou. `createdByName === 'sistema'` só vale para a linha
            // semeada automaticamente: salvar pelo painel grava o nome de quem
            // salvou, e restaurar o padrão também. Regra editada fica de pé.
            const intocado = ativo.createdByName === 'sistema' && ativo.name === NOME_SCRIPT_PADRAO;

            if (intocado && ativo.code !== SCRIPT_PADRAO) {
                const maior = await this.repo
                    .createQueryBuilder('s')
                    .select('MAX(s.version)', 'max')
                    .getRawOne<{ max: number | null }>();

                await this.repo.update({ isActive: true }, { isActive: false });
                await this.semear(
                    Number(maior?.max ?? 0) + 1,
                    'Atualizacao automatica da regra padrao, que ninguem havia editado.',
                );
            }
        } catch (erro) {
            // Perder a semeadura não pode derrubar a API: sem script ativo, o
            // resto do dashboard continua funcionando e só a importação fica
            // indisponível, com uma mensagem clara na tela.
            if (ImportScriptsService.tabelaFaltando(erro)) {
                this.logger.warn(
                    'A tabela import_scripts nao existe: rode `pnpm run migration:run` ' +
                    'ou suba com DB_RUN_MIGRATIONS=true. Ate la, a importacao de FAQs ' +
                    'fica indisponivel; o resto do dashboard funciona normalmente.',
                );
                return;
            }
            this.logger.warn(
                `Nao foi possivel semear o script padrao: ${erro instanceof Error ? erro.message : erro}`,
            );
        }
    }

    /**
     * Verdadeiro quando o erro é a tabela não existir.
     *
     * LÓGICA DO LUCIANO: `DB_RUN_MIGRATIONS` é `false` por padrão — as
     * migrations são rodadas à mão, de propósito. Então o primeiro deploy que
     * levar este módulo sobe com a tabela ainda inexistente, e o erro cru do
     * Postgres que chega na tela é `relation "import_scripts" does not exist`.
     * Quem estiver olhando não tem como saber que falta um comando, nem qual.
     */
    private static tabelaFaltando(erro: unknown): boolean {
        // 42P01 = undefined_table. O código é estável entre versões do Postgres;
        // a mensagem não é, e muda de idioma conforme o lc_messages do servidor.
        return (erro as { code?: string })?.code === '42P01';
    }

    private traduzirFalta(erro: unknown): never {
        if (ImportScriptsService.tabelaFaltando(erro)) {
            throw new ServiceUnavailableException(
                'A tabela import_scripts ainda nao existe neste banco. ' +
                'Rode as migrations: `pnpm run migration:run` na pasta back, ' +
                'ou suba a API com DB_RUN_MIGRATIONS=true.',
            );
        }
        throw erro;
    }

    private async semear(version: number, notes: string): Promise<void> {
        await this.repo.save(
            this.repo.create({
                name: NOME_SCRIPT_PADRAO,
                code: SCRIPT_PADRAO,
                version,
                isActive: true,
                notes,
                createdById: null,
                createdByName: 'sistema',
            }),
        );
        this.logger.log(`Regra de leitura padrao gravada como versao ${version}.`);
    }

    /** Metadados de todas as versões, da mais nova para a mais antiga. */
    async listar(): Promise<ImportScriptResumo[]> {
        try {
            const scripts = await this.repo.find({ order: { version: 'DESC' } });
            return scripts.map(toResumo);
        } catch (erro) {
            this.traduzirFalta(erro);
        }
    }

    async buscarAtivo(): Promise<ScriptAtivo> {
        let script: ImportScript | null;
        try {
            script = await this.repo.findOne({ where: { isActive: true } });
        } catch (erro) {
            this.traduzirFalta(erro);
        }

        if (!script) {
            // Só acontece se a semeadura falhou e ninguém salvou nada desde
            // então. Devolver o padrão de memória aqui deixaria a importação
            // rodar gravando um id que não existe.
            throw new NotFoundException(
                'Nenhum script de geracao ativo. Um administrador precisa salvar um em Configuracoes.',
            );
        }
        return {
            id: script.id,
            name: script.name,
            version: script.version,
            code: script.code,
            createdByName: script.createdByName ?? null,
            createdAt: script.createdAt,
        };
    }

    /** Uma versão específica, com o código — para ver e comparar antes de reativar. */
    async buscarPorId(id: string): Promise<ImportScript> {
        const script = await this.repo.findOne({ where: { id } });
        if (!script) throw new NotFoundException('Script nao encontrado.');
        return script;
    }

    /**
     * Grava uma versão nova e a torna a ativa.
     *
     * Tudo numa transação porque são dois passos que não podem ficar pela
     * metade: desativar o atual e inserir o novo. Sem ela, uma falha no meio
     * deixaria o sistema sem nenhum script ativo — e a importação, que é
     * exatamente o que a pessoa acabou de ir configurar, pararia de funcionar.
     */
    async criar(
        dados: CreateImportScriptDto,
        actor: { id?: string; name: string },
    ): Promise<ImportScriptResumo> {
        return this.dataSource.transaction(async (manager) => {
            const repo = manager.getRepository(ImportScript);

            const maior = await repo
                .createQueryBuilder('s')
                .select('MAX(s.version)', 'max')
                .getRawOne<{ max: number | null }>();

            await repo.update({ isActive: true }, { isActive: false });

            const script = await repo.save(
                repo.create({
                    name: dados.name.trim(),
                    code: dados.code,
                    version: Number(maior?.max ?? 0) + 1,
                    isActive: true,
                    notes: dados.notes?.trim() || null,
                    createdById: actor.id ?? null,
                    createdByName: actor.name,
                }),
            );

            this.logger.log(`Script "${script.name}" gravado como versao ${script.version}.`);
            return toResumo(script);
        });
    }

    /** Volta para uma versão anterior. É o desfazer de um script que saiu pior. */
    async ativar(id: string): Promise<ImportScriptResumo> {
        return this.dataSource.transaction(async (manager) => {
            const repo = manager.getRepository(ImportScript);

            const script = await repo.findOne({ where: { id } });
            if (!script) throw new NotFoundException('Script nao encontrado.');

            await repo.update({ isActive: true }, { isActive: false });
            script.isActive = true;
            await repo.save(script);

            this.logger.log(`Script versao ${script.version} reativado.`);
            return toResumo(script);
        });
    }

    /** Grava o padrão embutido como uma versão nova. Não apaga o que veio antes. */
    async restaurarPadrao(actor: { id?: string; name: string }): Promise<ImportScriptResumo> {
        return this.criar(
            {
                name: NOME_SCRIPT_PADRAO,
                code: SCRIPT_PADRAO,
                notes: 'Restauracao do script padrao embutido no codigo.',
            },
            actor,
        );
    }
}
