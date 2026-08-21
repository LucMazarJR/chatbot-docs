import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';

import { User } from '../users/entities/user.entity';
import { UserSession } from '../users/entities/user-session.entity';
import { AuthService } from './auth.service';

/**
 * Regras do login.
 *
 * LÓGICA DO LUCIANO: as duas primeiras existem para não vazar informação. Um
 * login que responde diferente para "e-mail não existe" e "senha errada"
 * entrega ao atacante quais e-mails estão cadastrados; e avisar que a conta
 * está desativada antes de conferir a senha entrega o mesmo, por outro caminho.
 */
describe('AuthService — login', () => {
  let service: AuthService;
  let usersRepo: { createQueryBuilder: jest.Mock; save: jest.Mock; findOne: jest.Mock };
  let sessionsRepo: { save: jest.Mock; create: jest.Mock; update: jest.Mock; findOne: jest.Mock };

  const SENHA = 'senha-correta-123';
  let hash: string;

  /** Simula o query builder usado para trazer o passwordHash (select: false). */
  function comUsuario(usuario: unknown) {
    usersRepo.createQueryBuilder.mockReturnValue({
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(usuario),
    });
  }

  beforeAll(async () => {
    hash = await bcrypt.hash(SENHA, 10);
  });

  beforeEach(async () => {
    usersRepo = {
      createQueryBuilder: jest.fn(),
      save: jest.fn((u) => Promise.resolve(u)),
      findOne: jest.fn(),
    };
    sessionsRepo = {
      save: jest.fn((s) => Promise.resolve(s)),
      create: jest.fn((s) => s),
      update: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(),
    };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('token-falso'),
            decode: jest.fn().mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 }),
          },
        },
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: getRepositoryToken(UserSession), useValue: sessionsRepo },
      ],
    }).compile();

    service = modulo.get(AuthService);
  });

  it('responde igual para e-mail inexistente e para senha errada', async () => {
    comUsuario(null);
    const inexistente = await service
      .login('nao-existe@exemplo.com', 'qualquer')
      .catch((e) => e);

    comUsuario({ id: '1', email: 'a@b.com', passwordHash: hash, isActive: true });
    const senhaErrada = await service.login('a@b.com', 'senha-errada').catch((e) => e);

    expect(inexistente).toBeInstanceOf(UnauthorizedException);
    expect(senhaErrada).toBeInstanceOf(UnauthorizedException);
    // A mensagem precisa ser a MESMA: diferenciar entrega quais e-mails existem.
    expect(inexistente.message).toBe(senhaErrada.message);
  });

  it('so avisa que a conta esta desativada DEPOIS de a senha conferir', async () => {
    comUsuario({ id: '1', email: 'a@b.com', passwordHash: hash, isActive: false });

    // Com a senha certa: pode avisar, porque quem chegou aqui já sabia a senha.
    await expect(service.login('a@b.com', SENHA)).rejects.toBeInstanceOf(ForbiddenException);

    // Com a senha errada: não pode revelar nada sobre a conta.
    await expect(service.login('a@b.com', 'errada')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('registra a sessao emitida, para poder revoga-la depois', async () => {
    comUsuario({
      id: 'u-1',
      name: 'Alguem',
      email: 'a@b.com',
      role: 'editor',
      passwordHash: hash,
      isActive: true,
    });

    const resultado = await service.login('a@b.com', SENHA, { ip: '127.0.0.1' });

    expect(resultado.accessToken).toBe('token-falso');
    expect(sessionsRepo.save).toHaveBeenCalledTimes(1);
    // O jti liga o token à linha da sessão; sem ele, revogar seria impossível.
    expect(sessionsRepo.create.mock.calls[0][0]).toEqual(
      expect.objectContaining({ userId: 'u-1', jti: expect.any(String) }),
    );
  });

  it('nunca devolve o hash da senha na resposta do login', async () => {
    comUsuario({
      id: 'u-1',
      name: 'Alguem',
      email: 'a@b.com',
      role: 'admin',
      passwordHash: hash,
      isActive: true,
    });

    const { user } = await service.login('a@b.com', SENHA);

    expect(user).not.toHaveProperty('passwordHash');
  });

  it('trocar a senha derruba as outras sessoes', async () => {
    comUsuario({ id: 'u-1', passwordHash: hash, isActive: true });

    await service.trocarSenha('u-1', SENHA, 'senha-nova-123');

    // Se alguém entrou com a senha antiga, perde o acesso agora.
    expect(sessionsRepo.update).toHaveBeenCalled();
  });

  it('recusa a troca quando a senha atual esta errada', async () => {
    comUsuario({ id: 'u-1', passwordHash: hash, isActive: true });

    await expect(
      service.trocarSenha('u-1', 'senha-errada', 'senha-nova-123'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(usersRepo.save).not.toHaveBeenCalled();
  });
});
