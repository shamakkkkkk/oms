import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'SKU-003' })
  @IsString()
  @MinLength(2)
  sku: string;

  @ApiProperty({ example: 'USB-C Hub' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional({ example: '7-in-1 USB-C hub with HDMI and card reader.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 4999, description: 'Price in cents (EUR)' })
  @IsInt()
  @Min(0)
  priceCents: number;

  @ApiProperty({ example: 50, description: 'Units in stock' })
  @IsInt()
  @Min(0)
  stock: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
