import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// LÓGICA DO LUCIANO: o DTO precisa aceitar o que o front realmente manda.
// Ele valida com zod em faq.functions.ts e envia `categories` (array), sem
// nunca mandar `category`. Enquanto este DTO exigia `category: string`, ligar o
// ValidationPipe faria TODA criação de FAQ voltar 400. O service já lida com os
// dois formatos, então quem estava errado era o contrato.
export class CreateFaqDto {
    @IsString()
    @MinLength(5)
    @MaxLength(300)
    question: string;

    @IsString()
    @MinLength(5)
    @MaxLength(4000)
    answer: string;

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
