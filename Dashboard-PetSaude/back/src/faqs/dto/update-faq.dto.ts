import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// LÓGICA DO LUCIANO: o `id` PRECISA estar declarado aqui. Com whitelist ligado,
// o ValidationPipe remove toda propriedade que não pertença ao DTO — sem esta
// classe, `body.id` chegaria undefined no controller, o findById(undefined)
// estouraria um CastError do Mongoose e toda edição viraria erro 500.
export class UpdateFaqDto {
    @IsString()
    id: string;

    @IsOptional()
    @IsString()
    @MinLength(5)
    @MaxLength(300)
    question?: string;

    @IsOptional()
    @IsString()
    @MinLength(5)
    @MaxLength(4000)
    answer?: string;

    @IsOptional()
    @IsString()
    @MaxLength(60)
    category?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    categories?: string[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    tags?: string[];

    @IsOptional()
    @IsString()
    @MaxLength(300)
    source?: string;
}
