import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { AuthService } from '../auth/auth.service';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

/**
 * Travas de conta.
 *
 * LÓGICA DO LUCIANO: são regras que ninguém percebe estarem quebradas até o dia
 * em que a instalação fica sem nenhum administrador capaz de entrar — e aí não
 * há tela que resolva, só acesso ao banco. Por isso viram teste, e não só
 * verificação manual.
 */
describe('UsersService — travas de conta', () => {
  let service: UsersService;
  let repo: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    count: jest.Mock;
    find: jest.Mock;
  };
  let auth: { revogarSessoes: jest.Mock };

  const ADMIN = {
    id: 'admin-1',
    name: 'Admin',
    email: 'admin@exemplo.com',
    role: 'admin' as const,
    isActive: true,
    mustChangePassword: false,
    lastLoginAt: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      save: jest.fn((u) => Promise.resolve(u)),
      create: jest.fn((u) => u),
      count: jest.fn(),
      find: jest.fn(),
    };
    auth = { revogarSessoes: jest.fn().mockResolvedValue(undefined) };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
        { provide: AuthService, useValue: auth },
      ],
    }).compile();

    service = modulo.get(UsersService);
  });

  it('impede que um admin rebaixe a propria conta', async () => {
    repo.findOne.mockResolvedValue({ ...ADMIN });

    await expect(
      service.atualizar(ADMIN.id, { role: 'leitor' }, { id: ADMIN.id }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repo.save).not.toHaveBeenCalled();
  });

  it('impede que um admin desative a propria conta', async () => {
    repo.findOne.mockResolvedValue({ ...ADMIN });

    await expect(
      service.atualizar(ADMIN.id, { isActive: false }, { id: ADMIN.id }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('impede rebaixar o ultimo admin ativo, mesmo por outro admin', async () => {
    repo.findOne.mockResolvedValue({ ...ADMIN, id: 'admin-2' });
    // Nenhum outro admin ativo além do que está sendo rebaixado.
    repo.count.mockResolvedValue(0);

    await expect(
      service.atualizar('admin-2', { role: 'editor' }, { id: ADMIN.id }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite rebaixar um admin quando sobra outro ativo', async () => {
    repo.findOne.mockResolvedValue({ ...ADMIN, id: 'admin-2' });
    repo.count.mockResolvedValue(1);

    const resultado = await service.atualizar(
      'admin-2',
      { role: 'editor' },
      { id: ADMIN.id },
    );

    expect(resultado.role).toBe('editor');
  });

  it('revoga as sessoes ao desativar, para o acesso cair na hora', async () => {
    repo.findOne.mockResolvedValue({ ...ADMIN, id: 'editor-1', role: 'editor' });

    await service.desativar('editor-1', { id: ADMIN.id });

    // Sem isto, quem foi desativado seguiria escrevendo até o token expirar.
    expect(auth.revogarSessoes).toHaveBeenCalledWith('editor-1');
  });

  it('traduz e-mail duplicado do Postgres em 409, nao em 500', async () => {
    repo.save.mockRejectedValue({ code: '23505' });

    await expect(
      service.criar({ name: 'Alguem', email: 'a@b.com', password: 'senha-longa' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('nasce com troca de senha obrigatoria quando o admin define a senha', async () => {
    repo.save.mockImplementation((u) => Promise.resolve({ ...u, createdAt: new Date() }));

    const criado = await service.criar({
      name: 'Novo',
      email: 'novo@exemplo.com',
      password: 'senha-provisoria',
    });

    expect(criado.mustChangePassword).toBe(true);
    // Sem papel informado, o mais restrito.
    expect(criado.role).toBe('leitor');
  });

  it('devolve 404 ao atualizar usuario inexistente', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(
      service.atualizar('nao-existe', { name: 'X' }, { id: ADMIN.id }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('normaliza o e-mail para minusculas ao criar', async () => {
    repo.save.mockImplementation((u) => Promise.resolve({ ...u, createdAt: new Date() }));

    const criado = await service.criar({
      name: 'Alguem',
      email: '  Alguem@Exemplo.COM  ',
      password: 'senha-longa',
    });

    // Guardar sempre em minúsculas evita depender da extensão citext só para
    // comparar e-mail sem diferenciar caixa.
    expect(criado.email).toBe('alguem@exemplo.com');
  });
});
