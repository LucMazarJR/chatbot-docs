import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
    @IsEmail({}, { message: 'Informe um e-mail válido' })
    email: string;

    @IsString()
    @MinLength(1, { message: 'Informe a senha' })
    password: string;
}

export class ChangePasswordDto {
    @IsString()
    currentPassword: string;

    @IsString()
    @MinLength(8, { message: 'A nova senha precisa ter ao menos 8 caracteres' })
    newPassword: string;
}
