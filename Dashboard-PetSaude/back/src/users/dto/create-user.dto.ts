import { IsEmail, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
    @IsString()
    @MinLength(2)
    @MaxLength(120)
    name: string;

    @IsEmail({}, { message: 'Informe um e-mail válido' })
    @MaxLength(160)
    email: string;

    @IsString()
    @MinLength(8, { message: 'A senha precisa ter ao menos 8 caracteres' })
    password: string;

    @IsUUID('all', { message: 'Escolha o grupo da pessoa.' })
    grupoId: string;
}
