import {
    IsEmail,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
  } from 'class-validator';
  
  export class CreateUserDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    name!: string;
  
    @IsEmail()
    email!: string;
  
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(150)
    age?: number;
  }