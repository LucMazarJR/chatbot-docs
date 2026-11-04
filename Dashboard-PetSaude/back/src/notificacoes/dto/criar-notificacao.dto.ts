import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsIn,
    IsISO8601,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';

import { DETALHE_MAXIMO } from '../regras';
import { TIPOS_DA_EQUIPE, type TipoDaEquipe } from '../tipos';

/** Teto de pessoas num envio só. Acima disto, o problema não é mais de validação. */
export const DESTINATARIOS_MAXIMO = 5000;

export class CriarNotificacaoDto {
    @IsIn(TIPOS_DA_EQUIPE)
    tipo: TipoDaEquipe;

    // O vazio é recusado no service, depois do trim: aqui um texto só com
    // espaços passaria.
    @IsString()
    @MaxLength(DETALHE_MAXIMO)
    detalhe: string;

    @IsOptional()
    @IsBoolean()
    mostrarDetalhe?: boolean;

    /** Todas as contas com avisos ativados. Exclui `destinatarios`. */
    @IsOptional()
    @IsBoolean()
    todos?: boolean;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(DESTINATARIOS_MAXIMO)
    @IsString({ each: true })
    @MaxLength(64, { each: true })
    destinatarios?: string[];

    /** Ausente = agora. */
    @IsOptional()
    @IsISO8601()
    enviarEm?: string;

    @IsISO8601()
    validaAte: string;
}
