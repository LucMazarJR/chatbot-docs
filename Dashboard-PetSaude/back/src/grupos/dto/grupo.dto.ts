import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * As permissões chegam como objeto solto e são conferidas área por área no
 * serviço (`normalizarPermissoes`), que devolve a frase de cada erro. Validar
 * aqui com decorators exigiria repetir o catálogo de áreas.
 */
export class CriarGrupoDto {
    @IsString()
    @MinLength(2, { message: 'O nome do grupo precisa de ao menos 2 letras.' })
    @MaxLength(60, { message: 'O nome do grupo pode ter até 60 caracteres.' })
    nome: string;

    @IsOptional()
    @IsString()
    @MaxLength(200, { message: 'A descrição pode ter até 200 caracteres.' })
    descricao?: string;

    @IsObject({ message: 'Marque o acesso de cada item do menu.' })
    permissoes: Record<string, unknown>;
}

export class AtualizarGrupoDto {
    @IsOptional()
    @IsString()
    @MinLength(2, { message: 'O nome do grupo precisa de ao menos 2 letras.' })
    @MaxLength(60, { message: 'O nome do grupo pode ter até 60 caracteres.' })
    nome?: string;

    @IsOptional()
    @IsString()
    @MaxLength(200, { message: 'A descrição pode ter até 200 caracteres.' })
    descricao?: string;

    @IsOptional()
    @IsObject({ message: 'Marque o acesso de cada item do menu.' })
    permissoes?: Record<string, unknown>;
}
