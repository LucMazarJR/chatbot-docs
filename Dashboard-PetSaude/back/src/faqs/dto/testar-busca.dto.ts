import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class TestarBuscaDto {
    @IsString()
    @MinLength(2)
    @MaxLength(300)
    pergunta: string;

    /**
     * Quantos trechos devolver. O padrão é o `topK` do nó do n8n — mudar faz a
     * tela deixar de reproduzir o chatbot, então o teto é baixo de propósito.
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(25)
    topK?: number;
}
