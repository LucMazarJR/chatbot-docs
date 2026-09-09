import { IsIn, IsOptional } from 'class-validator';

import type { FiltroSituacao, FiltroVersao, Periodo } from '../conversas.service';

export const PERIODOS: Periodo[] = ['hoje', '7d', '30d', 'tudo'];
export const VERSOES: FiltroVersao[] = ['a', 'b', 'todas'];
export const SITUACOES: FiltroSituacao[] = [
    'validas',
    'todas',
    'negativos',
    'nota-baixa',
    'sem-resposta',
    'com-erro',
];

export class ListarConversasQueryDto {
    // Valor desconhecido cai no padrão em vez de recusar a requisição: é uma
    // tela de leitura, e um filtro digitado errado na URL não deve virar 400.
    @IsOptional()
    @IsIn(PERIODOS)
    periodo?: Periodo;

    @IsOptional()
    @IsIn(VERSOES)
    versao?: FiltroVersao;

    // O filtro de situação NÃO vale para as estatísticas, só para a lista: se
    // valesse, "3 conversas com polegar para baixo" viraria "100% com polegar
    // para baixo".
    @IsOptional()
    @IsIn(SITUACOES)
    situacao?: FiltroSituacao;
}
