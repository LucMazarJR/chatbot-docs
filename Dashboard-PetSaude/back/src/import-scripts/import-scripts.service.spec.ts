import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';

import { ImportScript } from './entities/import-script.entity';
import { ImportScriptsService } from './import-scripts.service';
import { SCRIPT_PADRAO } from './script-padrao';

/**
 * Versionamento dos scripts de geração.
 *
 * LÓGICA DO LUCIANO: os testes cobrem as duas coisas que, se quebrarem, não dão
 * erro nenhum — salvar sobrescrevendo a versão anterior (as FAQs já importadas
 * passariam a apontar para um código que não existe mais) e o sistema ficar sem
 * nenhum script ativo depois de uma gravação (a importação para de funcionar
 * exatamente depois de a pessoa ter ido configurá-la).
 */
describe('ImportScriptsService', () => {
  let service: ImportScriptsService;
  let linhas: ImportScript[];
  let proximoId: number;

  /** Repositório em memória, com o pouco da API do TypeORM que o service usa. */
  function montarRepo() {
    return {
      count: jest.fn(async () => linhas.length),

      find: jest.fn(async () => [...linhas].sort((a, b) => b.version - a.version)),

      findOne: jest.fn(async ({ where }: any) => {
        if (where.id !== undefined) return linhas.find((l) => l.id === where.id) ?? null;
        if (where.isActive !== undefined) {
          return linhas.find((l) => l.isActive === where.isActive) ?? null;
        }
        return null;
      }),

      create: jest.fn((dados: any) => ({ ...dados })),

      save: jest.fn(async (registro: any) => {
        const existente = registro.id ? linhas.find((l) => l.id === registro.id) : undefined;
        if (existente) {
          Object.assign(existente, registro);
          return existente;
        }
        const novo = {
          ...registro,
          id: 'script-' + proximoId++,
          createdAt: new Date('2026-09-02T12:00:00Z'),
        } as ImportScript;
        linhas.push(novo);
        return novo;
      }),

      update: jest.fn(async (criterio: any, patch: any) => {
        linhas
          .filter((l) => Object.entries(criterio).every(([k, v]) => (l as any)[k] === v))
          .forEach((l) => Object.assign(l, patch));
      }),

      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn(async () => ({
          max: linhas.length ? Math.max(...linhas.map((l) => l.version)) : null,
        })),
      })),
    };
  }

  beforeEach(async () => {
    linhas = [];
    proximoId = 1;

    const repo = montarRepo();
    const dataSource = {
      // A transação roda o callback direto: o que interessa testar é a sequência
      // dos passos, não o COMMIT.
      transaction: jest.fn(async (cb: any) => cb({ getRepository: () => repo })),
    };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        ImportScriptsService,
        { provide: getRepositoryToken(ImportScript), useValue: repo },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = modulo.get(ImportScriptsService);
  });

  describe('semeadura no boot', () => {
    it('grava o script padrao como versao 1 quando a tabela esta vazia', async () => {
      await service.onModuleInit();

      expect(linhas).toHaveLength(1);
      expect(linhas[0].version).toBe(1);
      expect(linhas[0].isActive).toBe(true);
      expect(linhas[0].code).toBe(SCRIPT_PADRAO);
    });

    it('nao mexe em nada quando ja existe algum script', async () => {
      linhas.push({ id: 'x', version: 7, isActive: true, code: '// meu' } as ImportScript);

      await service.onModuleInit();

      expect(linhas).toHaveLength(1);
      expect(linhas[0].code).toBe('// meu');
    });

    it('nao derruba a subida quando a semeadura falha', async () => {
      // Sem script ativo o resto do dashboard segue funcionando; so a
      // importacao fica indisponivel, e com mensagem clara.
      const repoQuebrado = montarRepo();
      repoQuebrado.count.mockRejectedValue(new Error('sem conexao'));

      const modulo: TestingModule = await Test.createTestingModule({
        providers: [
          ImportScriptsService,
          { provide: getRepositoryToken(ImportScript), useValue: repoQuebrado },
          { provide: getDataSourceToken(), useValue: { transaction: jest.fn() } },
        ],
      }).compile();

      await expect(modulo.get(ImportScriptsService).onModuleInit()).resolves.toBeUndefined();
    });
  });

  describe('gravar uma versao nova', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('cria uma linha nova em vez de sobrescrever a anterior', async () => {
      await service.criar(
        { name: 'Meu parser', code: '// v2' },
        { id: 'u1', name: 'Ana' },
      );

      expect(linhas).toHaveLength(2);
      // A versao 1 continua inteira: cada FAQ importada guarda a versao que a
      // gerou, e sem o historico esse ponteiro ficaria orfao.
      expect(linhas[0].version).toBe(1);
      expect(linhas[0].code).toBe(SCRIPT_PADRAO);
    });

    it('numera a versao nova a partir da maior existente', async () => {
      await service.criar({ name: 'v2', code: '// v2' }, { name: 'Ana' });
      const terceiro = await service.criar({ name: 'v3', code: '// v3' }, { name: 'Ana' });

      expect(terceiro.version).toBe(3);
    });

    it('deixa exatamente um script ativo', async () => {
      await service.criar({ name: 'v2', code: '// v2' }, { name: 'Ana' });

      expect(linhas.filter((l) => l.isActive)).toHaveLength(1);
      expect(linhas.find((l) => l.isActive)!.code).toBe('// v2');
    });

    it('guarda quem gravou, pelo nome e pelo id', async () => {
      const resumo = await service.criar(
        { name: 'v2', code: '// v2', notes: 'ajuste nas tags' },
        { id: 'u1', name: 'Ana' },
      );

      expect(resumo.createdByName).toBe('Ana');
      expect(resumo.notes).toBe('ajuste nas tags');
      expect(linhas.find((l) => l.isActive)!.createdById).toBe('u1');
    });

    it('nao devolve o codigo na listagem, so o tamanho dele', async () => {
      const lista = await service.listar();

      expect((lista[0] as any).code).toBeUndefined();
      expect(lista[0].codeSize).toBeGreaterThan(0);
    });
  });

  describe('voltar para uma versao anterior', () => {
    it('reativa a antiga e desativa a atual', async () => {
      await service.onModuleInit();
      const primeira = linhas[0];
      await service.criar({ name: 'v2', code: '// v2' }, { name: 'Ana' });

      await service.ativar(primeira.id);

      expect(linhas.filter((l) => l.isActive)).toHaveLength(1);
      expect(linhas.find((l) => l.isActive)!.version).toBe(1);
    });

    it('reclama quando o id nao existe', async () => {
      await expect(service.ativar('nao-existe')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('buscar o ativo', () => {
    it('devolve o codigo, que e do que a tela de importacao precisa', async () => {
      await service.onModuleInit();

      const ativo = await service.buscarAtivo();

      expect(ativo.version).toBe(1);
      expect(ativo.code).toBe(SCRIPT_PADRAO);
    });

    it('reclama com mensagem util quando nao ha nenhum ativo', async () => {
      // Devolver o padrao de memoria aqui deixaria a importacao rodar gravando
      // em cada FAQ um id de script que nao existe no banco.
      await expect(service.buscarAtivo()).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('restaurar o padrao', () => {
    it('grava o padrao como uma versao nova, sem apagar as anteriores', async () => {
      await service.onModuleInit();
      await service.criar({ name: 'quebrado', code: '// quebrado' }, { name: 'Ana' });

      const resumo = await service.restaurarPadrao({ name: 'Ana' });

      expect(resumo.version).toBe(3);
      expect(linhas).toHaveLength(3);
      expect(linhas.find((l) => l.isActive)!.code).toBe(SCRIPT_PADRAO);
    });
  });
});
