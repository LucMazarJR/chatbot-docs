import { IsString } from 'class-validator';

// Mesmo motivo do UpdateFaqDto: sem o `id` declarado, o whitelist o removeria.
export class DeleteFaqDto {
    @IsString()
    id: string;
}
