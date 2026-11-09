import { IsMongoId, IsString, MaxLength, MinLength } from 'class-validator';

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
