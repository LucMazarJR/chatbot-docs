import { Matches } from 'class-validator';

export class GerarRelatorioDto {
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Escolha o dia no formato AAAA-MM-DD.' })
    data: string;
}
