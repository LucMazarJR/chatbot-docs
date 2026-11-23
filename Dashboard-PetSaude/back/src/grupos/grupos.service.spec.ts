import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { ActivityService } from '../activity/activity.service';
import { User } from '../users/entities/user.entity';
import { Grupo } from './entities/grupo.entity';
import { GruposService } from './grupos.service';

describe('GruposService', () => {
  let service: GruposService;
  let grupos: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock; count: jest.Mock; delete: jest.Mock };
  let usuarios: { count: jest.Mock; createQueryBuilder: jest.Mock };
  let registrar: jest.Mock;

  const MASTER = { id: 'm-1', name: 'Master' };
  const EDITOR = {
    id: 'g-editor',
    nome: 'Editor',
    descricao: 'Escreve FAQs',
    permissoes: { faqs: 'editar', categorias: 'ver' },
  } as Grupo;

  beforeEach(async () => {
    grupos = {
      find: jest.fn(),
      findOne: jest.fn().mockResolvedValue({ ...EDITOR, permissoes: { ...EDITOR.permissoes } }),
      create: jest.fn((g) => g),
      save: jest.fn((g) => Promise.resolve({ id: 'novo', ...g })),
      count: jest.fn().mockResolvedValue(3),
      delete: jest.fn(),
    };
    usuarios = { count: jest.fn().mockResolvedValue(0), createQueryBuilder: jest.fn() };
    registrar = jest.fn();

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        GruposService,
        { provide: getRepositoryToken(Grupo), useValue: grupos },
        { provide: getRepositoryToken(User), useValue: usuarios },
        { provide: ActivityService, useValue: { registrar } },
      ],
    }).compile();

    service = modulo.get(GruposService);
  });

  it('recusa nível que a área não tem, dizendo qual', async () => {
    await expect(
      service.criar({ nome: 'Estranho', permissoes: { historico: 'editar' } }, MASTER),
    ).rejects.toThrow(BadRequestException);
    expect(grupos.save).not.toHaveBeenCalled();
  });

  it('todo grupo novo vê as FAQs, mesmo marcado sem acesso', async () => {
    const criado = await service.criar(
      { nome: 'Curadoria', permissoes: { faqs: 'nada', curadoria: 'editar' } },
      MASTER,
    );
    expect(criado.permissoes).toEqual({ faqs: 'ver', curadoria: 'editar' });
  });

  it('nome repetido vira 409 com o nome na frase', async () => {
    grupos.save.mockRejectedValue({ code: '23505' });
    await expect(service.criar({ nome: 'Editor', permissoes: {} }, MASTER)).rejects.toThrow(
      /Já existe um grupo chamado Editor/,
    );
  });

  it('o histórico registra só as áreas que mudaram', async () => {
    await service.atualizar(
      EDITOR.id,
      { permissoes: { faqs: 'editar', categorias: 'ver', curadoria: 'ver' } },
      MASTER,
    );

    expect(registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'editar_grupo',
        entity_type: 'grupo',
        before: { curadoria: 'sem acesso' },
        after: { curadoria: 'ver' },
      }),
    );
  });

  it('salvar sem mudar nada não enche o histórico', async () => {
    await service.atualizar(EDITOR.id, { permissoes: { ...EDITOR.permissoes } }, MASTER);
    expect(registrar).not.toHaveBeenCalled();
  });

  describe('apagar', () => {
    it('recusa grupo com gente, contando também as contas desativadas', async () => {
      // 2 ativas, 3 no total: 1 desativada.
      usuarios.count.mockImplementation(({ where }) =>
        Promise.resolve(where.isActive ? 2 : 3),
      );

      const erro = await service.apagar(EDITOR.id, MASTER).catch((e) => e);

      expect(erro).toBeInstanceOf(ConflictException);
      expect(erro.message).toContain('2 contas ativas e 1 conta desativada');
      expect(erro.message).toContain('Mova essas contas');
      expect(grupos.delete).not.toHaveBeenCalled();
    });

    it('recusa apagar o único grupo', async () => {
      grupos.count.mockResolvedValue(1);
      await expect(service.apagar(EDITOR.id, MASTER)).rejects.toThrow(/único grupo/);
    });

    it('apaga grupo vazio e registra no histórico', async () => {
      await service.apagar(EDITOR.id, MASTER);
      expect(grupos.delete).toHaveBeenCalledWith(EDITOR.id);
      expect(registrar).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'apagar_grupo', target: 'Editor' }),
      );
    });
  });
});
