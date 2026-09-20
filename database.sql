-- MySQL 8.0+; utf8mb4 lưu tiếng Việt. Không xóa database/bảng có sẵn.
CREATE DATABASE IF NOT EXISTS cuuho_giaothong CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE cuuho_giaothong;

CREATE TABLE IF NOT EXISTS TaiKhoan (
  MaTaiKhoan INT PRIMARY KEY AUTO_INCREMENT,
  TenDangNhap VARCHAR(50) NOT NULL UNIQUE,
  MatKhau VARCHAR(255) NOT NULL,
  HoTen VARCHAR(100) NOT NULL,
  SoDienThoai VARCHAR(15),
  VaiTro ENUM('admin','nhanvien') NOT NULL,
  TrangThai ENUM('HoatDong','Khoa') NOT NULL DEFAULT 'HoatDong'
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS LoaiSuCo (
  MaLoai INT PRIMARY KEY AUTO_INCREMENT,
  TenLoai VARCHAR(100) NOT NULL,
  MoTa VARCHAR(255),
  TrangThai ENUM('HoatDong','Khoa') NOT NULL DEFAULT 'HoatDong'
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS YeuCauCuuHo (
  MaYeuCau INT PRIMARY KEY AUTO_INCREMENT,
  HoTen VARCHAR(100) NOT NULL,
  SoDienThoai VARCHAR(15) NOT NULL,
  LoaiXe VARCHAR(50) NOT NULL,
  BienSo VARCHAR(20),
  MaLoai INT NOT NULL,
  MoTa TEXT,
  ViDo DECIMAL(10,8) NOT NULL,
  KinhDo DECIMAL(11,8) NOT NULL,
  ThoiGianGui DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  MaNhanVien INT NULL,
  TrangThai ENUM('ChoTiepNhan','DaTiepNhan','DangXuLy','HoanThanh') NOT NULL DEFAULT 'ChoTiepNhan',
  ThoiGianCapNhat DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_yeucau_loai FOREIGN KEY (MaLoai) REFERENCES LoaiSuCo(MaLoai) ON DELETE RESTRICT,
  CONSTRAINT fk_yeucau_nhanvien FOREIGN KEY (MaNhanVien) REFERENCES TaiKhoan(MaTaiKhoan) ON DELETE RESTRICT,
  CONSTRAINT chk_vido CHECK (ViDo BETWEEN -90 AND 90),
  CONSTRAINT chk_kinhdo CHECK (KinhDo BETWEEN -180 AND 180),
  INDEX idx_trangthai_thoigian (TrangThai,ThoiGianGui),
  INDEX idx_sodienthoai (SoDienThoai)
) ENGINE=InnoDB;

INSERT INTO LoaiSuCo (MaLoai,TenLoai,MoTa) VALUES
  (1,'Thủng lốp','Lốp bị thủng hoặc mất áp suất'),
  (2,'Hết xăng','Phương tiện hết nhiên liệu'),
  (3,'Hết ắc quy','Không khởi động được do ắc quy'),
  (4,'Hỏng máy','Động cơ gặp trục trặc'),
  (5,'Sự cố khác','Các sự cố giao thông khác')
ON DUPLICATE KEY UPDATE MaLoai=VALUES(MaLoai);

-- Tài khoản mẫu được tạo bằng npm run seed (bcrypt.hash thật, không lưu mật khẩu thô).
-- Dữ liệu minh họa, số điện thoại không đại diện cho người thật.
INSERT INTO YeuCauCuuHo (HoTen,SoDienThoai,LoaiXe,BienSo,MaLoai,MoTa,ViDo,KinhDo)
SELECT 'Khách demo','0900000000','Xe máy','59-A1 000.00',1,'Xe bị thủng lốp, đang dừng sát lề đường.',10.7769,106.7009
WHERE NOT EXISTS (SELECT 1 FROM YeuCauCuuHo);
