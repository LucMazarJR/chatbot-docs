import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/**
 * O que cada pessoa muda na própria conta, em Minha conta.
 *
 * Ausente é "não mexer"; `revisaoPadraoDias: null` desliga o padrão. E-mail e
 * grupo não estão aqui de propósito: o e-mail é o login, e o grupo é o acesso,
 * e os dois ficam com quem cuida das contas.
 */
export class AtualizarPerfilDto {
    @IsOptional()
    @IsString()
    @MinLength(2, { message: 'O nome precisa de ao menos 2 letras.' })
    @MaxLength(120, { message: 'O nome pode ter até 120 caracteres.' })
    name?: string;

    @IsOptional()
    @IsInt({ message: 'O prazo de revisão precisa ser um número de dias.' })
    @Min(1, { message: 'O prazo de revisão precisa ser de ao menos 1 dia.' })
    @Max(730, { message: 'O prazo de revisão pode ser de até 2 anos.' })
    revisaoPadraoDias?: number | null;
}
