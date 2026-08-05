import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Dispensa o `ApiKeyGuard` na rota (usado só pelos health checks). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
