import { Module } from '@nestjs/common';
import { ApprovedSellerGuard } from '../../common/guards/approved-seller.guard';
import { AdminSellersStatusController } from './admin-sellers-status.controller';
import { SellerStoreController } from './seller-store.controller';
import { SellersController } from './sellers.controller';
import { SellersService } from './sellers.service';
import { StoresController } from './stores.controller';

@Module({
  controllers: [
    SellersController,
    StoresController,
    SellerStoreController,
    AdminSellersStatusController,
  ],
  providers: [SellersService, ApprovedSellerGuard],
  exports: [SellersService, ApprovedSellerGuard],
})
export class SellersModule {}
