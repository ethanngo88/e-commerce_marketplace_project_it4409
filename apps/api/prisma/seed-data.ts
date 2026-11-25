/**
 * Dữ liệu mẫu cho `prisma/seed.ts` (T-09). Chỉ chứa dữ liệu, không truy cập database.
 *
 * Mật khẩu không nằm ở đây: seed đọc từ biến môi trường SEED_ADMIN_PASSWORD và
 * SEED_USER_PASSWORD (xem `.env.example`).
 *
 * Tên thương hiệu, sách và doanh nghiệp đều là tên giả.
 */

export const ROLE_NAMES = ['CUSTOMER', 'SELLER', 'ADMIN'] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export interface SeedCategory {
  slug: string;
  name: string;
  /** Mặc định true. Danh mục tắt không hiện ở `GET /api/categories`. */
  isActive?: boolean;
  children?: SeedCategory[];
}

export interface SeedVariant {
  sku: string;
  name: string;
  attributes: Record<string, string>;
  price: number;
  stock: number;
  /** Mặc định true. Variant tắt không được tính vào `min_price`. */
  isActive?: boolean;
}

export interface SeedProduct {
  slug: string;
  name: string;
  /** Slug của danh mục lá (danh mục có con không nhận sản phẩm, doc 03 mục 6.4). */
  categorySlug: string;
  description: string;
  /** Mặc định ACTIVE. */
  status?: 'ACTIVE' | 'DRAFT' | 'HIDDEN';
  variants: SeedVariant[];
}

export interface SeedUser {
  email: string;
  fullName: string;
  phone: string;
}

export interface SeedSeller {
  user: SeedUser;
  businessName: string;
  store: { name: string; slug: string; description: string };
  products: SeedProduct[];
}

// ---------------------------------------------------------------------------
// Danh mục: tối đa 2 cấp (doc 03 mục 6.4)
// ---------------------------------------------------------------------------

