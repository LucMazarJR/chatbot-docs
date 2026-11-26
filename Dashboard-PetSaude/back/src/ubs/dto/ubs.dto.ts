import { ArrayMaxSize, ArrayMinSize, IsArray, IsMongoId, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Várias unidades de uma vez, uma por linha, como chegam de uma planilha.
 *
 * Cada nome passa pelas regras de criar(); o tamanho é conferido lá, para uma
 * linha ruim virar aviso na resposta em vez de recusar a lista inteira.
 */
export class CriarUbsEmLoteDto {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(200)
    @IsString({ each: true })
    @MaxLength(200, { each: true })
    nomes: string[];
}

export class SalvarUbsDto {
    @IsString()
    @MinLength(2)
    @MaxLength(60)
    nome: string;
}

export class DescartarGrafiaDto {
    @IsString()
    @MinLength(1)
    @MaxLength(60)
    chave: string;
}

export class CorrigirGrafiaDto extends DescartarGrafiaDto {
    @IsMongoId()
    ubsId: string;
}
