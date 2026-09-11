import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

import type { ModoBackfill } from '../embeddings.service';

const MODOS: ModoBackfill[] = [
    'faltantes',
    'desatualizados',
    'nao_registrados',
    'divergentes',
    'tudo',
];

export class BackfillDto {
    @IsIn(MODOS)
    modo: ModoBackfill;

    // Teto baixo de propósito. A cota gratuita do Gemini é de 1000 requisições
    // por dia POR PROJETO — as chaves extras do .env só ajudam se forem de
    // projetos diferentes. Um limite pequeno faz a pessoa ver o resultado antes
    // de gastar a cota do dia inteiro numa tacada.
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(2000)
    limite?: number;

    /**
     * Restringe o alvo a um assunto. Usado depois de renomear uma categoria,
     * para reindexar só as FAQs afetadas em vez da base inteira.
     */
    @IsOptional()
    @IsString()
    @MaxLength(60)
    categoria?: string;
}

export class DiagnosticoDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    quantidade?: number;
}
