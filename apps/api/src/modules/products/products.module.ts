import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { SellersModule } from '../sellers/sellers.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { SellerProductsController } from './seller-products.controller';
import { SellerProductsService } from './seller-products.service';

@Module({
  imports: [CategoriesModule, SellersModule],
  controllers: [ProductsController, SellerProductsController],
  providers: [ProductsService, SellerProductsService],
  exports: [ProductsService, SellerProductsService],
})
export class ProductsModule {}
