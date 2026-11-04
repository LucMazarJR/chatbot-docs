import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { USER_ROLES, type UserRole } from '../entities/user.entity';

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

    @IsOptional()
    @IsIn(USER_ROLES, { message: 'Papel inválido' })
    role?: UserRole;
}