export const CATEGORY_TREE: SeedCategory[] = [
  {
    slug: 'thoi-trang-nam',
    name: 'Thời trang nam',
    children: [
      { slug: 'ao-nam', name: 'Áo nam' },
      { slug: 'quan-nam', name: 'Quần nam' },
      { slug: 'giay-nam', name: 'Giày nam' },
      { slug: 'dong-ho-nam', name: 'Đồng hồ nam', isActive: false },
    ],
  },
  {
    slug: 'thoi-trang-nu',
    name: 'Thời trang nữ',
    children: [
      { slug: 'vay-dam', name: 'Váy đầm' },
      { slug: 'ao-nu', name: 'Áo nữ' },
      { slug: 'tui-xach', name: 'Túi xách' },
    ],
  },
  {
    slug: 'dien-thoai-phu-kien',
    name: 'Điện thoại & Phụ kiện',
    children: [
      { slug: 'dien-thoai', name: 'Điện thoại' },
      { slug: 'tai-nghe', name: 'Tai nghe' },
      { slug: 'sac-cap', name: 'Sạc & Cáp' },
    ],
  },
  {
    slug: 'nha-cua-doi-song',
    name: 'Nhà cửa & Đời sống',
    children: [
      { slug: 'do-dung-nha-bep', name: 'Đồ dùng nhà bếp' },
      { slug: 'trang-tri-nha-cua', name: 'Trang trí nhà cửa' },
    ],
  },
  {
    slug: 'sach',
    name: 'Sách',
    children: [
      { slug: 'sach-van-hoc', name: 'Sách văn học' },
      { slug: 'sach-ky-nang', name: 'Sách kỹ năng' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Hàm tạo variant
// ---------------------------------------------------------------------------

type Option = readonly [label: string, code: string];

const COLOR = {
  den: ['Đen', 'DEN'],
  trang: ['Trắng', 'TRANG'],
  xam: ['Xám', 'XAM'],
  be: ['Be', 'BE'],
  xanh: ['Xanh', 'XANH'],
  navy: ['Xanh navy', 'NAVY'],
  do: ['Đỏ', 'DO'],
  hong: ['Hồng', 'HONG'],
  kem: ['Kem', 'KEM'],
  nau: ['Nâu', 'NAU'],
  bac: ['Bạc', 'BAC'],
} as const satisfies Record<string, Option>;

/** Tồn kho giảm dần theo thứ tự variant, để dữ liệu có cả số lớn, số nhỏ. */
function stockAt(base: number, index: number): number {
  return Math.max(0, base - (index % 4) * 3);
}

/** Sản phẩm không có biến thể vẫn có một variant mặc định (doc 03 mục 6.5). */
function single(sku: string, price: number, stock: number): SeedVariant[] {
  return [{ sku, name: 'Mặc định', attributes: {}, price, stock }];
}

/** Tổ hợp màu × size, cùng một giá. */
function colorSize(
  sku: string,
  price: number,
  stock: number,
  colors: Option[],
  sizes: string[],
): SeedVariant[] {
  return colors.flatMap(([color, code], colorIndex) =>
    sizes.map((size, sizeIndex) => ({
      sku: `${sku}-${code}-${size}`,
      name: `${color} / ${size}`,
      attributes: { Màu: color, Size: size },
      price,
      stock: stockAt(stock, colorIndex * sizes.length + sizeIndex),
    })),
  );
}

/** Một thuộc tính, mỗi lựa chọn có giá riêng. */
function byOption(
  sku: string,
  attribute: string,
  options: Array<[label: string, code: string, price: number]>,
  stock: number,
): SeedVariant[] {
  return options.map(([label, code, price], index) => ({
    sku: `${sku}-${code}`,
    name: label,
    attributes: { [attribute]: label },
    price,
    stock: stockAt(stock, index),
  }));
}

/** Một thuộc tính, mọi lựa chọn cùng giá. */
function sameOption(
  sku: string,
  attribute: string,
  options: Option[],
  price: number,
  stock: number,
): SeedVariant[] {
  return byOption(
    sku,
    attribute,
    options.map(([label, code]) => [label, code, price]),
    stock,
  );
}

const sizes = (...labels: string[]): Option[] =>
  labels.map((label) => [label, label]);

// ---------------------------------------------------------------------------
// Người bán, store và sản phẩm
// ---------------------------------------------------------------------------

export const SEED_SELLERS: SeedSeller[] = [
  {
    user: {
      email: 'seller1@example.com',
      fullName: 'Lê Minh An',
      phone: '0901000001',
    },
    businessName: 'Hộ kinh doanh An Fashion',
    store: {
      name: 'An Fashion',
      slug: 'an-fashion',
      description: 'Thời trang nam nữ cơ bản, chất liệu cotton, giao nhanh.',
    },
    products: [
      {
        slug: 'ao-thun-cotton-basic',
        name: 'Áo thun cotton basic',
        categorySlug: 'ao-nam',
        description:
          'Áo thun 100% cotton, form regular, thấm hút mồ hôi tốt. Phù hợp mặc hằng ngày.',
        variants: colorSize(
          'ATC',
          149000,
          30,
          [COLOR.den, COLOR.trang, COLOR.xam],
          ['M', 'L', 'XL'],
        ),
      },
      {
        slug: 'ao-thun-oversize-co-tron',
        name: 'Áo thun oversize cổ tròn',
        categorySlug: 'ao-nam',
        description:
          'Áo thun dáng rộng, vải dày dặn, không xù lông sau khi giặt.',
        variants: colorSize(
          'ATO',
          189000,
          20,
          [COLOR.den, COLOR.be],
          ['M', 'L'],
        ),
      },
      {
        slug: 'ao-so-mi-oxford-dai-tay',
        name: 'Áo sơ mi Oxford dài tay',
        categorySlug: 'ao-nam',
        description: 'Sơ mi vải Oxford, đứng form, phù hợp đi làm và đi chơi.',
        variants: colorSize(
          'SMO',
          329000,
          15,
          [COLOR.trang, COLOR.xanh],
          ['M', 'L', 'XL'],
        ),
      },
      {
        slug: 'ao-polo-pique',
        name: 'Áo polo vải pique',
        categorySlug: 'ao-nam',
        description: 'Áo polo cổ bẻ, vải pique thoáng khí, logo thêu nhỏ.',
        variants: colorSize(
          'POLO',
          259000,
          18,
          [COLOR.den, COLOR.navy],
          ['M', 'L'],
        ),
      },
      {
        slug: 'ao-khoac-gio-hai-lop',
        name: 'Áo khoác gió hai lớp',
        categorySlug: 'ao-nam',
        description: 'Áo khoác chống gió, chống nước nhẹ, có mũ tháo rời.',
        variants: colorSize(
          'AKG',
          459000,
          12,
          [COLOR.den, COLOR.xam],
          ['L', 'XL'],
        ),
      },
      {
        slug: 'ao-khoac-denim',
        name: 'Áo khoác denim',
        categorySlug: 'ao-nam',
        description:
          'Áo khoác jean wash nhẹ. Sản phẩm đang soạn, chưa đăng bán.',
        status: 'DRAFT',
        variants: sameOption('AKD', 'Size', sizes('M', 'L'), 499000, 10),
      },
      {
        slug: 'quan-jean-slim-fit',
        name: 'Quần jean slim fit',
        categorySlug: 'quan-nam',
        description: 'Quần jean co giãn nhẹ, ống côn, màu xanh đậm.',
        variants: sameOption(
          'QJS',
          'Size',
          sizes('29', '30', '31', '32'),
          399000,
          16,
        ),
      },
      {
        slug: 'quan-kaki-chinos',
        name: 'Quần kaki chinos',
        categorySlug: 'quan-nam',
        description: 'Quần kaki dáng chinos, vải mềm, dễ phối đồ.',
        variants: colorSize(
          'QKC',
          349000,
          14,
          [COLOR.be, COLOR.den],
          ['30', '31', '32'],
        ),
      },
      {
        slug: 'quan-short-the-thao',
        name: 'Quần short thể thao',
        categorySlug: 'quan-nam',
        description:
          'Quần short vải dù nhẹ, có túi khóa kéo, phù hợp tập luyện.',
        variants: sameOption('QST', 'Size', sizes('M', 'L', 'XL'), 159000, 25),
      },
      {
        slug: 'giay-sneaker-trang',
        name: 'Giày sneaker trắng',
        categorySlug: 'giay-nam',
        description: 'Giày sneaker da tổng hợp, đế cao su chống trơn.',
        variants: sameOption(
          'GSN',
          'Size',
          sizes('40', '41', '42', '43'),
          690000,
          10,
        ),
      },
      {
        // Hết hàng ở mọi variant: dùng để thử bộ lọc inStock và cảnh báo hết hàng trong giỏ.
        slug: 'giay-tay-da-bo',
        name: 'Giày tây da bò',
        categorySlug: 'giay-nam',
        description: 'Giày tây da bò thật, đế khâu. Tạm hết hàng.',
        variants: sameOption('GTD', 'Size', sizes('40', '41', '42'), 890000, 0),
      },
      {
        slug: 'vay-hoa-nhi-dang-xoe',
        name: 'Váy hoa nhí dáng xòe',
        categorySlug: 'vay-dam',
        description: 'Váy voan hoa nhí, có lót trong, dáng xòe nhẹ nhàng.',
        variants: sameOption('VHN', 'Size', sizes('S', 'M', 'L'), 299000, 12),
      },
      {
        slug: 'dam-cong-so-co-vuong',
        name: 'Đầm công sở cổ vuông',
        categorySlug: 'vay-dam',
        description: 'Đầm công sở dáng suông, cổ vuông, vải tuyết mưa.',
        variants: colorSize(
          'DCS',
          389000,
          10,
          [COLOR.den, COLOR.do],
          ['S', 'M'],
        ),
      },
      {
        slug: 'ao-thun-nu-croptop',
        name: 'Áo thun nữ croptop',
        categorySlug: 'ao-nu',
        description: 'Áo thun croptop co giãn bốn chiều, ôm vừa người.',
        variants: colorSize(
          'ATN',
          129000,
          22,
          [COLOR.trang, COLOR.hong],
          ['S', 'M'],
        ),
      },
      {
        slug: 'ao-so-mi-lua-nu',
        name: 'Áo sơ mi lụa nữ',
        categorySlug: 'ao-nu',
        description: 'Sơ mi lụa mềm, không nhăn, tay dài có thể xắn.',
        variants: [
          ...colorSize('SML', 279000, 9, [COLOR.trang, COLOR.be], ['S', 'M']),
          {
            // Variant đã tắt, giá thấp hơn: min_price của sản phẩm vẫn phải là 279.000đ.
            sku: 'SML-BE-L',
            name: 'Be / L',
            attributes: { Màu: 'Be', Size: 'L' },
            price: 199000,
            stock: 5,
            isActive: false,
          },
        ],
      },
      {
        slug: 'ao-len-co-lo',
        name: 'Áo len cổ lọ',
        categorySlug: 'ao-nu',
        description: 'Áo len dệt kim cổ lọ, giữ ấm tốt cho mùa đông.',
        variants: colorSize(
          'ALC',
          359000,
          8,
          [COLOR.kem, COLOR.nau],
          ['S', 'M'],
        ),
      },
      {
        slug: 'tui-tote-canvas',
        name: 'Túi tote canvas',
        categorySlug: 'tui-xach',
        description: 'Túi tote vải canvas dày, có ngăn nhỏ bên trong.',
        variants: sameOption('TTC', 'Màu', [COLOR.be, COLOR.den], 119000, 40),
      },
      {
        slug: 'tui-deo-cheo-da-pu',
        name: 'Túi đeo chéo da PU',
        categorySlug: 'tui-xach',
        description: 'Túi đeo chéo nhỏ gọn, dây đeo điều chỉnh được.',
        variants: sameOption('TDC', 'Màu', [COLOR.den, COLOR.nau], 249000, 15),
      },
    ],
  },
  {
    user: {
      email: 'seller2@example.com',
      fullName: 'Phạm Quốc Bình',
      phone: '0901000002',
    },
    businessName: 'Công ty TNHH Bình Minh Tech',
    store: {
      name: 'Bình Minh Tech',
      slug: 'binh-minh-tech',
      description:
        'Điện thoại, phụ kiện, đồ gia dụng và sách. Bảo hành 12 tháng.',
    },
    products: [
      {
        slug: 'dien-thoai-nova-x',
        name: 'Điện thoại Nova X',
        categorySlug: 'dien-thoai',
        description: 'Màn hình 6,5 inch, pin 5000mAh, camera kép 50MP.',
        variants: [
          ...byOption(
            'NOVAX-DEN',
            'Bộ nhớ',
            [
              ['128GB', '128', 5990000],
              ['256GB', '256', 6990000],
            ],
            8,
          ).map((variant) => ({
            ...variant,
            name: `Đen / ${variant.name}`,
            attributes: { Màu: 'Đen', ...variant.attributes },
          })),
          ...byOption(
            'NOVAX-XANH',
            'Bộ nhớ',
            [
              ['128GB', '128', 5990000],
              ['256GB', '256', 6990000],
            ],
            6,
          ).map((variant) => ({
            ...variant,
            name: `Xanh / ${variant.name}`,
            attributes: { Màu: 'Xanh', ...variant.attributes },
          })),
        ],
      },
      {
        slug: 'dien-thoai-lumen-a5',
        name: 'Điện thoại Lumen A5',
        categorySlug: 'dien-thoai',
        description: 'Điện thoại phổ thông màn hình 6,1 inch, pin bền cả ngày.',
        variants: byOption(
          'LUMA5',
          'Bộ nhớ',
          [
            ['64GB', '64', 2990000],
            ['128GB', '128', 3490000],
          ],
          12,
        ),
      },
      {
        slug: 'tai-nghe-bluetooth-chong-on',
        name: 'Tai nghe Bluetooth chống ồn',
        categorySlug: 'tai-nghe',
        description: 'Tai nghe chụp tai, chống ồn chủ động, pin 30 giờ.',
        variants: sameOption(
          'TNB',
          'Màu',
          [COLOR.den, COLOR.trang],
          1290000,
          10,
        ),
      },
      {
        slug: 'tai-nghe-nhet-tai-co-day',
        name: 'Tai nghe nhét tai có dây',
        categorySlug: 'tai-nghe',
        description: 'Tai nghe jack 3,5mm, có micro đàm thoại.',
        variants: single('TNCD', 99000, 60),
      },
      {
        // Hết hàng: dùng để thử bộ lọc inStock.
        slug: 'tai-nghe-gaming-rgb',
        name: 'Tai nghe gaming RGB',
        categorySlug: 'tai-nghe',
        description: 'Tai nghe gaming đèn RGB, âm thanh vòm 7.1. Tạm hết hàng.',
        variants: single('TNG', 790000, 0),
      },
      {
        slug: 'sac-nhanh-20w-usb-c',
        name: 'Củ sạc nhanh 20W USB-C',
        categorySlug: 'sac-cap',
        description: 'Củ sạc nhanh chuẩn PD 20W, nhỏ gọn.',
        variants: single('SN20', 189000, 50),
      },
      {
        slug: 'cap-usb-c-to-usb-c',
        name: 'Cáp USB-C to USB-C',
        categorySlug: 'sac-cap',
        description: 'Cáp bọc dù, hỗ trợ sạc nhanh 60W.',
        variants: byOption(
          'CUC',
          'Chiều dài',
          [
            ['1m', '1M', 79000],
            ['2m', '2M', 99000],
          ],
          45,
        ),
      },
      {
        // Tồn kho thấp (dưới ngưỡng 5): dùng để thử cảnh báo sắp hết hàng của Seller.
        slug: 'pin-sac-du-phong-10000mah',
        name: 'Pin sạc dự phòng 10000mAh',
        categorySlug: 'sac-cap',
        description:
          'Pin dự phòng 10000mAh, hai cổng ra, có đèn báo dung lượng.',
        variants: sameOption('PDP', 'Màu', [COLOR.den, COLOR.trang], 399000, 3),
      },
      {
        slug: 'noi-chien-khong-dau-5l',
        name: 'Nồi chiên không dầu 5L',
        categorySlug: 'do-dung-nha-bep',
        description: 'Nồi chiên không dầu dung tích 5 lít, hẹn giờ 60 phút.',
        variants: single('NCKD5', 1490000, 7),
      },
      {
        slug: 'bo-dao-inox-5-mon',
        name: 'Bộ dao inox 5 món',
        categorySlug: 'do-dung-nha-bep',
        description: 'Bộ dao thép không gỉ kèm giá đỡ gỗ.',
        variants: single('BDI5', 359000, 20),
      },
      {
        slug: 'binh-giu-nhiet-500ml',
        name: 'Bình giữ nhiệt 500ml',
        categorySlug: 'do-dung-nha-bep',
        description: 'Bình giữ nhiệt inox hai lớp, giữ nóng 12 giờ.',
        variants: sameOption(
          'BGN',
          'Màu',
          [COLOR.den, COLOR.bac, COLOR.hong],
          229000,
          25,
        ),
      },
      {
        slug: 'den-ngu-go-de-ban',
        name: 'Đèn ngủ gỗ để bàn',
        categorySlug: 'trang-tri-nha-cua',
        description: 'Đèn ngủ khung gỗ, ánh sáng vàng ấm, công tắc cảm ứng.',
        variants: single('DNG', 279000, 18),
      },
      {
        slug: 'tranh-canvas-phong-canh',
        name: 'Tranh canvas phong cảnh',
        categorySlug: 'trang-tri-nha-cua',
        description: 'Tranh in canvas phong cảnh biển, kèm khung gỗ.',
        variants: byOption(
          'TCP',
          'Kích thước',
          [
            ['40x60cm', '40X60', 320000],
            ['60x90cm', '60X90', 520000],
          ],
          9,
        ),
      },
      {
        slug: 'cay-xanh-mini-de-ban',
        name: 'Cây xanh mini để bàn',
        categorySlug: 'trang-tri-nha-cua',
        description: 'Chậu cây sen đá mini. Seller đang tạm ẩn sản phẩm này.',
        status: 'HIDDEN',
        variants: single('CXM', 89000, 30),
      },
      {
        slug: 'tieu-thuyet-mua-ha-cuoi-cung',
        name: 'Tiểu thuyết Mùa hạ cuối cùng',
        categorySlug: 'sach-van-hoc',
        description: 'Tiểu thuyết về tuổi học trò và những mùa hè đã qua.',
        variants: byOption(
          'TTMH',
          'Loại bìa',
          [
            ['Bìa mềm', 'MEM', 125000],
            ['Bìa cứng', 'CUNG', 185000],
          ],
          35,
        ),
      },
      {
        slug: 'tap-truyen-ngan-pho-cu',
        name: 'Tập truyện ngắn Phố cũ',
        categorySlug: 'sach-van-hoc',
        description:
          'Mười hai truyện ngắn về những con phố và con người Hà Nội.',
        variants: single('TTPC', 98000, 28),
      },
      {
        slug: 'sach-quan-ly-thoi-gian-hieu-qua',
        name: 'Sách Quản lý thời gian hiệu quả',
        categorySlug: 'sach-ky-nang',
        description: 'Các phương pháp lập kế hoạch và ưu tiên công việc.',
        variants: single('SQLTG', 139000, 40),
      },
      {
        slug: 'sach-giao-tiep-tu-tin',
        name: 'Sách Giao tiếp tự tin',
        categorySlug: 'sach-ky-nang',
        description:
          'Kỹ năng thuyết trình và giao tiếp trong học tập, công việc.',
        variants: single('SGTTT', 119000, 33),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Khách hàng mẫu
// ---------------------------------------------------------------------------

export const SEED_CUSTOMER: SeedUser & {
  address: {
    recipientName: string;
    phone: string;
    province: string;
    district: string;
    ward: string;
    street: string;
  };
} = {
  email: 'customer@example.com',
  fullName: 'Trần Thị Bình',
  phone: '0901000003',
  address: {
    recipientName: 'Trần Thị Bình',
    phone: '0901000003',
    province: 'Hà Nội',
    district: 'Quận Hai Bà Trưng',
    ward: 'Phường Bách Khoa',
    street: 'Số 12, ngõ 34 Tạ Quang Bửu',
  },
};

/** Số sản phẩm ACTIVE tối thiểu theo tiêu chí của T-09. */
export const MIN_ACTIVE_PRODUCTS = 30;
