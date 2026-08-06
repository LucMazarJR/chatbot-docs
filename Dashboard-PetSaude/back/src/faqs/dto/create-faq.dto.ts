import { IsString, IsArray } from 'class-validator';

export class CreateFaqDto {
    @IsString()
    question: string;

    @IsString()
    answer: string;

    @IsArray()
    @IsString({ each: true })
    tags: string[];

    @IsString()
    source: string;

    @IsString()
    category: string;
}
