import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { AuthService } from '../auth/auth.service';
import { ActivityService } from '../activity/activity.service';
import { permissoesTotais, type Permissoes } from '../grupos/areas';
import { Grupo } from '../grupos/entities/grupo.entity';
import { User } from './entities/user.entity';
import { UsersService, type Solicitante } from './users.service';

/**
 * Travas de conta.
 *
 * LÓGICA DO LUCIANO: são regras que ninguém percebe estarem quebradas até o dia
 * em que a instalação fica sem master, ou alguém com pouco acesso descobre que
 * consegue se promover. Aí não há tela que resolva, só acesso ao banco. Por
 * isso viram teste, e não só verificação manual.
 */
describe('UsersService: travas de conta', () => {
  let service: UsersService;
  let repo: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    count: jest.Mock;
    find: jest.Mock;
  };
  let gruposRepo: { findOne: jest.Mock };
  let auth: { revogarSessoes: jest.Mock };

  const grupo = (id: string, nome: string, permissoes: Permissoes) =>
    ({ id, nome, descricao: '', permissoes }) as Grupo;

  const ADMINISTRADOR = grupo('g-admin', 'Administrador', permissoesTotais());
  const LEITOR = grupo('g-leitor', 'Leitor', { faqs: 'ver', categorias: 'ver' });
  // Cuida das contas, mas não vê conversa nenhuma.
  const CONTAS = grupo('g-contas', 'Contas', {
    faqs: 'ver',
    categorias: 'ver',
    usuarios: 'editar',
  });
  const GRUPOS = [ADMINISTRADOR, LEITOR, CONTAS];

  const conta = (id: string, g: Grupo, extra: Partial<User> = {}) =>
    ({
      id,
      name: `Pessoa ${id}`,
      email: `${id}@exemplo.com`,
      grupoId: g.id,
      grupo: g,
      master: false,
      isActive: true,
      mustChangePassword: false,
      lastLoginAt: null,
      createdAt: new Date(),
      ...extra,
    }) as User;

  const solicitante = (id: string, g: Grupo, master = false): Solicitante => ({
    id,
    name: `Pessoa ${id}`,
    master,
    permissoes: g.permissoes,
  });

  const MASTER = solicitante('master-1', ADMINISTRADOR, true);
  const QUEM_CUIDA_DAS_CONTAS = solicitante('contas-1', CONTAS);

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      save: jest.fn((u) => Promise.resolve(u)),
      create: jest.fn((u) => u),
      count: jest.fn(),
      find: jest.fn(),
    };
    gruposRepo = {
      findOne: jest.fn(({ where: { id } }) =>
        Promise.resolve(GRUPOS.find((g) => g.id === id) ?? null),
      ),
    };
    auth = { revogarSessoes: jest.fn().mockResolvedValue(undefined) };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
        { provide: getRepositoryToken(Grupo), useValue: gruposRepo },
        { provide: AuthService, useValue: auth },
        { provide: ActivityService, useValue: { registrar: jest.fn() } },
      ],
    }).compile();

    service = modulo.get(UsersService);
  });

  describe('a própria conta', () => {
    it('quem cuida das contas não muda o próprio grupo', async () => {
      repo.findOne.mockResolvedValue(conta('contas-1', CONTAS));

      await expect(
        service.atualizar('contas-1', { grupoId: LEITOR.id }, QUEM_CUIDA_DAS_CONTAS),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('ninguém desativa a própria conta, nem o master', async () => {
      repo.findOne.mockResolvedValue(conta('master-1', ADMINISTRADOR, { master: true }));

      await expect(
        service.atualizar('master-1', { isActive: false }, MASTER),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('o master', () => {
    it('não deixa a instalação sem master ativo', async () => {
      repo.findOne.mockResolvedValue(conta('master-1', ADMINISTRADOR, { master: true }));
      repo.count.mockResolvedValue(0);

      await expect(
        service.atualizar('master-1', { master: false }, MASTER),
      ).rejects.toThrow(/única conta master/);
    });

    it('passa o master adiante quando sobra outro', async () => {
      repo.findOne.mockResolvedValue(conta('master-1', ADMINISTRADOR, { master: true }));
      repo.count.mockResolvedValue(1);

      const resultado = await service.atualizar('master-1', { master: false }, MASTER);

      expect(resultado.master).toBe(false);
    });

    it('só o master dá o master', async () => {
      repo.findOne.mockResolvedValue(conta('leitor-1', LEITOR));

      await expect(
        service.atualizar('leitor-1', { master: true }, QUEM_CUIDA_DAS_CONTAS),
      ).rejects.toThrow(/Só o master/);
    });

    it('a conta do master só o master muda', async () => {
      repo.findOne.mockResolvedValue(conta('master-1', LEITOR, { master: true }));

      await expect(
        service.definirSenha('master-1', 'senha-nova-123', QUEM_CUIDA_DAS_CONTAS),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('sem se promover por outro caminho', () => {
    it('não põe ninguém num grupo com mais acesso que o seu', async () => {
      await expect(
        service.criar(
          { name: 'Nova', email: 'nova@exemplo.com', password: 'senha-longa', grupoId: ADMINISTRADOR.id },
          QUEM_CUIDA_DAS_CONTAS,
        ),
      ).rejects.toThrow(/dá mais acesso que o seu/);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('põe em grupo que cabe no seu acesso', async () => {
      const criado = await service.criar(
        { name: 'Nova', email: 'nova@exemplo.com', password: 'senha-longa', grupoId: LEITOR.id },
        QUEM_CUIDA_DAS_CONTAS,
      );

      expect(criado.grupo).toEqual({ id: LEITOR.id, nome: 'Leitor' });
    });

    it('não redefine a senha de quem tem mais acesso, que seria entrar na conta dele', async () => {
      repo.findOne.mockResolvedValue(conta('admin-1', ADMINISTRADOR));

      await expect(
        service.definirSenha('admin-1', 'senha-nova-123', QUEM_CUIDA_DAS_CONTAS),
      ).rejects.toThrow(/mais acesso que o seu/);
      expect(auth.revogarSessoes).not.toHaveBeenCalled();
    });

    it('não desativa quem tem mais acesso', async () => {
      repo.findOne.mockResolvedValue(conta('admin-1', ADMINISTRADOR));

      await expect(service.desativar('admin-1', QUEM_CUIDA_DAS_CONTAS)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  it('muda o grupo e devolve o novo, com o papel antigo deduzido dele', async () => {
    repo.findOne.mockResolvedValue(conta('leitor-1', LEITOR));

    const resultado = await service.atualizar('leitor-1', { grupoId: ADMINISTRADOR.id }, MASTER);

    expect(resultado.grupo.nome).toBe('Administrador');
    expect(resultado.permissoes.conversas).toBe('editar');
    expect(resultado.role).toBe('admin');
  });

  it('recusa grupo que não existe com frase que diz o que fazer', async () => {
    await expect(
      service.criar(
        { name: 'Nova', email: 'nova@exemplo.com', password: 'senha-longa', grupoId: 'sumiu' },
        MASTER,
      ),
    ).rejects.toThrow(/Recarregue a página/);
  });

  it('revoga as sessoes ao desativar, para o acesso cair na hora', async () => {
    repo.findOne.mockResolvedValue(conta('leitor-1', LEITOR));

    await service.desativar('leitor-1', MASTER);

    // Sem isto, quem foi desativado seguiria escrevendo até o token expirar.
    expect(auth.revogarSessoes).toHaveBeenCalledWith('leitor-1');
  });

  it('traduz e-mail duplicado do Postgres em 409, nao em 500', async () => {
    repo.save.mockRejectedValue({ code: '23505' });

    await expect(
      service.criar(
        { name: 'Alguem', email: 'a@b.com', password: 'senha-longa', grupoId: LEITOR.id },
        MASTER,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('nasce com troca de senha obrigatoria e sem master', async () => {
    repo.save.mockImplementation((u) => Promise.resolve({ ...u, createdAt: new Date() }));

    const criado = await service.criar(
      { name: 'Novo', email: 'novo@exemplo.com', password: 'senha-provisoria', grupoId: LEITOR.id },
      MASTER,
    );

    expect(criado.mustChangePassword).toBe(true);
    expect(criado.master).toBe(false);
  });

  it('devolve 404 ao atualizar usuario inexistente', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(service.atualizar('nao-existe', { name: 'X' }, MASTER)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('normaliza o e-mail para minusculas ao criar', async () => {
    repo.save.mockImplementation((u) => Promise.resolve({ ...u, createdAt: new Date() }));

    const criado = await service.criar(
      { name: 'Alguem', email: '  Alguem@Exemplo.COM  ', password: 'senha-longa', grupoId: LEITOR.id },
      MASTER,
    );

    // Guardar sempre em minúsculas evita depender da extensão citext só para
    // comparar e-mail sem diferenciar caixa.
    expect(criado.email).toBe('alguem@exemplo.com');
  });
});
