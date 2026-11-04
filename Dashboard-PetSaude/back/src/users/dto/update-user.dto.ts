import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { USER_ROLES, type UserRole } from '../entities/user.entity';

export class UpdateUserDto {
    @IsOptional()
    @IsString()
    @MinLength(2)
    @MaxLength(120)
    name?: string;

    @IsOptional()
    @IsEmail({}, { message: 'Informe um e-mail válido' })
    @MaxLength(160)
    email?: string;

    @IsOptional()
    @IsIn(USER_ROLES, { message: 'Papel inválido' })
    role?: UserRole;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

export class SetPasswordDto {
    @IsString()
    @MinLength(8, { message: 'A senha precisa ter ao menos 8 caracteres' })
    newPassword: string;
}
