import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AprovarSugestaoDto {
    @IsString()
    @MinLength(5)
    @MaxLength(300)
    question: string;

    @IsString()
    @MinLength(5)
    @MaxLength(4000)
    answer: string;

    @IsOptional()
    @IsString()
    @MaxLength(60)
    category?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    tags?: string[];

    // A mesma Referência do formulário de FAQ, e com o mesmo limite.
    @IsOptional()
    @IsString()
    @MaxLength(300)
    source?: string;
}

export class ListarSugestoesQueryDto {
    @IsOptional()
    @IsIn(['pendente', 'aprovada', 'descartada'])
    estado?: 'pendente' | 'aprovada' | 'descartada';
}
