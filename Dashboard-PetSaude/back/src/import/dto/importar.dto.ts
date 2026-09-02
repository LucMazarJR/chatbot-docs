import { Type } from 'class-transformer';
import {
    Allow,
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';

/**
 * Uma FAQ como o script de geração a devolveu.
 *
 * LÓGICA DO LUCIANO: os campos usam @Allow, não @IsString. Não é desleixo — o
 * ValidationPipe roda com `whitelist: true`, então sem decorador nenhum o campo
 * seria descartado em silêncio; e com @IsString, uma única linha em que o
 * script devolveu um número onde devia vir texto derrubaria a requisição
 * inteira com 400. A planilha de 300 linhas voltaria sem prévia e sem dizer
 * qual linha tem o problema.
 *
 * Quem valida é o service, linha a linha, com o motivo escrito para aparecer na
 * tela ao lado da linha errada. É o ponto da prévia existir.
 */
export class FaqImportadaDto {
    @Allow()
    question?: unknown;

    @Allow()
    answer?: unknown;

    @Allow()
    category?: unknown;

    @Allow()
    tags?: unknown;

    @Allow()
    source?: unknown;

    /** Linha ou parágrafo de origem, para a prévia apontar o lugar no arquivo. */
    @Allow()
    linha?: unknown;
}

export class ValidarImportacaoDto {
    @IsArray()
    // Teto para o corpo da requisição não virar um jeito barato de ocupar a
    // API. Documento maior que isso deve ser dividido — e quem tem 2000 FAQs
    // num arquivo só provavelmente juntou coisas que não deviam estar juntas.
    @ArrayMaxSize(2000)
    @ValidateNested({ each: true })
    @Type(() => FaqImportadaDto)
    faqs: FaqImportadaDto[];
}

export class CommitImportacaoDto {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(2000)
    @ValidateNested({ each: true })
    @Type(() => FaqImportadaDto)
    faqs: FaqImportadaDto[];

    @IsString()
    @MaxLength(255)
    nomeArquivo: string;

    // Gravados em cada FAQ. Guardar a versão junto do id é o que permite
    // descobrir depois que um lote inteiro saiu torto por causa de uma regra
    // que já foi trocada desde então.
    @IsUUID()
    scriptId: string;

    @IsInt()
    @Min(1)
    scriptVersion: number;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    tipoArquivo?: string;
}
