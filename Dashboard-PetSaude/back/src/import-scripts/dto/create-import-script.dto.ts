import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Nova versão do script de geração.
 *
 * LÓGICA DO LUCIANO: o backend não interpreta o script — quem executa é o
 * navegador, num iframe isolado. Então não há o que validar aqui além de
 * tamanho e tipo. Validar sintaxe exigiria um parser de JavaScript no servidor,
 * e o único ganho seria adiantar um erro que a tela de teste já mostra antes de
 * salvar, com a linha e a mensagem do próprio motor.
 */
export class CreateImportScriptDto {
    @IsString()
    @MinLength(3)
    @MaxLength(120)
    name: string;

    // 256 KB. Um parser com comentários fica na casa dos 10 KB; o teto existe
    // para o corpo da requisição não virar um jeito barato de encher a tabela.
    @IsString()
    @MinLength(1)
    @MaxLength(262144)
    code: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    notes?: string;
}
