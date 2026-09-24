import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

/**
 * A single DTO covering pagination + all list filters for /products.
 * Combining these into one class (rather than several separate @Query()
 * parameters bound to different DTOs) avoids the global ValidationPipe's
 * whitelist rejecting fields that "belong" to a sibling DTO.
 */
export class ProductFilterDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Search by name or SKU' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Only return active (non-discontinued) products' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  activeOnly?: boolean;
}
